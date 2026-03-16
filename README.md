# Incharj

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up
```

| Service  | URL                   |
|----------|-----------------------|
| Frontend | http://localhost:3000 |
| API      | http://localhost:8000 |
| Postgres | localhost:5432        |

**Without Docker** (Node 20+ required)

```bash
npm install              # install all workspaces from root

npm run dev:api          # API
npm run dev:worker       # worker (separate terminal)
npm run dev:web          # frontend
```
