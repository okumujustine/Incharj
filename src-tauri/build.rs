fn main() {
    // Load .env from src-tauri/ and forward values as compile-time env vars
    if let Ok(contents) = std::fs::read_to_string(".env") {
        for line in contents.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, val)) = line.split_once('=') {
                let key = key.trim();
                let val = val.trim().trim_matches('"').trim_matches('\'');
                println!("cargo:rustc-env={}={}", key, val);
            }
        }
    }
    tauri_build::build()
}

