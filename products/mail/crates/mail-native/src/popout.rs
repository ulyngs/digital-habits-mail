//! The chat popouts: a thread as a small always-on-top window.
//!
//! Both hosts have them. The mail interface asks for one, and the popout is
//! the same document the interface came from, told to render one thread
//! (`index.html?popout=1&…`). See `apps/mail/src/main.tsx`.

use tauri::Manager;

/// Origins the team shell may treat as its own.
///
/// Not the standalone build: its interface is served from the app itself, on a
/// custom scheme, and everything guarded here belongs to the thin shell — the
/// boot splash overlay and the chat popout, which both assume a server routing
/// the URLs they build.
const CHAT_POPOUT_WIDTH: f64 = 380.0;
const CHAT_POPOUT_EXPANDED_HEIGHT: f64 = 560.0;
const CHAT_POPOUT_COLLAPSED_HEIGHT: f64 = 72.0;

/// One popout per thread. Tauri labels only allow [a-zA-Z0-9-/:_], so
/// percent-encode the account|thread pair and swap the leftovers.
fn chat_popout_label(account: &str, thread_id: &str) -> String {
  let safe = urlencoding::encode(&format!("{account}|{thread_id}"))
    .replace('%', "_")
    .replace('.', "_2E")
    .replace('~', "_7E");
  format!("chat-{safe}")
}

/// Where a popped-out thread reads its window from.
///
/// The team build asks a server for a page, and the server routes the path.
/// The standalone has no server and no router: one index.html answers
/// everything, so the popout is that same document told to render something
/// else, and `popout=1` is what tells it. Sending the standalone to
/// `/mail-popout` gets nothing back.
///
/// Every value is percent-encoded. A subject line is written by whoever sent
/// the message, and it lands in a URL.
#[allow(clippy::too_many_arguments)]
fn popout_url(
  origin: &str,
  account: &str,
  thread_id: &str,
  name: &str,
  email: &str,
  subject: &str,
) -> String {
  let query = format!(
    "account={}&thread={}&name={}&email={}&subject={}",
    urlencoding::encode(account),
    urlencoding::encode(thread_id),
    urlencoding::encode(name),
    urlencoding::encode(email),
    urlencoding::encode(subject),
  );
  format!("{origin}/index.html?popout=1&{query}")
}

/// Open (or refocus) an always-on-top floating chat window for a mail thread.
/// The window loads `/mail-popout` on the same origin as the invoking window,
/// so it talks to the same origin as the main window.
#[tauri::command]
pub async fn open_chat_popout(
  app: tauri::AppHandle,
  webview: tauri::Webview,
  account: String,
  thread_id: String,
  name: String,
  email: String,
  subject: String,
  user_agent: String,
) -> Result<(), String> {
  use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

  // The document that opened the popout is the document the popout shows,
  // told to render something else. Its directory is where index.html is:
  // tauri://localhost/ in the standalone, tauri://localhost/mail/ in the
  // Planner Mac app's pane, a Vite port in development. So the popout URL
  // is that directory's index.html, whatever the origin.
  let current = webview.url().map_err(|e| e.to_string())?;
  let base = current
    .join("index.html")
    .map_err(|e| format!("Bad popout base: {e}"))?;
  let mut origin = base.to_string();
  if let Some(idx) = origin.rfind("/index.html") {
    origin.truncate(idx);
  }
  let label = chat_popout_label(&account, &thread_id);
  if let Some(existing) = app.get_webview_window(&label) {
    let _ = existing.show();
    let _ = existing.set_focus();
    return Ok(());
  }

  let url = popout_url(
    &origin,
    &account,
    &thread_id,
    &name,
    &email,
    &subject,
  );
  let parsed: tauri::Url = url.parse().map_err(|e| format!("Bad popout URL: {e}"))?;

  let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
    .title(name.clone())
    .inner_size(CHAT_POPOUT_WIDTH, CHAT_POPOUT_EXPANDED_HEIGHT)
    .min_inner_size(300.0, CHAT_POPOUT_COLLAPSED_HEIGHT)
    .resizable(true)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .zoom_hotkeys_enabled(false)
    // Let a dropped file reach the page.
    //
    // Tauri handles the drop itself unless told not to, and then the webview
    // never sees a dragenter or a drop at all — so attaching a file by
    // dragging it onto this window did nothing. The main window is told not
    // to in tauri.conf.json (`dragDropEnabled: false`); a window built here
    // does not inherit that, and has to say so itself.
    .disable_drag_drop_handler()
    .user_agent(&user_agent);

  // Top-right of the current monitor, cascading per open popout.
  if let Ok(Some(monitor)) = webview.window().current_monitor() {
    let scale = monitor.scale_factor();
    let size = monitor.size().to_logical::<f64>(scale);
    let pos = monitor.position().to_logical::<f64>(scale);
    let cascade = (app
      .webview_windows()
      .keys()
      .filter(|k| k.starts_with("chat-"))
      .count() as f64)
      * 28.0;
    builder = builder.position(
      pos.x + size.width - CHAT_POPOUT_WIDTH - 24.0 - cascade,
      pos.y + 96.0 + cascade,
    );
  }

  let popout = builder.build().map_err(|e| e.to_string())?;
  // Fully transparent window background; the page draws its own rounded card.
  let _ = popout.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
  let _ = popout.set_focus();
  Ok(())
}

