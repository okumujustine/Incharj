use crate::commands::WatcherStatusPayload;
use crate::db::get_document_count;
use crate::indexer::{
    index_single_file, remove_indexed_file, run_background_sync, IndexingState, SingleFileStatus,
};
use notify::{recommended_watcher, Event, EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

#[derive(Default)]
pub struct WatcherState {
    pub watcher: Mutex<Option<notify::RecommendedWatcher>>,
    pub queue_tx: Mutex<Option<UnboundedSender<QueuedEvent>>>,
    pub running: AtomicBool,
}

#[derive(Debug, Clone, Serialize)]
pub struct WatcherEventPayload {
    pub r#type: String,
    pub path: String,
    pub reason: Option<String>,
}

#[derive(Clone)]
pub enum QueuedEventKind {
    Upsert,
    Remove,
}

#[derive(Clone)]
pub struct QueuedEvent {
    pub path: PathBuf,
    pub kind: QueuedEventKind,
}

async fn process_queue(app: AppHandle, mut rx: UnboundedReceiver<QueuedEvent>) {
    while let Some(first) = rx.recv().await {
        let mut pending = HashMap::<String, QueuedEventKind>::new();
        pending.insert(first.path.to_string_lossy().to_string(), first.kind);

        loop {
            match tokio::time::timeout(std::time::Duration::from_millis(700), rx.recv()).await {
                Ok(Some(event)) => {
                    pending.insert(event.path.to_string_lossy().to_string(), event.kind);
                }
                Ok(None) => break,
                Err(_) => break,
            }
        }

        for (path_string, kind) in pending {
            match kind {
                QueuedEventKind::Upsert => {
                    let index_state = app.state::<IndexingState>();
                    if let Ok(result) =
                        index_single_file(PathBuf::from(&path_string).as_path(), index_state)
                    {
                        let event_type = match result.status {
                            SingleFileStatus::Indexed => "indexed",
                            SingleFileStatus::Deleted => "removed",
                            SingleFileStatus::Skipped => "skipped",
                            SingleFileStatus::Failed => "error",
                        };
                        let _ = app.emit(
                            "watcher:event",
                            WatcherEventPayload {
                                r#type: event_type.into(),
                                path: result.path,
                                reason: result.reason,
                            },
                        );
                        if matches!(
                            result.status,
                            SingleFileStatus::Indexed | SingleFileStatus::Deleted
                        ) {
                            let count = get_document_count().unwrap_or(0);
                            let _ = app.emit(
                                "index:background-complete",
                                serde_json::json!({ "documentCount": count }),
                            );
                        }
                    }
                }
                QueuedEventKind::Remove => {
                    let _ = remove_indexed_file(&path_string);
                    let _ = app.emit(
                        "watcher:event",
                        WatcherEventPayload {
                            r#type: "removed".into(),
                            path: path_string.clone(),
                            reason: None,
                        },
                    );
                    let count = get_document_count().unwrap_or(0);
                    let _ = app.emit(
                        "index:background-complete",
                        serde_json::json!({ "documentCount": count }),
                    );
                }
            }
        }
    }
}

pub fn restart_watcher(app: &AppHandle, state: State<'_, WatcherState>) -> Result<(), String> {
    {
        let mut watcher_guard = state
            .watcher
            .lock()
            .map_err(|_| "watcher lock poisoned".to_string())?;
        *watcher_guard = None;
    }
    state.running.store(false, Ordering::SeqCst);

    let config = crate::config::load_app_config().config;
    if config.folders.is_empty() || config.extensions.is_empty() {
        return Ok(());
    }

    let (tx, rx) = unbounded_channel();
    {
        let mut queue_guard = state
            .queue_tx
            .lock()
            .map_err(|_| "watcher queue lock poisoned".to_string())?;
        *queue_guard = Some(tx.clone());
    }

    tauri::async_runtime::spawn(process_queue(app.clone(), rx));

    let queue_tx = tx.clone();
    let mut watcher = recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            for path in event.paths {
                match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) => {
                        let _ = queue_tx.send(QueuedEvent {
                            path,
                            kind: QueuedEventKind::Upsert,
                        });
                    }
                    EventKind::Remove(_) => {
                        let _ = queue_tx.send(QueuedEvent {
                            path,
                            kind: QueuedEventKind::Remove,
                        });
                    }
                    EventKind::Any => {}
                    EventKind::Access(_) => {}
                    EventKind::Other => {}
                }
            }
        }
    })
    .map_err(|err| err.to_string())?;

    for folder in config.folders {
        let path = if let Some(stripped) = folder.strip_prefix("~/") {
            if let Some(home) = dirs::home_dir() {
                home.join(stripped)
            } else {
                folder.into()
            }
        } else {
            folder.into()
        };
        watcher
            .watch(path.as_path(), RecursiveMode::Recursive)
            .map_err(|err| err.to_string())?;
    }

    {
        let mut guard = state
            .watcher
            .lock()
            .map_err(|_| "watcher lock poisoned".to_string())?;
        *guard = Some(watcher);
    }
    state.running.store(true, Ordering::SeqCst);
    Ok(())
}

pub fn watcher_status(state: State<'_, WatcherState>) -> WatcherStatusPayload {
    WatcherStatusPayload {
        running: state.running.load(Ordering::SeqCst),
    }
}

pub fn start_background_services(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
        let app_sync = app.clone();
        let _ = tokio::task::spawn_blocking(move || {
            let index_state = app_sync.state::<IndexingState>();
            let _ = run_background_sync(&app_sync, index_state);
        })
        .await;
        let watcher_state = app.state::<WatcherState>();
        let _ = restart_watcher(&app, watcher_state);
    });
}
