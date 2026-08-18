use tauri::webview::PageLoadEvent;
use tauri::Manager;

#[cfg(target_os = "macos")]
mod menu;

// The native side of mail lives in the shared crate; see products/mail/crates.
#[cfg(target_os = "macos")]
use mail_native::{contacts, magnify, printing};
use mail_native::{downloads, oauth};

/// Write an .ics invite to a temp file and open it with the OS calendar app.
#[tauri::command]
fn open_calendar_invite(filename: String, content: String) -> Result<(), String> {
  let mut safe = filename
    .trim()
    .chars()
    .map(|c| {
      if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
        c
      } else {
        '_'
      }
    })
    .collect::<String>();
  if safe.is_empty() {
    safe = "invite.ics".into();
  }
  if !safe.to_ascii_lowercase().ends_with(".ics") {
    safe.push_str(".ics");
  }
  let path = std::env::temp_dir().join(safe);
  std::fs::write(&path, content.as_bytes())
    .map_err(|e| format!("Couldn't write invite: {e}"))?;

  let status = {
    #[cfg(target_os = "macos")]
    {
      std::process::Command::new("open").arg(&path).status()
    }
    #[cfg(target_os = "windows")]
    {
      std::process::Command::new("cmd")
        .args(["/C", "start", "", &path.to_string_lossy()])
        .status()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
      std::process::Command::new("xdg-open").arg(&path).status()
    }
  };
  match status {
    Ok(s) if s.success() => Ok(()),
    Ok(s) => Err(format!("open exited with {s}")),
    Err(e) => Err(format!("Couldn't open invite: {e}")),
  }
}

/**
 * Bring the main window back when the dock icon is clicked.
 *
 * Closing it does not end the app while a chat popout is still open, and a
 * popout has no way of opening it — so the app was running with no way back
 * into it. macOS asks about this through applicationShouldHandleReopen, which
 * Tauri reports as `RunEvent::Reopen`.
 *
 * Closing a window destroys it rather than hiding it, so most of the time
 * there is nothing to show and it has to be built again. It is built from the
 * same configuration the app starts with, so the window that comes back is
 * the window that went.
 */
#[cfg(target_os = "macos")]
fn show_main_window(app: &tauri::AppHandle) {
  use tauri::{Manager, WebviewWindowBuilder};

  if let Some(main) = app.get_webview_window("main") {
    let _ = main.unminimize();
    let _ = main.show();
    let _ = main.set_focus();
    return;
  }

  let Some(config) = app
    .config()
    .app
    .windows
    .iter()
    .find(|w| w.label == "main")
    .or_else(|| app.config().app.windows.first())
    .cloned()
  else {
    log::warn!("reopen: no window configuration to rebuild the main window from");
    return;
  };

  match WebviewWindowBuilder::from_config(app, &config)
    .and_then(|builder| builder.build())
  {
    Ok(window) => {
      let _ = window.show();
      let _ = window.set_focus();
    }
    Err(err) => log::warn!("reopen: could not rebuild the main window: {err}"),
  }
}

