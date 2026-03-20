---
layout: home

hero:
  name: Incharj
  text: Developer Documentation
  tagline: Connect external sources → index their content → make it searchable. Everything else is plumbing.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: How it works
      link: /architecture
    - theme: alt
      text: Architecture Diagram
      link: /architecture-diagram.html
      target: _blank

features:
  - icon: 🏗️
    title: Architecture
    details: "System-level view of API, worker, PostgreSQL, and Redis, plus end-to-end sync/search flow."
    link: /architecture
    linkText: Read

  - icon: 📦
    title: Core Pipeline
    details: "Split core docs by module: orchestration, connectors, normalization, chunking, indexing, and permissions."
    link: /indexer
    linkText: Read

  - icon: 🔍
    title: Search
    details: "Three-tier strategy: stop-word guard, GIN full-text search with time-decay scoring, trigram fuzzy fallback."
    link: /search
    linkText: Read

  - icon: 🧪
    title: Feature Ideas
    details: "Roadmap for semantic fallback, hybrid retrieval fusion, and a future RAG endpoint with citations."
    link: /feature-ideas
    linkText: Read

  - icon: 🔐
    title: Authentication
    details: "JWT + rotating refresh tokens for users. AES-GCM encrypted OAuth credentials for connectors."
    link: /auth
    linkText: Read
---
