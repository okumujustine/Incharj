# Incharj

Incharj is a **unified enterprise knowledge system** that connects tools like Google Drive, Slack, and Notion into a single searchable interface.

---

## 🎬 Demo



https://github.com/user-attachments/assets/1e01727a-8882-487d-8173-29c29852c4bc



---

## ⚙️ What’s in this repo

* `apps/web` — search UI
* `apps/api` — FastAPI backend (migration layer)
* `docs` — documentation
* `scripts/` — secrets + dev tooling
* `docker-compose.dev.yml` — local stack

---

## 🚀 Run locally

```bash
node ./scripts/run-with-secrets.mjs -- docker compose -f docker-compose.dev.yml up --build
```

or

```bash
make up
```

---

## 🌐 Local services

* Web: http://localhost:3000
* API: http://localhost:8000
* Docs: http://localhost:4173

---

## 🔐 Config

Uses a provider-agnostic secrets runner (Infisical):

```bash
node ./scripts/run-with-secrets.mjs -- <command>
```

---

## 🔄 Backend

* FastAPI sits in front of existing services
* Routes are migrated incrementally

---

## 🧱 Stack

* TypeScript, Python
* FastAPI
* PostgreSQL, Redis
* Docker

---

## 👤 Author

Justine Okumu
https://github.com/okumujustine
https://okumujustine.com