fn splash_overlay_js() -> String {
  let logo = include_str!("../splash/logo.b64");
  let inner_html = format!(
    r#"<style>
#dh-mail-splash{{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:var(--dh-splash-bg,#faf8f5);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;transition:opacity .25s ease;-webkit-app-region:drag}}
#dh-mail-splash,#dh-mail-splash *{{-webkit-app-region:drag}}
#dh-mail-splash .stack{{display:flex;flex-direction:column;align-items:center;gap:1.5rem}}
#dh-mail-splash img{{width:88px;height:88px;border-radius:22px;box-shadow:0 10px 30px var(--dh-splash-shadow,rgba(28,25,23,.12))}}
#dh-mail-splash .spinner{{width:28px;height:28px;border-radius:999px;border:2.5px solid var(--dh-splash-track,rgba(28,25,23,.12));border-top-color:#2a9d8f;animation:dh-spin .75s linear infinite}}
#dh-mail-splash .label{{margin:0;font-size:13px;letter-spacing:.02em;color:var(--dh-splash-fg,rgba(28,25,23,.65))}}
@keyframes dh-spin{{to{{transform:rotate(360deg)}}}}
</style>
<div class="stack" data-tauri-drag-region>
  <img src="data:image/png;base64,{logo}" alt="" width="88" height="88" data-tauri-drag-region/>
  <div class="spinner" aria-hidden="true" data-tauri-drag-region></div>
  <p class="label" data-tauri-drag-region>Opening Digital Habits: Mail…</p>
</div>"#,
    logo = logo
  );
  let html_json = serde_json::to_string(&inner_html).unwrap_or_else(|_| "''".into());
  format!(
    r#"(function () {{
  if (document.getElementById('dh-mail-splash')) return;
  var root = document.documentElement;
  /*
    System counts as dark when the system is dark.

    The stored value is what the reader picked, and what most of them pick
    is nothing: "System" is the default, and it is written as `system` or
    not written at all. Testing only for `dark` therefore gave a cream
    splash to every reader on a dark Mac who had never opened Settings —
    which is nearly all of them.
  */
  var dark = false;
  try {{
    var picked = localStorage.getItem('redd-plan-mail-color-mode');
    dark =
      picked === 'dark' ||
      ((!picked || picked === 'system') &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
  }} catch (_) {{}}
  var host = document.createElement('div');
  host.id = 'dh-mail-splash';
  host.setAttribute('data-tauri-drag-region', '');
  if (dark) {{
    // The chrome the app opens into, so the splash does not hand over to a
    // different shade of navy.
    host.style.setProperty('--dh-splash-bg', '#1a2735');
    host.style.setProperty('--dh-splash-fg', 'rgba(255,255,255,.7)');
    host.style.setProperty('--dh-splash-track', 'rgba(255,255,255,.2)');
    host.style.setProperty('--dh-splash-shadow', 'rgba(0,0,0,.28)');
  }}
  host.innerHTML = {html_json};
  (document.body || root).appendChild(host);
  if (!document.body) {{
    document.addEventListener('DOMContentLoaded', function () {{
      if (host.parentNode !== document.body && document.body) {{
        document.body.appendChild(host);
      }}
    }});
  }}
}})();"#
  )
}

fn splash_hide_js() -> &'static str {
  r#"(function () {
  setTimeout(function () {
    var host = document.getElementById('dh-mail-splash');
    if (!host) return;
    host.style.opacity = '0';
    setTimeout(function () {
      if (host.parentNode) host.parentNode.removeChild(host);
    }, 260);
  }, 180);
})();"#
}

/// Open an http(s) link in the system browser.
///
/// Links inside a sandboxed email iframe cannot open themselves: Tauri does not
/// honor target=_blank from an iframe document, so the page asks for this.
#[tauri::command]
fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
  if !(url.starts_with("https://") || url.starts_with("http://")) {
    return Err("only http and https links open externally".into());
  }
  tauri_plugin_opener::OpenerExt::opener(&app)
    .open_url(url, None::<&str>)
    .map_err(|e| e.to_string())
}

