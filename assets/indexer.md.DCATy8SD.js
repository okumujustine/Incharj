import{_ as n,o as s,c as e,ag as i}from"./chunks/framework.DAvaMl8U.js";const u=JSON.parse('{"title":"Core Overview","description":"","frontmatter":{},"headers":[],"relativePath":"indexer.md","filePath":"indexer.md"}'),p={name:"indexer.md"};function o(r,a,c,l,t,d){return s(),e("div",null,[...a[0]||(a[0]=[i(`<h1 id="core-overview" tabindex="-1">Core Overview <a class="header-anchor" href="#core-overview" aria-label="Permalink to &quot;Core Overview&quot;">​</a></h1><p>The ingestion core is documented as split modules that match the backend structure.</p><h2 id="detailed-core-docs" tabindex="-1">Detailed core docs <a class="header-anchor" href="#detailed-core-docs" aria-label="Permalink to &quot;Detailed core docs&quot;">​</a></h2><ul><li><a href="/Incharj/core-orchestration">Core: Orchestration</a></li><li><a href="/Incharj/core-connectors">Core: Connectors (Plugin Layer)</a></li><li><a href="/Incharj/core-normalization">Core: Normalization</a></li><li><a href="/Incharj/core-chunking">Core: Chunking</a></li><li><a href="/Incharj/core-indexing">Core: Indexing</a></li><li><a href="/Incharj/core-permissions">Core: Permissions</a></li></ul><hr><h2 id="pipeline-map" tabindex="-1">Pipeline map <a class="header-anchor" href="#pipeline-map" aria-label="Permalink to &quot;Pipeline map&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Connector Plugin</span></span>
<span class="line"><span>  enumerate() + fetchDocument()</span></span>
<span class="line"><span>        |</span></span>
<span class="line"><span>        v</span></span>
<span class="line"><span>Normalization</span></span>
<span class="line"><span>  sanitize + checksum + dedup + upsert documents</span></span>
<span class="line"><span>        |</span></span>
<span class="line"><span>        v</span></span>
<span class="line"><span>Chunking</span></span>
<span class="line"><span>  split content + token counts + persist chunks</span></span>
<span class="line"><span>        |</span></span>
<span class="line"><span>        v</span></span>
<span class="line"><span>Indexing</span></span>
<span class="line"><span>  update document search vectors</span></span>
<span class="line"><span>        |</span></span>
<span class="line"><span>        v</span></span>
<span class="line"><span>Permissions</span></span>
<span class="line"><span>  resolve ACL metadata (org fallback today)</span></span></code></pre></div><hr><h2 id="core-code-map" tabindex="-1">Core code map <a class="header-anchor" href="#core-code-map" aria-label="Permalink to &quot;Core code map&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>backend/src/</span></span>
<span class="line"><span>|- connectors/        plugin contracts, providers, registry</span></span>
<span class="line"><span>|- normalization/     normalizeDocument()</span></span>
<span class="line"><span>|- chunking/          processChunks()</span></span>
<span class="line"><span>|- indexing/          updateSearchIndex()</span></span>
<span class="line"><span>|- permissions/       resolveDocumentPermissions()</span></span>
<span class="line"><span>\`- workers/           processEnumerate/Document/FinalizeJob()</span></span></code></pre></div><p>Ingestion facade:</p><ul><li><code>backend/src/services/indexer.ts</code></li></ul><p>This facade coordinates stage modules in a single transaction scope per document.</p>`,13)])])}const m=n(p,[["render",o]]);export{u as __pageData,m as default};
