/**
 * PermissionResolver handles ACL and access control metadata.
 * Responsibilities:
 * - Resolve document permissions from connector
 * - Attach ACL metadata to documents
 * - Enforce multi-tenancy boundaries
 * - Validate permission state before search exposure
 */

export interface PermissionEntry {
  principalId: string;
  principalType: "user" | "group" | "org";
  accessLevel: "view" | "comment" | "edit";
  inheritedFrom?: string;
}

export interface ResolvedPermissions {
  orgId: string;
  documentId: string;
  canView: PermissionEntry[];
  canComment: PermissionEntry[];
  canEdit: PermissionEntry[];
  isPublic: boolean;
}

/**
 * Resolve permissions for a document from connector metadata.
 * For now: org-scoped (all org members can view if searchable).
 * Future: support fine-grained ACLs from connectors.
 */
export async function resolveDocumentPermissions(
  orgId: string,
  documentId: string,
  sourcePermissions: string | null | undefined
): Promise<ResolvedPermissions> {
  // TODO: Parse sourcePermissions JSON from connector
  // TODO: Map connector ACLs to internal PermissionEntry format
  
  // For now: org-wide visible documents with org-level view permission
  return {
    orgId,
    documentId,
    canView: [
      {
        principalId: orgId,
        principalType: "org",
        accessLevel: "view",
      },
    ],
    canComment: [],
    canEdit: [],
    isPublic: false,
  };
}

/**
 * Validate that document permissions are set before making searchable.
 */
export async function validateAndAttachPermissions(
  orgId: string,
  documentId: string,
  sourcePermissions: string | null | undefined
): Promise<void> {
  const perms = await resolveDocumentPermissions(orgId, documentId, sourcePermissions);
  
  // TODO: Store resolved permissions to document_permissions table
  // TODO: Update document.is_public if applicable
  
  if (!perms.canView.length) {
    throw new Error(`Document ${documentId} has no read permissions`);
  }
}
