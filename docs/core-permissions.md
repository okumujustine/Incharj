# Core: Permissions

Permissions is the ACL boundary for search visibility.

Source module:
- `backend/src/permissions/permission-resolver.ts`

---

## Current model

Types:

- `PermissionEntry`
  - `principalId`
  - `principalType`: `user | group | org`
  - `accessLevel`: `view | comment | edit`
- `ResolvedPermissions`
  - grouped by `canView`, `canComment`, `canEdit`
  - includes `isPublic`

Current resolver behavior is org-scoped fallback:
- one org-level `view` permission is returned
- no per-user/group ACL parsing yet

---

## Functions

1. `resolveDocumentPermissions(orgId, documentId, sourcePermissions)`
   - converts source ACL metadata into internal permissions
   - currently returns org-level default
2. `validateAndAttachPermissions(...)`
   - validates that view permissions exist
   - persistence hooks are marked TODO

---

## Planned expansion

- Parse connector-native ACL payloads (`sourcePermissions`)
- Persist resolved permissions to dedicated tables
- Enforce principal-level filtering during search retrieval
