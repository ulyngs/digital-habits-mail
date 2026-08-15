//! The menu bar, on macOS.
//!
//! Two additions to the menu Tauri makes by default.
//!
//! In the app menu, "Settings…" with Cmd+Comma. That is where a Mac user
//! looks for the settings of any app, and this one kept them behind a button
//! in the title bar only. The item does not open anything itself: the page
//! owns the settings panel, so the item tells the page and the page opens it.
//!
//! In the Help menu, three ways to reach us — the same three the blocker and
//! To-Do apps carry — and the version above them. Somebody reporting a problem
//! has to be able to say which build they are on, and until now the only way
//! to find out was Get Info in the Finder.
//!
//! Both are put into the submenus macOS already makes, rather than into menus
//! of our own. The default Help submenu is what gives the search field at the
//! top, and a Help menu built from scratch does not get one.
//!
//! The Help addresses are opened here rather than handed to the page. The
//! page's `open_external_url` refuses anything that is not http, deliberately
//! — a sandboxed email frame must not be able to start a mail client or
//! anything else on the machine. A menu the reader clicked is not a message.

#![cfg(target_os = "macos")]

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{App, Emitter, Manager, Wry};
use tauri_plugin_opener::OpenerExt;

/// The public mirror. The planner's own repository is private.
const ISSUES_URL: &str = "https://github.com/ulyngs/digital-habits-mail/issues";
const CONTACT_URL: &str = "mailto:team@digitalhabits.org";
const STORY_URL: &str = "https://digitalhabits.org/story";

/// What the page listens for when Settings… is chosen. See apps/mail/src/main.tsx.
pub const OPEN_SETTINGS_EVENT: &str = "open-settings";

/// The window that shows the mail client, and so the settings. Popouts have
/// their own labels and no settings panel to open.
const MAIN_WINDOW: &str = "main";

pub fn install(app: &App) -> tauri::Result<()> {
  let menu = Menu::default(app.handle())?;
  let submenus: Vec<Submenu<Wry>> = menu
    .items()?
    .into_iter()
    .filter_map(|item| item.as_submenu().cloned())
    .collect();

  // The app menu is the first one. It is named after the app, so it is found
  // by position rather than by text.
  match submenus.first() {
    Some(app_menu) => {
      let settings = MenuItem::with_id(
        app,
        "app_settings",
        "Settings…",
        true,
        Some("CmdOrCtrl+,"),
      )?;
      // Where every Mac app puts it: after "About" and its separator, and
      // before Services. That is index 2 in the default menu, and a separator
      // after it keeps Services in a group of its own.
      app_menu.insert(&settings, 2)?;
      app_menu.insert(&PredefinedMenuItem::separator(app)?, 3)?;
    }
    None => log::warn!("menu: no app submenu to add Settings to"),
  }

  let help = submenus.iter().find(|submenu| {
    matches!(submenu.text(), Ok(text) if text == "Help")
  });

  match help {
    Some(help) => {
      // Tauri takes this from the config, which reads ../package.json, so it
      // is the same number as the app bundle and the DMG carry.
      let info = app.package_info();
      let version = MenuItem::with_id(
        app,
        "help_version",
        format!("{} {}", info.name, info.version),
        // Nothing to click. It is here to be read and repeated.
        false,
        None::<&str>,
      )?;
      let report = MenuItem::with_id(
        app,
        "help_report_issue",
        "Report an issue",
        true,
        None::<&str>,
      )?;
      let contact =
        MenuItem::with_id(app, "help_contact_us", "Contact us", true, None::<&str>)?;
      let who_we_are =
        MenuItem::with_id(app, "help_who_we_are", "Who we are", true, None::<&str>)?;

      help.append(&PredefinedMenuItem::separator(app)?)?;
      help.append(&version)?;
      help.append(&report)?;
      help.append(&contact)?;
      help.append(&who_we_are)?;
    }
    // A macOS without a Help submenu is not a case we have seen. Say so
    // rather than leave a menu that quietly lost three items.
    None => log::warn!("menu: no Help submenu to add to"),
  }

  app.set_menu(menu)?;

  app.on_menu_event(|app, event| {
    let url = match event.id().as_ref() {
      "app_settings" => {
        // To the main window, and to the front: Settings… chosen while a
        // popout has the focus should still show the settings somewhere.
        if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
          let _ = window.show();
          let _ = window.set_focus();
          if let Err(err) = app.emit_to(MAIN_WINDOW, OPEN_SETTINGS_EVENT, ()) {
            log::warn!("menu: could not ask the page to open settings: {err}");
          }
        }
        return;
      }
      "help_report_issue" => ISSUES_URL,
      "help_contact_us" => CONTACT_URL,
      "help_who_we_are" => STORY_URL,
      _ => return,
    };
    if let Err(err) = app.opener().open_url(url, None::<&str>) {
      log::warn!("menu: could not open {url}: {err}");
    }
  });

  Ok(())
}
