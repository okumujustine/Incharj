## Incharj

A terminal-based local document search CLI with full-text search.

## Configuration

Incharj loads optional config from:

- `~/.incharj/config.json`

Supported keys:

- `folders`: array of folders to index/search
- `extensions`: array of file extensions (with or without leading `.`)
- `ignore`: glob patterns to skip while indexing
- `theme`: preferred theme name (`cyan`, `vibrant`, `minimal`, `monochrome`, `ocean`)

Example:

```json
{
  "folders": ["~/Documents", "~/Projects", "~/Desktop"],
  "extensions": [".md", ".txt", ".json", ".yml", ".pdf"],
  "ignore": ["**/node_modules/**", "**/.git/**"],
  "theme": "ocean"
}
```

If config is missing or invalid, Incharj falls back to safe defaults.
If a configured theme is removed/renamed later, it automatically falls back to default.

Notes:
- `.pdf` files are supported for text extraction during `/index`.
- Scanned/image-only PDFs are not OCR'd in this version.
