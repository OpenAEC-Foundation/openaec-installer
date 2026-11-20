use tauri::{
    webview::{NewWindowResponse, WebviewBuilder},
    LogicalPosition, LogicalSize, Manager, Rect, Url, Webview, WebviewUrl,
};

const LABEL: &str = "ifccad-explorer";
const EXPLORER_URL: &str = "https://ifccad-explorer.open-aec.com/";

#[derive(serde::Deserialize)]
pub(crate) struct TabBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(serde::Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum TabAction {
    Show { bounds: TabBounds, reload: bool },
    Hide,
    Close,
}

// Het aanmaken van een WebView2-controller moet vanuit een async command.
#[tauri::command]
pub(crate) async fn update_ifccad_tab(webview: Webview, action: TabAction) -> Result<(), String> {
    update(&webview, action).map_err(|error| error.to_string())
}

fn update(shell: &Webview, action: TabAction) -> tauri::Result<()> {
    let existing = shell.get_webview(LABEL);
    match action {
        TabAction::Hide => existing.map_or(Ok(()), |view| view.hide()),
        TabAction::Close => existing.map_or(Ok(()), |view| view.close()),
        TabAction::Show { bounds, reload } => {
            let position = LogicalPosition::new(bounds.x, bounds.y);
            let size = LogicalSize::new(bounds.width, bounds.height);
            let url = Url::parse(EXPLORER_URL).map_err(tauri::Error::InvalidUrl)?;
            if let Some(view) = existing {
                view.set_bounds(Rect {
                    position: position.into(),
                    size: size.into(),
                })?;
                if reload {
                    view.navigate(url)?;
                }
                view.show()
            } else {
                let origin = url.origin();
                let builder = WebviewBuilder::new(LABEL, WebviewUrl::External(url))
                    .on_navigation(move |target| {
                        target.scheme() == "https" && target.origin() == origin
                    })
                    .on_new_window(|_, _| NewWindowResponse::Deny)
                    .disable_drag_drop_handler();
                shell.window().add_child(builder, position, size)?;
                Ok(())
            }
        }
    }
}
