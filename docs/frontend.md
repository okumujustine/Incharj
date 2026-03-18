# Frontend

The frontend is a React 18 SPA in `frontend/src/`. It is served by Vite in development and built to a static bundle in production (served by nginx).

## Tech stack

| Library | Purpose |
|---|---|
| React 18 | UI |
| React Router 6 | Client-side routing |
| TanStack Query | Server state, caching, background refetching |
| Zustand | Client state (auth, current org) |
| Tailwind CSS | Styling (CSS variable-based theming) |
| Lucide React | General icons |
| react-icons/si | Brand icons (Google Drive, Notion, Slack) |

---

## Directory layout

```
frontend/src/
├── App.tsx                   # Route definitions
├── main.tsx                  # ReactDOM root + providers
├── types.ts                  # Shared TypeScript interfaces
├── index.css                 # Tailwind base + CSS variable theme tokens
│
├── pages/
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   ├── AcceptInvitePage.tsx      # Accepts invitation by token (public)
│   ├── OAuthCallbackPage.tsx     # Handles OAuth redirect from provider
│   ├── OrgSelectorPage.tsx       # Lists all orgs the user belongs to
│   ├── CreateOrgPage.tsx
│   ├── SearchPage.tsx            # Main search interface with pagination
│   ├── FilesPage.tsx             # Browse all indexed documents (filters + pagination)
│   ├── ConnectorsPage.tsx        # List of connectors for current org
│   ├── ConnectorDetailPage.tsx   # Connector details, sync limit config + sync history
│   ├── SettingsPage.tsx          # General + Members settings (nested routes)
│   └── ProfilePage.tsx
│
├── components/
│   ├── auth/
│   │   └── AuthGuard.tsx         # Redirects to /login if not authenticated
│   ├── layout/
│   │   ├── AppLayout.tsx         # Sidebar + TopBar + <Outlet>
│   │   ├── Sidebar.tsx           # Nav: Search, Files, Connectors, Settings + theme toggle
│   │   └── TopBar.tsx            # Breadcrumb nav + action slot
│   └── ui/
│       ├── Badge.tsx             # StatusBadge + Badge (variant: success/warning/error/…)
│       ├── Button.tsx
│       ├── ConnectorIcon.tsx     # Brand icon for Google Drive / Notion / Slack (react-icons/si)
│       ├── EmptyState.tsx
│       ├── FileTypeIcon.tsx      # Coloured lucide icon by file ext + kind
│       ├── Input.tsx
│       ├── SkeletonList.tsx
│       └── Spinner.tsx
│
├── hooks/
│   ├── useAuth.ts               # Login, register, logout actions + token refresh
│   ├── useOrg.ts                # Current org helpers
│   ├── useSearch.ts             # Debounced search with TanStack Query + pagination
│   └── useTheme.ts              # Light/dark theme toggle via localStorage + CSS class
│
├── services/                    # API call functions (used by TanStack Query)
│   ├── api.ts                   # Base axios client with auth header + auto token refresh
│   ├── auth.ts                  # register, login, refresh, logout, me
│   ├── connectors.ts            # CRUD + sync trigger + pause/resume + OAuth URL
│   ├── documents.ts             # List documents with pagination (returns { total, results })
│   ├── orgs.ts                  # CRUD orgs + members + invitations
│   └── search.ts                # Search endpoint
│
└── stores/
    ├── authStore.ts             # Zustand: user, accessToken (memory only), currentOrg (persisted)
    └── orgStore.ts              # Zustand: org-level cached data
```

---

## Routing

All routes are defined in `App.tsx`. Routes that require authentication are wrapped in `<AuthGuard>` which checks `authStore.accessToken` and redirects to `/login` if absent.

```
/login                    — LoginPage
/register                 — RegisterPage
/accept-invite/:token     — AcceptInvitePage
/oauth/:kind/callback     — OAuthCallbackPage (auth required)
/orgs                     — OrgSelectorPage
/orgs/new                 — CreateOrgPage
/settings/profile         — ProfilePage
/:orgSlug                 — AppLayout (sidebar layout)
  /search                 — SearchPage
  /files                  — FilesPage
  /connectors             — ConnectorsPage
  /connectors/:id         — ConnectorDetailPage
  /settings               — GeneralSettingsPage
  /settings/members       — MembersSettingsPage
```

