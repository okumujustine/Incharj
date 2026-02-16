use std::path::PathBuf;

pub fn pid_file() -> PathBuf {
    dirs::runtime_dir()
        .or_else(dirs::state_dir)
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("pgdoctor.pid")
}

pub fn log_file() -> PathBuf {
    dirs::state_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join(".local/state")))
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("pgdoctor.log")
}
