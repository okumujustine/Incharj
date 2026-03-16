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
cd backend && npm install && npm run dev     # API
cd backend && npm run worker                 # worker (separate terminal)
cd frontend && npm install && npm run dev    # frontend
```
