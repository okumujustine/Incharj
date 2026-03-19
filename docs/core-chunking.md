# Core: Chunking

Chunking transforms normalized text into search units.

Source module:
- `backend/src/chunking/chunk-processor.ts`

---

## Behavior

`processChunks(...)` does four things:

1. Delete prior chunks for the document
2. Split content using `chunkText(content, 800, 100)`
3. Compute token count per chunk via `approximateTokenCount(...)`
4. Insert each chunk with stable `chunk_index`

Returns `ProcessedChunk[]` with:
- `index`
- `text`
- `tokenCount`

---

## Why full replace is used

Chunk rows are deleted and re-inserted rather than diffed.

Reason:
- Content edits shift boundaries, making chunk-level diffs brittle.
- Full replace keeps ordering and snippet behavior deterministic.

---

## Key SQL usage

- `SQL_DELETE_DOCUMENT_CHUNKS`
- `SQL_INSERT_DOCUMENT_CHUNK`

This stage is pure chunk persistence; search ranking vectors are updated in indexing.
