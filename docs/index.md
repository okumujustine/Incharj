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
    details: The core sync loop — how connectors, the indexer, and the search engine fit together.
    link: /architecture
    linkText: Read

  - icon: 📦
    title: Indexer
    details: How raw content becomes searchable records — hashing, chunking, upsert, and pre-computed search vectors.
    link: /indexer
    linkText: Read

  - icon: 🔍
    title: Search
    details: Three-tier strategy — stop-word guard, GIN full-text search with time-decay scoring, trigram fuzzy fallback.
    link: /search
    linkText: Read

  - icon: 🔐
    title: Authentication
    details: JWT + rotating refresh tokens for users. AES-GCM encrypted OAuth credentials for connectors.
    link: /auth
    linkText: Read
---
