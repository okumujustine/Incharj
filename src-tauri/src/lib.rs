mod commands;
mod config;
mod db;
mod indexer;
mod integrations;
mod watcher;

use indexer::IndexingState;
use tauri::{
    window::{Effect, EffectState, EffectsBuilder},
    Manager,
};
use tauri_plugin_deep_link::DeepLinkExt;
use watcher::{start_background_services, WatcherState};

/// Shared channel for receiving the OAuth callback URL from the deep link handler.
pub struct OAuthCallbackState(pub std::sync::Arc<std::sync::Mutex<Option<std::sync::mpsc::SyncSender<String>>>>);

impl Default for OAuthCallbackState {
    fn default() -> Self {
        Self(std::sync::Arc::new(std::sync::Mutex::new(None)))
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(IndexingState::default())
        .manage(WatcherState::default())
        .manage(OAuthCallbackState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            let cb_arc = handle.state::<OAuthCallbackState>().0.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    let url_str = url.to_string();
                    if url_str.starts_with("incharj://oauth/callback") {
                        if let Ok(mut guard) = cb_arc.lock() {
                            if let Some(tx) = guard.take() {
                                let _ = tx.send(url_str);
                            }
                        }
                    }
                }
            });
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_effects(
                    EffectsBuilder::new()
                        .effect(Effect::ContentBackground)
                        .state(EffectState::Active)
                        .radius(14.0)
                        .build(),
                );
            }
            start_background_services(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_state,
            commands::search_query,
            commands::get_indexed_files,
            commands::add_folder,
            commands::remove_folder,
            commands::add_extension,
            commands::remove_extension,
            commands::scan_index_scope,
            commands::complete_onboarding,
            commands::start_indexing,
            commands::reset_index,
            commands::get_folder_stats,
            commands::open_file,
            commands::reveal_file,
            commands::select_folder,
            commands::watcher_status_command,
            commands::quit_app,
            commands::get_integrations,
            commands::connect_google_drive,
            commands::sync_google_drive,
            commands::connect_notion,
            commands::sync_notion,
            commands::disconnect_integration,
            commands::reset_integration_sync
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