The org slug is derived from the URL. `AppLayout` reads `:orgSlug` from `useParams()` and sets it as the active org in `orgStore`.

---

## Theming

The app uses **CSS custom properties** for theming, defined in `index.css`:

- `:root` — dark theme token values (RGB channel format for Tailwind opacity modifier support)
- `.light` — light theme token values

**Light theme is the default.** An inline `<script>` in `index.html` applies the `.light` class to `<html>` before React renders, preventing a flash of the dark theme (anti-FOUC).

`useTheme()` reads/writes `localStorage.theme` and toggles `.light` on `<html>`. The sidebar exposes a Sun/Moon toggle button.

---

## State management

### Zustand (`stores/`)

- **`authStore`** — user profile and access token (memory only — never written to localStorage for security), current org reference (persisted to localStorage for tab reload).
- **`orgStore`** — org-level data cached across navigations.

### TanStack Query (`services/` + hooks)

All API calls go through TanStack Query. This provides:
- Automatic background refetching
- Request deduplication
- Loading / error states

Query keys follow the pattern `["resource", id, ...filters]`.

---

## API layer (`services/api.ts`)

The base axios wrapper:

1. Attaches `Authorization: Bearer <accessToken>` from `authStore`.
2. On `401` response → calls `POST /auth/refresh` → updates token in store → retries the original request once.
3. On second 401 → clears auth store and redirects to `/login`.

All service functions call this wrapper so token refresh is transparent.

---

## Search UX

`useSearch()` hook:
- Debounces input by 300ms before firing a TanStack Query request.
- `hasQuery` is based on the **live** (non-debounced) query value — the empty state appears immediately when the input is cleared.
- `placeholderData` keeps previous results visible during the debounce window while the user is still typing, preventing a flash of empty state between keystrokes.
- Supports pagination (20 per page), connector/kind filters, and keyboard navigation (↑↓ to move, Enter to open, Esc to blur).
- Results dim (`opacity-60`) while a refetch is in progress.

---

## Files page

`FilesPage` lists all indexed documents for the org:
- Filters by connector and document kind via dropdowns.
- Pagination (50 per page) with first/last/current±2 ellipsis page numbers.
- Each row shows a `FileTypeIcon` (coloured by ext/kind), connector brand icon, title, author, and relative modified date.
- Clicking a row opens the source URL in a new tab if available.

---

## Connector icons

`ConnectorIcon` maps connector `kind` to a Simple Icons brand logo via `react-icons/si`:

| kind | Icon | Colour |
|---|---|---|
| `google_drive` | SiGoogledrive | #4285F4 |
| `notion` | SiNotion | #888888 |
| `slack` | SiSlack | #E01E5A |

`FileTypeIcon` maps file extension and document kind to a coloured Lucide icon (PDF → red, Google Docs → blue, Sheets → green, Slides → yellow, etc.).

---

## Connector detail page

`ConnectorDetailPage` shows:
- Connector status, document count, last synced time.
- **Sync limit card** — configures `config.max_documents` (PATCH connector config). Useful for limiting document fetches during testing. Leave empty for no limit.
- **Sync history** — expandable rows showing status, doc counts, timestamps, duration, and any error messages.
- Actions: Sync now, Pause/Resume.

---

## Sync history UI

`ConnectorDetailPage` displays sync jobs with:

- **Status badges**: `done` (green), `partial` (yellow — `status === 'done' && docs_errored > 0`), `running` (blue/spinning), `failed` (red), `pending` (grey).
- **Expandable rows**: clicking a job row reveals timestamps, duration, triggered by, retrieved from source (`docs_indexed + docs_skipped + docs_errored`), indexed, unchanged, failed count, and any error message.

---

## Adding a new page

1. Create `frontend/src/pages/MyPage.tsx`.
2. Add a `<Route>` in `App.tsx`.
3. If it needs org-scoped data, nest it under the `/:orgSlug` route.
4. Create a service function in `services/` if new API calls are needed.
5. Add a sidebar link in `components/layout/Sidebar.tsx` if it needs navigation.
