import{_ as i,o as t,c as p,ag as e,j as s,a as n}from"./chunks/framework.DAvaMl8U.js";const g=JSON.parse('{"title":"Architecture","description":"","frontmatter":{},"headers":[],"relativePath":"architecture.md","filePath":"architecture.md"}'),l={name:"architecture.md"};function o(c,a,r,d,h,u){return t(),p("div",null,[...a[0]||(a[0]=[e(`<h1 id="architecture" tabindex="-1">Architecture <a class="header-anchor" href="#architecture" aria-label="Permalink to &quot;Architecture&quot;">​</a></h1><p>Incharj has one job: connect to external knowledge sources, index their content, and make it searchable. Everything in the codebase exists to serve that loop.</p><hr><h2 id="system-processes" tabindex="-1">System processes <a class="header-anchor" href="#system-processes" aria-label="Permalink to &quot;System processes&quot;">​</a></h2><p>Three processes share one PostgreSQL database. They never communicate directly with each other — PostgreSQL and Redis are the only shared state.</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  Browser (React SPA)                                    │</span></span>
<span class="line"><span>│  • TanStack Query for server state                      │</span></span>
<span class="line"><span>│  • Zustand for auth token (memory only)                 │</span></span>
<span class="line"><span>│  • Axios interceptor auto-refreshes expired tokens      │</span></span>
<span class="line"><span>└──────────────────────┬──────────────────────────────────┘</span></span>
<span class="line"><span>                       │ HTTP  (nginx → api:8000)</span></span>
<span class="line"><span>                       ▼</span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  API  ·  Fastify 5  ·  TypeScript                        │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  /auth          JWT issue, refresh, logout               │</span></span>
<span class="line"><span>│  /orgs          Multi-tenant org management              │</span></span>
<span class="line"><span>│  /connectors    OAuth setup, pause/resume/sync trigger   │</span></span>
<span class="line"><span>│  /search        FTS + fuzzy query endpoint               │</span></span>
<span class="line"><span>│  /documents     List indexed docs with filters           │</span></span>
<span class="line"><span>│  /oauth         OAuth callback handler                   │</span></span>
<span class="line"><span>└─────────┬──────────────────────┬────────────────────────┘</span></span>
<span class="line"><span>          │ pg (pool 20)         │ enqueue sync job</span></span>
<span class="line"><span>          ▼                      ▼</span></span>
<span class="line"><span>┌──────────────────┐    ┌────────────────┐</span></span>
<span class="line"><span>│   PostgreSQL 16  │    │   Redis 7      │</span></span>
<span class="line"><span>│                  │    │   (BullMQ)     │</span></span>
<span class="line"><span>│  users           │    │                │</span></span>
<span class="line"><span>│  organizations   │    │  incharj-sync  │</span></span>
<span class="line"><span>│  memberships     │    │  queue         │</span></span>
<span class="line"><span>│  sessions        │    └───────┬────────┘</span></span>
<span class="line"><span>│  connectors      │            │ consume jobs</span></span>
<span class="line"><span>│  sync_jobs       │    ┌───────▼────────────────────────┐</span></span>
<span class="line"><span>│  documents       │◄───│  Worker  ·  BullMQ consumer    │</span></span>
<span class="line"><span>│  document_chunks │    │                                 │</span></span>
<span class="line"><span>└──────────────────┘    │  dispatch job  (every 30s)      │</span></span>
<span class="line"><span>                        │    finds due connectors          │</span></span>
<span class="line"><span>                        │    enqueues &quot;sync&quot; jobs          │</span></span>
<span class="line"><span>                        │                                 │</span></span>
<span class="line"><span>                        │  sync job  (concurrency=1)       │</span></span>
<span class="line"><span>                        │    runSync()                     │</span></span>
<span class="line"><span>                        │      ↳ listDocuments()           │</span></span>
<span class="line"><span>                        │      ↳ fetchContent()            │</span></span>
<span class="line"><span>                        │      ↳ ingestDocument()          │</span></span>
<span class="line"><span>                        └─────────────────────────────────┘</span></span>
<span class="line"><span>                                    │ OAuth / REST</span></span>
<span class="line"><span>                                    ▼</span></span>
<span class="line"><span>                         ┌──────────────────────┐</span></span>
<span class="line"><span>                         │  External APIs        │</span></span>
<span class="line"><span>                         │  Google Drive         │</span></span>
<span class="line"><span>                         │  Notion               │</span></span>
<span class="line"><span>                         │  Slack                │</span></span>
<span class="line"><span>                         └──────────────────────┘</span></span></code></pre></div><hr><h2 id="how-a-connector-sync-works-end-to-end" tabindex="-1">How a connector sync works end to end <a class="header-anchor" href="#how-a-connector-sync-works-end-to-end" aria-label="Permalink to &quot;How a connector sync works end to end&quot;">​</a></h2><h3 id="_1-connector-creation-and-oauth" tabindex="-1">1. Connector creation and OAuth <a class="header-anchor" href="#_1-connector-creation-and-oauth" aria-label="Permalink to &quot;1. Connector creation and OAuth&quot;">​</a></h3><p>When a user clicks &quot;Connect Google Drive&quot;:</p><ol><li>Frontend calls <code>POST /orgs/:slug/connectors</code> → creates a row in <code>connectors</code> with <code>has_credentials = false</code></li><li>Frontend calls <code>GET /connectors/:id/oauth/authorize</code> → backend calls <code>connector.authorizeUrl(state)</code> and returns the Google consent URL</li><li>A random <code>state</code> param is stored in <code>localStorage</code> as <code>oauth_state:&lt;state&gt;</code> → maps to <code>{ connector_id, org_slug, kind }</code></li><li>User approves at Google → redirected to <code>GET /oauth/google_drive/callback?code=…&amp;state=…</code></li><li>Backend reads state from the request, calls <code>connector.exchangeCode(code, redirectUri)</code> → receives <code>{ access_token, refresh_token, expiry_date, ... }</code></li><li>Credentials encrypted with AES-GCM and stored in <code>connectors.credentials</code>. <code>has_credentials</code> set to <code>true</code></li></ol><h3 id="_2-dispatch-scheduling" tabindex="-1">2. Dispatch scheduling <a class="header-anchor" href="#_2-dispatch-scheduling" aria-label="Permalink to &quot;2. Dispatch scheduling&quot;">​</a></h3><p>A BullMQ repeating job named <code>&quot;dispatch&quot;</code> runs every 30 seconds inside the worker. It queries:</p><div class="language-sql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">sql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">SELECT</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> id, org_id, kind, config, sync_frequency, last_synced_at</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">FROM</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> connectors</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">WHERE</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> status</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> NOT</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> IN</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;paused&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;error&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  AND</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> credentials </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">IS NOT NULL</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  AND</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> has_credentials </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> true</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  AND</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    last_synced_at </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">IS</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> NULL</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    OR</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> last_synced_at </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">+</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> sync_frequency::interval </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&lt;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> now</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">()</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  )</span></span></code></pre></div><p>For each result it checks whether a BullMQ job already exists for that connector ID (preventing double-dispatch). If not, it:</p><ul><li>Inserts a <code>sync_jobs</code> row with <code>status = &#39;pending&#39;</code>, <code>triggered_by = &#39;scheduled&#39;</code></li><li>Enqueues a <code>&quot;sync&quot;</code> BullMQ job with <code>{ syncJobId, connectorId }</code> payload</li></ul><p>Manual sync (clicking &quot;Sync now&quot; in the UI) bypasses the schedule check and goes straight to enqueueing.</p><h3 id="_3-sync-execution-—-three-stage-pipeline" tabindex="-1">3. Sync execution — three-stage pipeline <a class="header-anchor" href="#_3-sync-execution-—-three-stage-pipeline" aria-label="Permalink to &quot;3. Sync execution — three-stage pipeline&quot;">​</a></h3><p>The sync worker picks up jobs using a staged pipeline. A sync job spawns three job types:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Stage 1: Enumerate                Stage 2: Document (per doc)        Stage 3: Finalize</span></span>
<span class="line"><span>─────────────────────            ──────────────────────────          ─────────────</span></span>
<span class="line"><span>BullMQ: &quot;sync-enumerate&quot;         BullMQ: &quot;sync-document&quot; (N jobs)   BullMQ: &quot;sync-finalize&quot;</span></span>
<span class="line"><span>  │                                │                                   │</span></span>
<span class="line"><span>  ├─ Load connector               ├─ Load connector                  ├─ Wait for Stage 2</span></span>
<span class="line"><span>  ├─ Decrypt credentials          ├─ Decrypt credentials            │  (all docs processed)</span></span>
<span class="line"><span>  ├─ Get checkpoint               ├─ Fetch document via plugin      │</span></span>
<span class="line"><span>  ├─ Call plugin.enumerate()      ├─ Build CanonicalDocumentEnvelope ├─ Save checkpoint</span></span>
<span class="line"><span>  │  └─ yields N items            ├─ Call ingestCanonicalDocument() │  └─ stores in DB</span></span>
<span class="line"><span>  │                               │  └─ Normalize → Chunk → Index    │</span></span>
<span class="line"><span>  └─ Enqueue N &quot;sync-document&quot;    └─ Increment docs_processed       └─ UPDATE connectors</span></span>
<span class="line"><span>     jobs + 1 &quot;sync-finalize&quot;</span></span></code></pre></div><p>Each stage is <strong>strongly typed</strong> with job data:</p>`,21),s("ul",null,[s("li",{"syncJobId,":"",connectorId:""},[s("code",null,"EnumerateJobData"),n(":")]),s("li",{"syncJobId,":"","connectorId,":"","ref:":"",ConnectorDocumentRef:""},[s("code",null,"DocumentJobData"),n(":")]),s("li",{"syncJobId,":"","connectorId,":"","checkpoint,":"",encryptedCredentials:""},[s("code",null,"FinalizeJobData"),n(":")])],-1),e(`<h3 id="_4-connector-specific-fetch-behaviour" tabindex="-1">4. Connector-specific fetch behaviour <a class="header-anchor" href="#_4-connector-specific-fetch-behaviour" aria-label="Permalink to &quot;4. Connector-specific fetch behaviour&quot;">​</a></h3><p><strong>Google Drive</strong></p><ul><li>Calls Drive API with <code>q: modifiedTime &gt; &#39;ISO_STRING&#39;</code> when <code>last_synced_at</code> is set</li><li>Supported mime types: Google Docs (export as text), Sheets (export as CSV), Slides (export as text), PDF, plain text, Markdown, HTML, CSV</li><li>Files streamed via <code>alt=media</code>, capped at <strong>2 MB</strong> to prevent OOM on large binaries</li><li>PDFs: raw bytes collected into a <code>Buffer</code>, parsed with <code>pdf-parse</code> (loaded via <code>require()</code> because it&#39;s a CJS module)</li><li>HTML: tags stripped before indexing</li></ul><p><strong>Notion</strong></p><ul><li>Uses Notion search API, 100 pages per request</li><li>Blocks collected recursively up to depth 5</li><li>Title extracted from the first property named <code>&quot;title&quot;</code>, <code>&quot;Name&quot;</code>, or <code>&quot;Title&quot;</code></li><li>Filter: <code>filter.last_edited_time.after = last_synced_at</code></li></ul><p><strong>Slack</strong></p><ul><li>Lists all accessible channels, fetches messages 200 at a time</li><li>Threads fetched separately via <code>conversations.replies</code></li><li>Each message indexed as <code>kind: &quot;message&quot;</code>, <code>ext: &quot;slack&quot;</code></li><li>Filter: messages with <code>ts &gt; last_synced_at</code> unix timestamp</li></ul><hr><h2 id="how-a-search-request-works" tabindex="-1">How a search request works <a class="header-anchor" href="#how-a-search-request-works" aria-label="Permalink to &quot;How a search request works&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>GET /orgs/acme/search?q=product+roadmap&amp;connector_id=uuid&amp;limit=20&amp;offset=0</span></span>
<span class="line"><span>  │</span></span>
<span class="line"><span>  ▼</span></span>
<span class="line"><span>search-service.ts: fullTextSearch(orgId, options)</span></span>
<span class="line"><span>  │</span></span>
<span class="line"><span>  ├─ 1. Stop word check</span></span>
<span class="line"><span>  │       SELECT (websearch_to_tsquery(&#39;english&#39;, &#39;product roadmap&#39;)::text = &#39;&#39;) AS is_empty</span></span>
<span class="line"><span>  │       → false, continue</span></span>
<span class="line"><span>  │</span></span>
<span class="line"><span>  ├─ 2. Build WHERE clause</span></span>
<span class="line"><span>  │       d.org_id = $1</span></span>
<span class="line"><span>  │       AND d.connector_id = $3   ← if connector_id filter present</span></span>
<span class="line"><span>  │</span></span>
<span class="line"><span>  ├─ 3. Run FTS + count in parallel</span></span>
<span class="line"><span>  │       Promise.all([</span></span>
<span class="line"><span>  │         buildFtsQuery(whereClause, ...)   → ranked results + snippets</span></span>
<span class="line"><span>  │         buildFtsCountQuery(whereClause)   → total count (no ranking)</span></span>
<span class="line"><span>  │       ])</span></span>
<span class="line"><span>  │</span></span>
<span class="line"><span>  ├─ 4. total &gt; 0 ? return FTS results</span></span>
<span class="line"><span>  │</span></span>
<span class="line"><span>  └─ 5. total = 0 ? run fuzzy fallback</span></span>
<span class="line"><span>          similarity(d.title, $2) &gt; 0.1</span></span>
<span class="line"><span>          ORDER BY raw_score DESC</span></span></code></pre></div><p>The response shape:</p><div class="language-json vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">json</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;query&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;product roadmap&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;total&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">12</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;limit&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">20</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;offset&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;results&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      &quot;id&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;uuid&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      &quot;title&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Q3 Product Roadmap&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      &quot;url&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;https://docs.google.com/document/d/...&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      &quot;kind&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;document&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      &quot;ext&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">null</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      &quot;snippet&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;…the &lt;&lt;product roadmap&gt;&gt; for Q3 focuses on…&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      &quot;score&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.42</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      &quot;mtime&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;2024-03-10T09:00:00Z&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      &quot;connector_kind&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;google_drive&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      &quot;connector_name&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Company Drive&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  ]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><code>&lt;&lt;</code> / <code>&gt;&gt;</code> delimiters in the snippet are rendered as yellow highlights in the frontend.</p><hr><h2 id="multi-tenancy" tabindex="-1">Multi-tenancy <a class="header-anchor" href="#multi-tenancy" aria-label="Permalink to &quot;Multi-tenancy&quot;">​</a></h2><p>Every table that stores user data has an <code>org_id</code> UUID column. The enforcement happens at the API layer:</p><div class="language-ts vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ts</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// Every org-scoped route resolves the org first</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> org</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> await</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> getOrgBySlug</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(slug)            </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// 404 if not found</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> membership</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> await</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> getCurrentMembership</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(org.id, user.id)  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// 403 if not member</span></span></code></pre></div><p>There is no row-level security in PostgreSQL — the <code>org_id</code> filter is always injected by the application. All SQL query builders in <code>sql/</code> accept <code>orgId</code> as their first parameter and always include <code>WHERE org_id = $1</code>.</p><p><strong>Roles</strong> enforced per request (no caching):</p><ul><li><code>owner</code> — full access, including deleting the org</li><li><code>admin</code> — manage connectors and members</li><li><code>member</code> — read-only: search, browse files, view connector status</li></ul><hr><h2 id="connector-pause-resume" tabindex="-1">Connector pause / resume <a class="header-anchor" href="#connector-pause-resume" aria-label="Permalink to &quot;Connector pause / resume&quot;">​</a></h2><p>Pausing sets <code>connectors.status = &#39;paused&#39;</code>. The dispatch job&#39;s eligibility query filters out paused connectors (<code>status NOT IN (&#39;paused&#39;, &#39;error&#39;)</code>), so no new sync jobs are enqueued. Any sync already running finishes normally — pause takes effect on the next cycle.</p><p>Resuming sets <code>status = &#39;idle&#39;</code>, making the connector eligible for the next dispatch cycle.</p><hr><h2 id="key-design-decisions-and-why" tabindex="-1">Key design decisions and why <a class="header-anchor" href="#key-design-decisions-and-why" aria-label="Permalink to &quot;Key design decisions and why&quot;">​</a></h2><table tabindex="0"><thead><tr><th>Decision</th><th>Why</th></tr></thead><tbody><tr><td>BullMQ + Redis (not DB polling)</td><td>Reliable delivery, deduplication, and retry semantics without holding DB connections open in a loop</td></tr><tr><td>Concurrency = 1 on the sync worker</td><td>Document chunks are deleted then re-inserted. Concurrent syncs on the same connector could race on this delete.</td></tr><tr><td>GIN indexes on <code>search_vector</code></td><td>Lets <code>search_vector @@ tsq</code> skip tokenisation at query time — the difference between milliseconds and seconds at scale</td></tr><tr><td><code>Promise.all</code> for FTS + count</td><td>The count query (no ranking, no headline) is cheap and can run in parallel with the main query — no extra latency</td></tr><tr><td>Raw SQL, no ORM</td><td>All queries are in <code>backend/src/sql/</code>. Every query is readable, tunable, and version-controlled. No magic.</td></tr><tr><td>Stop word short-circuit</td><td>Searching &quot;the&quot; would produce an empty tsquery → fall through to fuzzy → full table scan on title similarity. The early exit prevents this completely.</td></tr><tr><td>Content hash includes title</td><td><code>SHA-256(title::content)</code> so a rename-only change still triggers re-index</td></tr></tbody></table><hr><h2 id="backend-domain-structure" tabindex="-1">Backend domain structure <a class="header-anchor" href="#backend-domain-structure" aria-label="Permalink to &quot;Backend domain structure&quot;">​</a></h2><p>The backend is organized as a <strong>modular monolith</strong> with clear domain boundaries aligned to the sync pipeline:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>backend/src/</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── connectors/              Stage 0: Fetch raw items from external sources</span></span>
<span class="line"><span>│   ├── plugin-types.ts      strict ConnectorPlugin interface contract</span></span>
<span class="line"><span>│   ├── registry.ts          provider registration &amp; resolution</span></span>
<span class="line"><span>│   ├── google-drive.ts      Google Drive provider</span></span>
<span class="line"><span>│   ├── notion.ts            Notion provider</span></span>
<span class="line"><span>│   └── slack.ts             Slack provider</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── normalization/           Stage 1: Sanitize, deduplicate, upsert documents</span></span>
<span class="line"><span>│   ├── normalizer.ts        sanitize content, compute checksums, run dedup check</span></span>
<span class="line"><span>│   └── index.ts             re-export NormalizedDocument interface</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── chunking/                Stage 2: Split content into searchable units</span></span>
<span class="line"><span>│   ├── chunk-processor.ts   chunkText, calculate token counts, persist chunks</span></span>
<span class="line"><span>│   └── index.ts             re-export ProcessedChunk interface</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── indexing/                Stage 3: Write to search backends (GIN vectors)</span></span>
<span class="line"><span>│   ├── indexer.ts           updateSearchIndex(), finalizeSearchability()</span></span>
<span class="line"><span>│   └── index.ts             re-export index functions</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── permissions/             Stage 4: Resolve and attach ACL metadata</span></span>
<span class="line"><span>│   ├── permission-resolver.ts  resolveDocumentPermissions(), validateAndAttachPermissions()</span></span>
<span class="line"><span>│   └── index.ts             re-export PermissionEntry, ResolvedPermissions types</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── workers/                 Job orchestration &amp; scheduling</span></span>
<span class="line"><span>│   ├── processor.ts         process{Enumerate,Document,Finalize}Job() with typed errors</span></span>
<span class="line"><span>│   ├── scheduler.ts         dispatchDueSyncs() every 30s</span></span>
<span class="line"><span>│   ├── index.ts             BullMQ Worker setup, job routing</span></span>
<span class="line"><span>│   └── queue.ts             BullMQ queue instance</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── routes/                  HTTP endpoints (one file per resource)</span></span>
<span class="line"><span>│   ├── auth.ts              login, register, refresh, logout</span></span>
<span class="line"><span>│   ├── connectors.ts        OAuth setup, list, pause/resume, manual sync</span></span>
<span class="line"><span>│   ├── oauth.ts             OAuth callback handler</span></span>
<span class="line"><span>│   ├── documents.ts         list documents with filters</span></span>
<span class="line"><span>│   ├── search.ts            full-text + fuzzy search</span></span>
<span class="line"><span>│   └── orgs.ts              multi-tenant org management</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── services/</span></span>
<span class="line"><span>│   ├── indexer.ts           facade: ingestCanonicalDocument() → calls pipeline stages</span></span>
<span class="line"><span>│   ├── search-service.ts    fullTextSearch() with fallback</span></span>
<span class="line"><span>│   ├── auth-service.ts      JWT, session, refresh logic</span></span>
<span class="line"><span>│   └── …</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── middleware/</span></span>
<span class="line"><span>│   └── auth.ts              requireCurrentUser, getCurrentMembership, requireRole</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── sql/                     All SQL as typed constants &amp; builders</span></span>
<span class="line"><span>│   ├── schema.ts            CREATE TABLE, CREATE INDEX (idempotent)</span></span>
<span class="line"><span>│   ├── search.ts            FTS, fuzzy, count queries</span></span>
<span class="line"><span>│   ├── documents.ts         list/count queries w/ filters</span></span>
<span class="line"><span>│   ├── indexer.ts           upsert document, chunk CRUD, search_vector updates</span></span>
<span class="line"><span>│   ├── connectors.ts        connector CRUD</span></span>
<span class="line"><span>│   ├── checkpoints.ts       connector_sync_state select/upsert</span></span>
<span class="line"><span>│   ├── sync-jobs.ts         sync_jobs lifecycle, counters</span></span>
<span class="line"><span>│   └── …</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── types/</span></span>
<span class="line"><span>│   ├── document-envelope.ts  CanonicalDocumentEnvelope — 23-field standard doc model</span></span>
<span class="line"><span>│   ├── sync-errors.ts       SyncPipelineError, SyncErrorCode enum</span></span>
<span class="line"><span>│   ├── connector.ts         ConnectorConfig, ConnectorDocument</span></span>
<span class="line"><span>│   ├── db.ts               DocRow, ChunkRow, ConnectorRow</span></span>
<span class="line"><span>│   └── …</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>└── utils/</span></span>
<span class="line"><span>    ├── chunker.ts           chunkText(), approximateTokenCount()</span></span>
<span class="line"><span>    ├── security.ts          sha256(), encrypt/decryptCredentials()</span></span>
<span class="line"><span>    ├── logger.ts            structured logging</span></span>
<span class="line"><span>    └── …</span></span></code></pre></div><h3 id="pipeline-stages-intake-to-search" tabindex="-1">Pipeline stages (intake to search) <a class="header-anchor" href="#pipeline-stages-intake-to-search" aria-label="Permalink to &quot;Pipeline stages (intake to search)&quot;">​</a></h3><p>Each stage owns its inputs, outputs, and error handling:</p><table tabindex="0"><thead><tr><th>Stage</th><th>Input</th><th>Output</th><th>Module</th><th>Responsibility</th></tr></thead><tbody><tr><td>0 — Fetch</td><td>ConnectorPlugin</td><td>CanonicalDocumentEnvelope</td><td><code>connectors/</code></td><td>Raw item enumeration, OAuth, rate limits</td></tr><tr><td>1 — Normalize</td><td>CanonicalDocumentEnvelope</td><td>NormalizedDocument</td><td><code>normalization/</code></td><td>Content sanitization, checksum, dedup check</td></tr><tr><td>2 — Chunk</td><td>NormalizedDocument</td><td>ProcessedChunk[]</td><td><code>chunking/</code></td><td>Text splitting, token counting, persistence</td></tr><tr><td>3 — Index</td><td>ProcessedChunk[]</td><td>void</td><td><code>indexing/</code></td><td>GIN vector update, full-text indexing</td></tr><tr><td>4 — Permissions</td><td>CanonicalDocumentEnvelope</td><td>ResolvedPermissions</td><td><code>permissions/</code></td><td>ACL metadata, org-level visibility checks</td></tr></tbody></table><hr><h2 id="codebase-map" tabindex="-1">Codebase map <a class="header-anchor" href="#codebase-map" aria-label="Permalink to &quot;Codebase map&quot;">​</a></h2>`,36)])])}const y=i(l,[["render",o]]);export{g as __pageData,y as default};
