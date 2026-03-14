export function shortenPath(fullPath: string): string {
  return fullPath.replace(/^\/Users\/[^/]+/, "~");
}

export function splitPath(fullPath: string): { name: string; dir: string } {
  const sep = fullPath.includes("/") ? "/" : "\\";
  const parts = fullPath.split(sep);
  const name = parts.pop() || fullPath;
  const dir = shortenPath(parts.join(sep));
  return { name, dir };
}

export function formatAge(ms: number): string {
  if (!ms) return "";
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * Safely render a snippet with <<MATCH>>…<<END>> delimiters.
 * HTML is escaped first; then the escaped-delimiter forms are replaced
 * with styled <mark> tags (same approach as the original vanilla renderer).
 */
export function renderSnippet(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;&lt;MATCH&gt;&gt;/g, '<mark class="match-mark">')
    .replace(/&lt;&lt;END&gt;&gt;/g, "</mark>");
}

// ── File kind ────────────────────────────────────────────────

export type FileKind = "doc" | "code" | "pdf" | "other";
export type FileTone = "accent" | "neutral" | "muted";

const CODE_EXTS = new Set([
  "ts","tsx","js","jsx","py","rb","go","rs","java","c","cpp","cs","php",
  "swift","kt","sh","bash","zsh","fish","lua","r","scala","clj","ex","exs",
  "elm","hs","ml","sql","html","css","scss","less","json","yaml","yml","toml","xml",
]);

const DOC_EXTS = new Set([
  "md","mdx","txt","rtf","doc","docx","odt","pages","tex","rst",
]);

export function getFileKind(ext: string): FileKind {
  const e = ext.toLowerCase().replace(".", "");
  if (e === "pdf") return "pdf";
  if (CODE_EXTS.has(e)) return "code";
  if (DOC_EXTS.has(e)) return "doc";
  return "other";
}

export function getExtLabel(ext: string): string {
  const e = ext.toLowerCase().replace(".", "");
  return e || "file";
}

export function getFileTone(ext: string): FileTone {
  const e = ext.toLowerCase().replace(".", "");
  if (e === "pdf" || DOC_EXTS.has(e)) return "neutral";
  if (CODE_EXTS.has(e)) return "accent";
  return "muted";
}

// ── Badge styles ─────────────────────────────────────────────
// Full static class strings so Tailwind's scanner can detect them.

export function getBadgeClasses(ext: string): string {
  const e = ext.toLowerCase().replace(".", "");
  if (e === "pdf")                                      return "bg-red-500/15 text-red-400";
  if (e === "md" || e === "mdx")                        return "bg-violet-500/15 text-violet-400";
  if (e === "txt" || e === "rtf")                       return "bg-blue-400/15 text-blue-400";
  if (e === "doc" || e === "docx" || e === "pages")     return "bg-blue-500/15 text-blue-400";
  if (e === "json" || e === "yaml" || e === "yml" || e === "toml") return "bg-emerald-500/15 text-emerald-400";
  if (e === "ts" || e === "tsx")                        return "bg-sky-500/15 text-sky-400";
  if (e === "js" || e === "jsx")                        return "bg-yellow-500/15 text-yellow-400";
  if (e === "py")                                       return "bg-blue-500/15 text-blue-400";
  if (e === "go")                                       return "bg-teal-500/15 text-teal-400";
  if (e === "rs")                                       return "bg-orange-500/15 text-orange-400";
  if (e === "html" || e === "css" || e === "scss")      return "bg-pink-500/15 text-pink-400";
  if (e === "sh" || e === "bash" || e === "zsh")        return "bg-lime-500/15 text-lime-400";
  if (CODE_EXTS.has(e))                                 return "bg-orange-500/15 text-orange-400";
  if (DOC_EXTS.has(e))                                  return "bg-blue-400/15 text-blue-400";
  return "bg-white/5 text-tx-muted";
}

// Keep old export name for backward compat with FilesScreen
export const getKindLabel = getExtLabel;
