//! macOS needs an Edit menu for native clipboard shortcuts inside the webview, but the default
//! menu also binds ⌘Z/⇧⌘Z to native undo, which would swallow the canvas history shortcuts.

#[cfg(target_os = "macos")]
pub fn install(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
    use tauri::Emitter;

    let handle = app.handle();
    // Why: the predefined Quit item terminates immediately; ours asks the frontend about unsaved work.
    let quit = MenuItemBuilder::with_id("quit", "Quit CanvaSlide")
        .accelerator("CmdOrCtrl+Q")
        .build(handle)?;
    let app_menu = SubmenuBuilder::new(handle, "CanvaSlide")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(&quit)
        .build()?;
    let edit_menu = SubmenuBuilder::new(handle, "Edit")
        .item(&PredefinedMenuItem::cut(handle, None)?)
        .item(&PredefinedMenuItem::copy(handle, None)?)
        .item(&PredefinedMenuItem::paste(handle, None)?)
        .item(&PredefinedMenuItem::select_all(handle, None)?)
        .build()?;
    let window_menu = SubmenuBuilder::new(handle, "Window")
        .minimize()
        .fullscreen()
        .separator()
        .close_window()
        .build()?;
    let menu = MenuBuilder::new(handle)
        .items(&[&app_menu, &edit_menu, &window_menu])
        .build()?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id().as_ref() == "quit" {
            let _ = app.emit(crate::QUIT_REQUESTED_EVENT, ());
        }
    });
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn install(_app: &tauri::App) -> tauri::Result<()> {
    Ok(())
}
