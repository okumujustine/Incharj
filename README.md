# Incharj

Incharj loads runtime configuration through a provider-agnostic secrets
bootstrap layer.

The bootstrap entrypoint is
[scripts/run-with-secrets.mjs](./scripts/run-with-secrets.mjs). Today it supports
`SECRETS_PROVIDER=infisical`, but the repo surface is intentionally generic so we
can switch providers later by adding another module under
[`scripts/secrets/providers/`](./scripts/secrets/providers/).

For the full runtime variable checklist, see
[docs/runtime-configuration.md](./docs/runtime-configuration.md).

Start the stack with:

```bash
node ./scripts/run-with-secrets.mjs -- docker compose -f docker-compose.dev.yml up --build
```

If you prefer `make`, the main development commands use the same SDK runner:

```bash
make up
make api
make worker
make web
make bot
```

| Service  | URL                   |
|----------|-----------------------|
| Frontend | http://localhost:3000 |
| API      | http://localhost:8000 |
| Docs     | http://localhost:4173 |
| Postgres | localhost:5432        |
| Redis    | localhost:6379        |

More detailed setup notes live in [docs/getting-started.md](./docs/getting-started.md)
and [apps/api/README.md](./apps/api/README.md).
