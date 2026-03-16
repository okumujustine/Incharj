import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "../config";
import { query } from "../db";
import { getCurrentMembership, getCurrentUser, requireCurrentUser } from "../middleware/auth";
import { getConnector } from "../connectors/registry";
import { SQL_UPDATE_CONNECTOR_CREDENTIALS, getConnectorOr404 } from "../sql/connectors";
import { getOrgBySlug } from "../sql/orgs";
import { mapConnector } from "../utils/serialization";
import { encryptCredentials } from "../utils/security";

export default async function oauthRoutes(api: FastifyInstance) {
  api.get("/oauth/:kind/authorize", { preHandler: requireCurrentUser }, async (request) => {
    const { kind } = request.params as { kind: string };
    const state = randomUUID();
    const connector = getConnector({
      kind,
      connectorId: "00000000-0000-0000-0000-000000000000",
      orgId: "00000000-0000-0000-0000-000000000000",
      credentials: {},
    });
    return { authorization_url: connector.authorizeUrl(state), state };
  });

  api.get("/oauth/:kind/callback", { preHandler: requireCurrentUser }, async (request) => {
    const currentUser = getCurrentUser(request);
    const { kind } = request.params as { kind: string };
    const { code, connector_id: connectorId, org: orgSlug } = request.query as Record<string, string>;
    const org = await getOrgBySlug(orgSlug);
    await getCurrentMembership(orgSlug, currentUser.id);
    const connectorRow = await getConnectorOr404(connectorId, org.id);
    const connector = getConnector({
      kind,
      connectorId: connectorRow.id,
      orgId: org.id,
      credentials: {},
      config: connectorRow.config,
    });
    const credentials = await connector.exchangeCode(
      code,
      `${config.frontendUrl}/oauth/${kind}/callback`
    );
    const result = await query(SQL_UPDATE_CONNECTOR_CREDENTIALS, [
      connectorRow.id,
      org.id,
      encryptCredentials(credentials),
    ]);
    return mapConnector(result.rows[0]);
  });
}
