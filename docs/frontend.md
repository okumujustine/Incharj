# Frontend

The frontend is a React 18 SPA in `frontend/src/`. It is served by Vite in development and built to a static bundle in production (served by nginx).

## Tech stack

| Library | Purpose |
|---|---|
| React 18 | UI |
| React Router 6 | Client-side routing |
| TanStack Query | Server state, caching, background refetching |
| Zustand | Client state (auth, current org) |
| Tailwind CSS | Styling |
| Lucide React | Icons |

---

## Directory layout

```
frontend/src/
├── App.tsx                   # Route definitions
├── main.tsx                  # ReactDOM root + providers
├── types.ts                  # Shared TypeScript interfaces
├── index.css                 # Tailwind base + custom CSS variables
│
├── pages/
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   ├── AcceptInvitePage.tsx  # Accepts invitation by token (public)
│   ├── OAuthCallbackPage.tsx # Handles OAuth redirect from provider
│   ├── OrgSelectorPage.tsx   # Lists all orgs the user belongs to
│   ├── CreateOrgPage.tsx
│   ├── SearchPage.tsx        # Main search interface
│   ├── ConnectorsPage.tsx    # List of connectors for current org
│   ├── ConnectorDetailPage.tsx  # Connector details + sync history
│   ├── SettingsPage.tsx      # General + Members settings (nested routes)
│   └── ProfilePage.tsx
│
├── components/
│   ├── auth/
│   │   └── AuthGuard.tsx     # Redirects to /login if not authenticated
│   ├── layout/
│   │   ├── AppLayout.tsx     # Sidebar + TopBar + <Outlet>
│   │   ├── Sidebar.tsx       # Nav: Search, Connectors, Settings
│   │   └── TopBar.tsx        # Org name + user menu
│   └── ui/
│       ├── Badge.tsx         # Status badge (variant: success/warning/error/…)
│       ├── Button.tsx
│       ├── EmptyState.tsx
│       ├── Input.tsx
│       ├── SkeletonList.tsx
│       └── Spinner.tsx
│
├── hooks/
│   ├── useAuth.ts            # Login, register, logout actions + token refresh
│   ├── useOrg.ts             # Current org helpers
│   └── useSearch.ts          # Debounced search with TanStack Query
│
├── services/                 # API call functions (used by TanStack Query)
│   ├── api.ts                # Base fetch with auth header + auto token refresh
│   ├── auth.ts               # register, login, refresh, logout, me
│   ├── connectors.ts         # CRUD + sync trigger + pause/resume
│   ├── documents.ts          # List + delete documents
│   ├── orgs.ts               # CRUD orgs + members + invitations
│   └── search.ts             # Search endpoint
│
└── stores/
    ├── authStore.ts          # Zustand: user, accessToken (memory only), currentOrg (persisted)
    └── orgStore.ts           # Zustand: org-level cached data
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
  /connectors             — ConnectorsPage
  /connectors/:id         — ConnectorDetailPage
  /settings               — GeneralSettingsPage
  /settings/members       — MembersSettingsPage
```

The org slug is derived from the URL. `AppLayout` reads `:orgSlug` from `useParams()` and sets it as the active org in `orgStore`.

---

## State management

### Zustand (`stores/`)

- **`authStore`** — user profile and access token (memory only — never written to localStorage for security), current org reference (persisted to localStorage for tab reload).
- **`orgStore`** — org-level data cached across navigations.

### TanStack Query (`services/` + hooks)

All API calls go through TanStack Query. This provides:
- Automatic background refetching
- Request deduplication
- Optimistic updates where needed
- Loading / error states

Query keys follow the pattern `["resource", id, ...filters]`.

---

## API layer (`services/api.ts`)

The base fetch wrapper:

1. Attaches `Authorization: Bearer <accessToken>` from `authStore`.
2. On `401` response → calls `POST /auth/refresh` → updates token in store → retries the original request once.
3. On second 401 → clears auth store and redirects to `/login`.

All service functions call this wrapper so token refresh is transparent.

---

## Sync history UI

`ConnectorDetailPage` displays sync jobs with:

- **Status badges**: `done` (green), `partial` (yellow/warning — `status === 'done' && docs_errored > 0`), `running` (blue), `failed` (red), `pending` (grey).
- **Expandable rows**: clicking a job row reveals details — timestamps, duration, triggered by, retrieved from source (`docs_indexed + docs_skipped + docs_errored`), indexed, unchanged, failed, and any error message.

---

## Adding a new page

1. Create `frontend/src/pages/MyPage.tsx`.
2. Add a `<Route>` in `App.tsx`.
3. If it needs org-scoped data, nest it under the `/:orgSlug` route.
4. Create a service function in `services/` if new API calls are needed.
5. Add a sidebar link in `components/layout/Sidebar.tsx` if it needs navigation.
