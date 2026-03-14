# Incharj

A fast, local-first desktop search app for your files and cloud documents — built with Tauri, Rust, and React.

## Features

- **Full-text search** across local files using SQLite FTS5
- **Google Drive** integration — sync and search your Drive documents
- **Notion** integration — sync and search your Notion pages
- **File watcher** — automatically re-indexes files as they change
- **Keyboard-first** interface
- Works entirely on your machine — no cloud indexing, no telemetry

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri v2](https://tauri.app) (Rust) |
| Frontend | React + TypeScript + Vite |
| Search index | SQLite FTS5 |
| Styling | Plain CSS with CSS variables |
| Cloud auth | OAuth 2.0 PKCE (Google), OAuth 2.0 (Notion) |

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 18+
- [Tauri CLI prerequisites](https://tauri.app/start/prerequisites/) for your platform

### Setup

```bash
git clone https://github.com/okumujustine/Incharj.git
cd incharj
npm install
```

Copy the environment template and fill in your OAuth credentials:

```bash
cp src-tauri/.env.example src-tauri/.env
```

Edit `src-tauri/.env`:

```env
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

NOTION_CLIENT_ID=your_notion_client_id
NOTION_CLIENT_SECRET=your_notion_client_secret
```

### OAuth Setup

**Google Drive**
1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** → Desktop app
3. Enable the **Google Drive API**
4. Copy the client ID and secret into `.env`

**Notion**
1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) → New integration → **Public** type
2. Set redirect URI to `http://localhost`
3. Copy the OAuth client ID and secret into `.env`

### Run in development

```bash
npm run tauri dev
```

### Build for production

```bash
npm run tauri build
```

The distributable is output to `src-tauri/target/release/bundle/`.

## Project Structure

```
├── src/                   # React frontend
│   ├── App.tsx            # Root component + state
│   ├── bridge.ts          # Tauri invoke bindings
│   ├── types.ts           # Shared TypeScript types
│   └── components/        # UI components
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs         # Tauri app setup
│   │   ├── commands.rs    # Tauri commands (invoke handlers)
│   │   ├── db.rs          # SQLite + FTS5 setup
│   │   ├── indexer.rs     # Local file indexer
│   │   ├── watcher.rs     # File system watcher
│   │   └── integrations/  # Google Drive + Notion sync
│   ├── build.rs           # Loads .env at compile time
│   ├── .env               # Local secrets (gitignored)
│   └── .env.example       # Template — commit this
└── index.html
```

## Version

`v0.1.0` — early release. Core search, Drive, and Notion integrations are functional.