/// Collapse/expand the popout from inside the popout page.
#[tauri::command]
pub fn resize_chat_popout(
  window: tauri::WebviewWindow,
  width: f64,
  height: f64,
) -> Result<(), String> {
  if !window.label().starts_with("chat-") {
    return Err("Not a chat popout window".into());
  }
  let width = width.clamp(300.0, 720.0);
  let height = height.clamp(CHAT_POPOUT_COLLAPSED_HEIGHT, 900.0);
  window
    .set_size(tauri::LogicalSize::new(width, height))
    .map_err(|e| e.to_string())
}

/// Is a pop-out already open for this thread?
///
/// Asked by the main window, which shows a strip in place of the reply
/// composer while one is. The window list is the answer rather than a note we
/// keep: a note can be left behind by a crash, and a window that is gone
/// cannot lie about being there.
#[tauri::command]
pub fn chat_popout_open(app: tauri::AppHandle, account: String, thread_id: String) -> bool {
  app
    .get_webview_window(&chat_popout_label(&account, &thread_id))
    .is_some()
}

/// Bring the pop-out for this thread to the front. "Show", from the strip.
#[tauri::command]
pub fn focus_chat_popout(
  app: tauri::AppHandle,
  account: String,
  thread_id: String,
) -> Result<(), String> {
  let Some(window) = app.get_webview_window(&chat_popout_label(&account, &thread_id))
  else {
    return Ok(());
  };
  let _ = window.unminimize();
  window.set_focus().map_err(|e| e.to_string())
}

/// "Bring back": ask the pop-out to hand its draft over and close itself.
///
/// Asked of the window rather than done to it. The pop-out is the only one
/// that knows what has been typed in it, and closing it from out here would
/// take that with it — the same handover Escape already does, asked for from
/// somewhere else.
#[tauri::command]
pub fn hand_back_chat_popout(
  app: tauri::AppHandle,
  account: String,
  thread_id: String,
) -> Result<(), String> {
  use tauri::Emitter;
  let Some(window) = app.get_webview_window(&chat_popout_label(&account, &thread_id))
  else {
    return Ok(());
  };
  // To that window and no other. `emit` goes to every window, so one thread
  // handed back would close every pop-out that was open.
  window
    .emit_to(window.label(), "chat-popout-hand-back", ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_chat_popout(window: tauri::WebviewWindow) -> Result<(), String> {
  if !window.label().starts_with("chat-") {
    return Err("Not a chat popout window".into());
  }
  window.close().map_err(|e| e.to_string())
}

/// A popout sent mail — tell every window so the main inbox refreshes now
/// (WKWebView doesn't reliably fire cross-window `storage` events).
#[tauri::command]
pub fn notify_mail_sent(
  app: tauri::AppHandle,
  account: String,
  thread_id: String,
) -> Result<(), String> {
  use tauri::Emitter;
  app
    .emit(
      "mail-sent",
      serde_json::json!({ "account": account, "threadId": thread_id }),
    )
    .map_err(|e| e.to_string())
}

/**
 * Ask the main window to forward a message.
 *
 * The chat popout has no recipient picker and no subject line, so it cannot
 * forward anything itself. It sends the request here instead, and the window
 * that does have a composer picks it up and comes to the front.
 */
#[tauri::command]
pub fn notify_mail_forward(
  app: tauri::AppHandle,
  account: String,
  thread_id: String,
  message_id: String,
) -> Result<(), String> {
  use tauri::{Emitter, Manager};
  if let Some(main) = app.get_webview_window("main") {
    let _ = main.unminimize();
    let _ = main.show();
    let _ = main.set_focus();
  }
  app
    .emit(
      "mail-forward",
      serde_json::json!({
        "account": account,
        "threadId": thread_id,
        "messageId": message_id,
      }),
    )
    .map_err(|e| e.to_string())
}


#[cfg(test)]
mod popout_tests {
  use super::*;

  fn parse(url: &str) -> url::Url {
    url::Url::parse(url).expect("a real URL")
  }

  #[test]
  fn the_standalone_gets_the_one_document_it_serves() {
    let url = popout_url(
      "tauri://localhost", "me@x.com", "t1", "A Person", "u@x.com", "test",
    );
    let parsed = parse(&url);
    // A path is a route, and this build has no router to answer one.
    assert_eq!(parsed.path(), "/index.html");
    let q: Vec<(String, String)> = parsed
      .query_pairs()
      .map(|(k, v)| (k.into_owned(), v.into_owned()))
      .collect();
    assert!(q.contains(&("popout".into(), "1".into())), "{url}");
    assert!(q.contains(&("account".into(), "me@x.com".into())));
    assert!(q.contains(&("thread".into(), "t1".into())));
  }

  #[test]
  fn a_sender_cannot_write_extra_parameters_into_the_url() {
    // The subject comes from the message. Left raw, "&popout=0" or a "#" would
    // change what the window opens.
    let url = popout_url(
      "tauri://localhost", "me@x.com", "t/1?x=y",
      "A & B", "u@x.com", "hi&popout=0#frag",
    );
    let parsed = parse(&url);
    assert_eq!(parsed.fragment(), None, "{url}");
    let subject: Vec<String> = parsed
      .query_pairs()
      .filter(|(k, _)| k == "subject")
      .map(|(_, v)| v.into_owned())
      .collect();
    assert_eq!(subject, vec!["hi&popout=0#frag".to_string()]);
    let popout: Vec<String> = parsed
      .query_pairs()
      .filter(|(k, _)| k == "popout")
      .map(|(_, v)| v.into_owned())
      .collect();
    assert_eq!(popout, vec!["1".to_string()], "only the app sets this");
    let thread: Vec<String> = parsed
      .query_pairs()
      .filter(|(k, _)| k == "thread")
      .map(|(_, v)| v.into_owned())
      .collect();
    assert_eq!(thread, vec!["t/1?x=y".to_string()]);
  }
}
