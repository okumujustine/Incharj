---
layout: home

hero:
  name: Incharj
  text: Developer Documentation
  tagline: Multi-tenant document intelligence platform — connect, sync, and search your knowledge base.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Architecture
      link: /architecture
    - theme: alt
      text: API Reference
      link: /api

features:
  - icon: 🔌
    title: Connectors
    details: OAuth integrations with Google Drive, Notion, and Slack. Incremental sync, credential encryption, and pluggable connector registry.
    link: /connectors
    linkText: Learn more

  - icon: 🔍
    title: Hybrid Search
    details: PostgreSQL full-text search with GIN indexes and time-decay scoring, with trigram similarity fallback. Stop-word short-circuit for instant empty results.
    link: /search
    linkText: Learn more

  - icon: ⚙️
    title: Background Workers
    details: BullMQ + Redis job queue. Dispatch worker every 30s, sync worker with per-document transactions and error tolerance.
    link: /workers
    linkText: Learn more

  - icon: 🗄️
    title: PostgreSQL
    details: Raw SQL, no ORM. Pre-computed tsvector columns with GIN indexes. Multi-tenant with org_id on every table.
    link: /database
    linkText: Learn more

  - icon: ⚛️
    title: React Frontend
    details: TanStack Query, Zustand, light/dark theming via CSS variables. Search with debounce, pagination, and keyboard navigation.
    link: /frontend
    linkText: Learn more

  - icon: 🔐
    title: Auth
    details: JWT access tokens (15 min) + httpOnly refresh token cookie (30 days). Role-based access per org membership.
    link: /auth
    linkText: Learn more
---
