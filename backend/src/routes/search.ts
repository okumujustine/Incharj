import type { FastifyInstance } from "fastify";
import { withTransaction } from "../db";
import { getCurrentMembership, getCurrentUser, requireCurrentUser } from "../middleware/auth";
import { fullTextSearch } from "../services/search-service";
import { getOrgBySlug } from "../sql/orgs";

export default async function searchRoutes(api: FastifyInstance) {
  api.get("/orgs/:orgSlug/search", { preHandler: requireCurrentUser }, async (request) => {
    const currentUser = getCurrentUser(request);
    const { orgSlug } = request.params as { orgSlug: string };
    const queryParams = request.query as Record<string, string>;
    const organization = await getOrgBySlug(orgSlug);
    await getCurrentMembership(orgSlug, currentUser.id);
    return withTransaction((client) =>
      fullTextSearch(client, {
        orgId: organization.id,
        query: queryParams.q,
        connectorId: queryParams.connector_id,
        kind: queryParams.kind,
        fromDate: queryParams.date_from,
        toDate: queryParams.date_to,
        limit: Number(queryParams.limit ?? 20),
        offset: Number(queryParams.offset ?? 0),
      })
    );
  });
}
