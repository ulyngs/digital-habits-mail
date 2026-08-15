//! Printing, on macOS.
//!
//! `window.print()` in a WKWebView returns and does nothing. WebKit leaves
//! JS-initiated printing to the embedding app, and raises no error when there
//! is nobody to handle it — measured in this app: the print iframe loads, the
//! call returns, and `beforeprint` never fires. The same code in a browser
//! opens the dialog.
//!
//! So the document is loaded into a window of its own and handed to
//! `NSPrintOperation`, which is what opens the macOS print panel. The page
//! builds the document (see `print-document.ts`); nothing here knows what a
//! message looks like.
//!
//! The window is off-screen rather than hidden. A window with no frame does
//! not lay out, and a web view that never laid out paginates to nothing.

#![cfg(target_os = "macos")]

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::msg_send;
use objc2_app_kit::{NSPrintInfo, NSPrintOperation};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// `dhprint://localhost/<id>` — the document waiting under that id.
pub const SCHEME: &str = "dhprint";

/// Roughly A4/Letter at 96dpi. The web view paginates against its own width,
/// so a window sized like a page keeps the line breaks close to the paper.
const PAGE_WIDTH: f64 = 816.0;
const PAGE_HEIGHT: f64 = 1056.0;

/// Documents built by the page, waiting for their window to ask for them.
fn pending() -> &'static Mutex<HashMap<String, String>> {
  static PENDING: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
  PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The document for a protocol request path, if one is waiting.
pub fn document_for_path(path: &str) -> Option<String> {
  let id = path.trim_start_matches('/');
  if id.is_empty() {
    return None;
  }
  pending().lock().ok()?.get(id).cloned()
}

/// Open the macOS print panel for an HTML document.
#[tauri::command]
pub async fn print_document(app: AppHandle, html: String) -> Result<(), String> {
  if html.trim().is_empty() {
    return Err("nothing to print".into());
  }

  static NEXT_ID: AtomicU64 = AtomicU64::new(1);
  let id = format!("d{}", NEXT_ID.fetch_add(1, Ordering::SeqCst));
  let label = format!("print-{id}");

  pending()
    .lock()
    .map_err(|_| "print queue unavailable".to_string())?
    .insert(id.clone(), html);

  let url = format!("{SCHEME}://localhost/{id}")
    .parse()
    .map_err(|_| "could not address the print document".to_string())?;

  let cleanup_id = id.clone();
  let build = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
    .title("Print")
    .inner_size(PAGE_WIDTH, PAGE_HEIGHT)
    // Off the screen, not hidden. See the note at the top of this file.
    .position(-20000.0, -20000.0)
    .decorations(false)
    .skip_taskbar(true)
    .focused(false)
    .on_page_load(move |webview, payload| {
      if payload.event() != PageLoadEvent::Finished {
        return;
      }
      let Some(window) = webview.app_handle().get_webview_window(webview.label()) else {
        return;
      };
      let id = cleanup_id.clone();
      // AppKit is main-thread only.
      let _ = webview.app_handle().run_on_main_thread(move || {
        show_print_panel(&window);
        if let Ok(mut waiting) = pending().lock() {
          waiting.remove(&id);
        }
        let _ = window.close();
      });
    })
    .build();

  if let Err(err) = build {
    if let Ok(mut waiting) = pending().lock() {
      waiting.remove(&id);
    }
    return Err(err.to_string());
  }
  Ok(())
}

/// Run the print panel for a window's web view, and block until it is done.
fn show_print_panel(window: &tauri::WebviewWindow) {
  let result = window.with_webview(|platform| {
    let webview = platform.inner() as *mut AnyObject;
    if webview.is_null() {
      log::warn!("print: no web view behind the window");
      return;
    }
    // Safety: the pointer is the window's live WKWebView, and this runs on the
    // main thread, which is where AppKit requires it.
    unsafe {
      let info = NSPrintInfo::sharedPrintInfo();
      let operation: Option<Retained<NSPrintOperation>> =
        msg_send![webview, printOperationWithPrintInfo: &*info];
      let Some(operation) = operation else {
        log::warn!("print: the web view gave no print operation");
        return;
      };
      operation.setShowsPrintPanel(true);
      operation.setShowsProgressPanel(true);
      // Runs the panel and waits for it, so the window outlives the print.
      operation.runOperation();
    }
  });
  if let Err(err) = result {
    log::warn!("print: {err}");
  }
}
