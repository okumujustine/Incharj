# Core: Normalization

Normalization converts connector outputs into stable internal records.

Source module:
- `backend/src/normalization/normalizer.ts`

---

## Inputs and outputs

Input:
- `CanonicalDocumentEnvelope`

Output:
- `NormalizedDocument`
  - `documentId`
  - `checksum`
  - `wordCount`
  - `wasSkipped`

---

## Responsibilities

1. Content sanitization
   - trim whitespace
   - remove `\0` bytes
   - cap content at 500k chars
2. Checksum generation
   - `sha256(title::content)`
3. Dedup decision
   - compare against existing `documents.content_hash`
4. Upsert document row
   - writes canonical fields and metadata

---

## Key SQL usage

- `SQL_SELECT_DOCUMENT_HASH`
  - detect unchanged content
- `SQL_UPSERT_DOCUMENT`
  - insert/update canonical document row

When `existing.content_hash === checksum`, normalization returns `wasSkipped: true` and downstream chunk/index work is skipped.
