# Incharj Feature Roadmap

A terminal-based local document search CLI with full-text search.

## Current Features

- [x] Full-text search with FTS5 SQLite
- [x] Slash command system (`/index`, `/reset`, `/quit`, `/theme`)
- [x] Keyboard navigation (up/down arrows, enter to open)
- [x] Cross-platform file opening
- [x] Progress bar during indexing
- [x] Keyword highlighting in snippets
- [x] Occurrence counting in results
- [x] Multiple color themes (Cyan, Vibrant, Minimal, Monochrome, Ocean)
- [x] Stats footer with document count and search time

---

## Planned Features

### High Impact, Quick Wins

| Feature | Description | Status |
|---------|-------------|--------|
| Live file watching | Auto-update index when files change (chokidar ready) | ⬜ Not started |
| File preview | Show first ~10 lines of selected file inline (`p` to toggle) | ⬜ Not started |
| Copy to clipboard | `Ctrl+C` to copy file path | ⬜ Not started |
| Search history | Up arrow in empty input shows recent searches | ⬜ Not started |
| File type icons | 📄 .txt, 📝 .md, 🔧 .json, etc. | ⬜ Not started |

### Power User Features

| Feature | Description | Status |
|---------|-------------|--------|
| Extension filter | `ext:md config` to search only markdown files | ⬜ Not started |
| Date filter | `modified:7d` for files changed in last 7 days | ⬜ Not started |
| Boolean operators | `react AND hooks`, `config NOT test` | ⬜ Not started |
| Exact phrase | `"exact match"` with quotes | ⬜ Not started |
| Folder scope | `/in:Projects typescript` to search specific folder | ⬜ Not started |

### Polish & Delight

| Feature | Description | Status |
|---------|-------------|--------|
| Config file | `~/.incharj/config.json` for folders, extensions, theme | ⬜ Not started |
| Keyboard shortcuts help | `?` to show all shortcuts | ⬜ Not started |
| Result sorting | Toggle by relevance/date/name with `Tab` | ⬜ Not started |
| Themes | Minimal, vibrant, monochrome color schemes | ✅ Complete |
| Stats footer | "Searched 2,341 documents in 0.02s" | ✅ Complete |

### Advanced

| Feature | Description | Status |
|---------|-------------|--------|
| Fuzzy search | Find "confg" when you meant "config" | ⬜ Not started |
| Content preview panel | Side-by-side file content view | ⬜ Not started |
| Bookmarks | Star frequently used files | ⬜ Not started |
| Regex search | `/regex:pattern/` for power users | ⬜ Not started |
| Export results | Save search results to file | ⬜ Not started |

---

## Premium Features

*Potential features for a paid tier or Pro version.*

### AI-Powered Search

| Feature | Description |
|---------|-------------|
| Semantic search | Use embeddings for meaning-based search (find "authentication" when searching "login") |
| Natural language queries | "Find all TODO comments in my React projects" |
| Smart summaries | AI-generated summary of matched documents |
| Content suggestions | "You might also be interested in..." based on search patterns |

### Team & Cloud

| Feature | Description |
|---------|-------------|
| Shared indexes | Team-shared search across shared drives |
| Cloud sync | Sync bookmarks and search history across devices |
| Remote search | Search files on remote servers via SSH |
| Search analytics | Track most searched terms and popular files |

### Integrations

| Feature | Description |
|---------|-------------|
| Git integration | Search across git history, blame info |
| IDE plugins | VS Code, JetBrains extensions |
| API access | REST API for programmatic search |
| Webhook notifications | Alert when new files match saved searches |

### Enterprise

| Feature | Description |
|---------|-------------|
| Permission controls | Respect file permissions and access levels |
| Audit logging | Track who searched for what |
| Custom tokenizers | Domain-specific search (legal, medical, code) |
| OCR support | Search text in images and PDFs |
| Large-scale indexing | Handle millions of files efficiently |

---

## Implementation Priority

### Phase 1 - Core Polish (v0.2.0)
1. File preview (`p` key)
2. Stats footer
3. Keyboard shortcuts help (`?`)
4. Copy to clipboard

### Phase 2 - Search Power (v0.3.0)
1. Extension filter (`ext:`)
2. Exact phrase matching
3. Search history
4. Config file support

### Phase 3 - Live Experience (v0.4.0)
1. Live file watching
2. File type icons
3. Bookmarks
4. Themes

### Phase 4 - Advanced (v0.5.0)
1. Date filters
2. Boolean operators
3. Folder scope
4. Result sorting

---

## Contributing

To implement a feature:
1. Create a branch: `feature/feature-name`
2. Update this file to mark status as 🔄 In progress
3. Add tests if applicable
4. Update status to ✅ Complete when merged

Status legend:
- ⬜ Not started
- 🔄 In progress
- ✅ Complete