/// The commands every platform carries, plus whatever a platform adds.
///
/// Two hand-kept lists would drift. Printing and the Mac address book are
/// AppKit, so they exist on macOS and nowhere else; the page is written to
/// expect that. `invoke` on a command the shell does not carry rejects, and
/// the mail package answers a rejection by falling back — an iframe prints,
/// and the contact source reports itself unavailable. See
/// `lib/native-shell.ts` and `components/mail/print-mail.ts`.
macro_rules! mail_commands {
  ($($platform:path),* $(,)?) => {
    tauri::generate_handler![
      open_calendar_invite,
      mail_native::popout::open_chat_popout,
      mail_native::popout::resize_chat_popout,
      mail_native::popout::close_chat_popout,
      mail_native::popout::chat_popout_open,
      mail_native::popout::focus_chat_popout,
      mail_native::popout::hand_back_chat_popout,
      mail_native::popout::notify_mail_sent,
      mail_native::popout::notify_mail_forward,
      mail_native::commands::mail_store_call,
      mail_native::commands::mail_import_snapshot,
      mail_native::commands::oauth_bind,
      mail_native::commands::oauth_await_redirect,
      // The team layer, over the planner API. Internal flavor only; the
      // public interface never calls these.
      mail_native::planner::planner_session_set,
      mail_native::planner::planner_session_clear,
      mail_native::planner::planner_session_ready,
      mail_native::planner::planner_session_origin,
      mail_native::planner::planner_fetch,
      mail_native::planner::planner_show_record,
      open_external_url,
      downloads::save_attachment,
      oauth::oauth_token_request,
      $($platform),*
    ]
  };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());
  // Remote images (dhmail://) and, on macOS, the print document (dhprint://).
  // See the mail-native crate.
  let builder = mail_native::register_schemes(builder);

  #[cfg(target_os = "macos")]
  let builder = builder.invoke_handler(mail_commands![
    printing::print_document,
    contacts::mac_contacts_authorization,
    contacts::mac_contacts_request_access,
    contacts::mac_contacts_list,
    contacts::open_contacts_privacy_settings,
  ]);
  #[cfg(not(target_os = "macos"))]
  let builder = builder.invoke_handler(mail_commands![]);

  builder
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      } else {
        // Release: keep logs for diagnosing sidecar boot failures.
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      #[cfg(target_os = "macos")]
      magnify::install(app.handle().clone());

      // Report an issue / Contact us / Who we are, under Help.
      #[cfg(target_os = "macos")]
      if let Err(err) = menu::install(app) {
        log::warn!("menu: {err}");
      }

      // The local store. A failure here leaves the app unable to remember
      // anything, so it stops rather than run with no store at all.
      let data_dir = app.path().app_data_dir().map_err(|e| {
        log::error!("no app data directory: {e}");
        e
      })?;
      mail_native::setup_store(app.handle(), data_dir)
        .map_err(std::io::Error::other)?;

      Ok(())
    })
    .on_page_load(|window, payload| {
      let url = payload.url().to_string();

      // A chat popout is a small transparent window. No splash there.
      let is_popout = url.contains("popout=1");

      // Nor over the print document. That page is not something a reader
      // waits in front of — it is the page whose pixels become paper, and the
      // splash was landing on it: a single message printed the splash instead
      // of the message, and a thread came out blank behind it.
      //
      // Only macOS has such a page. Elsewhere the print document is an iframe
      // inside the app's own window, which never loads a page of its own.
      #[cfg(target_os = "macos")]
      let is_print = url.starts_with(&format!("{}://", printing::SCHEME));
      #[cfg(not(target_os = "macos"))]
      let is_print = false;
      let is_chrome = is_popout || is_print;

      match payload.event() {
        PageLoadEvent::Started => {
          if !is_chrome {
            let _ = window.eval(splash_overlay_js());
          }
        }
        PageLoadEvent::Finished => {
          if !is_chrome {
            let _ = window.eval(splash_hide_js());
          }
          let _ = window.eval(
            r#"(() => {
              if (window.__dhExternalLinksHooked) return;
              window.__dhExternalLinksHooked = true;
              document.addEventListener('click', (event) => {
                const el = event.target instanceof Element
                  ? event.target.closest('a[target="_blank"]')
                  : null;
                if (!el || !el.href || !/^https?:/i.test(el.href)) return;
                const invoke =
                  (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) ||
                  (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke);
                if (!invoke) return;
                event.preventDefault();
                invoke('plugin:opener|open_url', { url: el.href });
              }, true);
            })();"#,
          );
        }
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    // Underscored because the only thing that reads either is the macOS arm
    // below, and a plain name is an unused-variable warning everywhere else.
    .run(|_app, _event| {
      #[cfg(target_os = "macos")]
      if let tauri::RunEvent::Reopen { .. } = _event {
        show_main_window(_app);
      }
    });
}


