import type { FastifyInstance } from "fastify";
import { query } from "../db";
import { NotFoundError } from "../errors";
import { getCurrentMembership, getCurrentUser, requireCurrentUser } from "../middleware/auth";
import { SQL_DELETE_DOCUMENT, SQL_SELECT_DOCUMENT_BY_ID, SQL_SELECT_DOCUMENT_CHUNKS, buildListDocumentsSql } from "../sql/documents";
import { getOrgBySlug } from "../sql/orgs";
import { mapDocument } from "../utils/serialization";

export default async function documentRoutes(api: FastifyInstance) {
  api.get("/documents", { preHandler: requireCurrentUser }, async (request) => {
    const currentUser = getCurrentUser(request);
    const queryParams = request.query as Record<string, string>;
    const organization = await getOrgBySlug(queryParams.org);
    await getCurrentMembership(queryParams.org, currentUser.id);
    const values: unknown[] = [organization.id];
    const filters = ["org_id = $1"];
    if (queryParams.connector_id) {
      values.push(queryParams.connector_id);
      filters.push(`connector_id = $${values.length}`);
    }
    if (queryParams.kind) {
      values.push(queryParams.kind);
      filters.push(`kind = $${values.length}`);
    }
    if (queryParams.ext) {
      values.push(queryParams.ext);
      filters.push(`ext = $${values.length}`);
    }
    values.push(Number(queryParams.limit ?? 50), Number(queryParams.offset ?? 0));
    const result = await query(buildListDocumentsSql(filters, values.length - 1, values.length), values);
    return result.rows.map((row) => mapDocument(row));
  });

  api.get("/documents/:documentId", { preHandler: requireCurrentUser }, async (request) => {
    const currentUser = getCurrentUser(request);
    const { documentId } = request.params as { documentId: string };
    const { org } = request.query as { org: string };
    const organization = await getOrgBySlug(org);
    await getCurrentMembership(org, currentUser.id);
    const documentResult = await query(SQL_SELECT_DOCUMENT_BY_ID, [documentId, organization.id]);
    const document = documentResult.rows[0];
    if (!document) throw new NotFoundError("Document not found");
    const chunks = await query(SQL_SELECT_DOCUMENT_CHUNKS, [documentId]);
    return mapDocument(document, chunks.rows);
  });

  api.delete("/documents/:documentId", { preHandler: requireCurrentUser }, async (request, reply) => {
    const currentUser = getCurrentUser(request);
    const { documentId } = request.params as { documentId: string };
    const { org } = request.query as { org: string };
    const organization = await getOrgBySlug(org);
    await getCurrentMembership(org, currentUser.id);
    const result = await query(SQL_DELETE_DOCUMENT, [documentId, organization.id]);
    if (!result.rowCount) throw new NotFoundError("Document not found");
    reply.status(204).send();
  });
}
