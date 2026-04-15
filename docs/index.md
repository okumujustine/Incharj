---
layout: home

hero:
  name: Incharj
  text: Engineering Documentation
  tagline: Internal architecture, flows, and design decisions for the Incharj platform.
  actions:
    - theme: brand
      text: Conversation Flow
      link: /architecture/conversation-flow
    - theme: alt
      text: Indexing Flow
      link: /architecture/indexing-flow

features:
  - title: Conversational RAG
    details: Stateful, multi-turn AI search with backend-owned context, query rewriting, and persistent history.
  - title: Connector System
    details: OAuth2 and server-env connector flows with document indexing, chunking, and vector embeddings.
  - title: Search Pipeline
    details: Hybrid full-text + semantic search with BM25 ranking, freshness decay, and cosine reranking.
---
