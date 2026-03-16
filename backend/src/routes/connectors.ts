import type { FastifyInstance } from "fastify";
import { query } from "../db";
import { BadRequestError, NotFoundError } from "../errors";
import { getCurrentMembership, getCurrentUser, requireCurrentUser, requireRole } from "../middleware/auth";
import { connectorCreateSchema, connectorUpdateSchema } from "../schemas/connector";
import {
  SQL_DELETE_CONNECTOR,
  SQL_INSERT_CONNECTOR,
  SQL_PAUSE_CONNECTOR,
  SQL_RESUME_CONNECTOR,
  SQL_SELECT_CONNECTORS_BY_ORG,
  buildUpdateConnectorSql,
  getConnectorOr404,
} from "../sql/connectors";
import { SQL_INSERT_SYNC_JOB } from "../sql/sync-jobs";
import { syncQueue } from "../workers/queue";
import { getOrgBySlug } from "../sql/orgs";
import { mapConnector, mapSyncJob } from "../utils/serialization";

export default async function connectorRoutes(api: FastifyInstance) {
  api.get("/orgs/:slug/connectors", { preHandler: requireCurrentUser }, async (request) => {
    const currentUser = getCurrentUser(request);
    const { slug } = request.params as { slug: string };
    const org = await getOrgBySlug(slug);
    await getCurrentMembership(slug, currentUser.id);
    const result = await query(SQL_SELECT_CONNECTORS_BY_ORG, [org.id]);
    return result.rows.map(mapConnector);
  });

  api.post("/orgs/:slug/connectors", { preHandler: requireCurrentUser }, async (request, reply) => {
    const currentUser = getCurrentUser(request);
    const { slug } = request.params as { slug: string };
    const payload = connectorCreateSchema.parse(request.body);
    const org = await getOrgBySlug(slug);
    const membership = await getCurrentMembership(slug, currentUser.id);
    requireRole(membership, ["owner", "admin"]);
    const result = await query(SQL_INSERT_CONNECTOR, [
      org.id, currentUser.id, payload.kind, payload.name,
      payload.config ?? null, payload.sync_frequency,
    ]);
    reply.status(201).send(mapConnector(result.rows[0]));
  });

  api.get("/connectors/:connectorId", { preHandler: requireCurrentUser }, async (request) => {
    const currentUser = getCurrentUser(request);
    const { connectorId } = request.params as { connectorId: string };
    const { org } = request.query as { org: string };
    const organization = await getOrgBySlug(org);
    await getCurrentMembership(org, currentUser.id);
    return mapConnector(await getConnectorOr404(connectorId, organization.id));
  });

  api.patch("/connectors/:connectorId", { preHandler: requireCurrentUser }, async (request) => {
    const currentUser = getCurrentUser(request);
    const { connectorId } = request.params as { connectorId: string };
    const payload = connectorUpdateSchema.parse(request.body);
    const { org } = request.query as { org: string };
    const organization = await getOrgBySlug(org);
    const membership = await getCurrentMembership(org, currentUser.id);
    requireRole(membership, ["owner", "admin"]);
    await getConnectorOr404(connectorId, organization.id);
    const sets: string[] = [];
    const values: unknown[] = [connectorId, organization.id];
    if ("name" in payload) {
      values.push(payload.name ?? null);
      sets.push(`name = $${values.length}`);
    }
    if ("config" in payload) {
      values.push(payload.config ?? null);
      sets.push(`config = $${values.length}`);
    }
    if ("sync_frequency" in payload) {
      values.push(payload.sync_frequency ?? null);
      sets.push(`sync_frequency = $${values.length}`);
    }
    if (!sets.length) return mapConnector(await getConnectorOr404(connectorId, organization.id));
    const result = await query(buildUpdateConnectorSql(sets), values);
    return mapConnector(result.rows[0]);
  });

  api.delete("/connectors/:connectorId", { preHandler: requireCurrentUser }, async (request, reply) => {
    const currentUser = getCurrentUser(request);
    const { connectorId } = request.params as { connectorId: string };
    const { org } = request.query as { org: string };
    const organization = await getOrgBySlug(org);
    const membership = await getCurrentMembership(org, currentUser.id);
    requireRole(membership, ["owner", "admin"]);
    const result = await query(SQL_DELETE_CONNECTOR, [connectorId, organization.id]);
    if (!result.rowCount) throw new NotFoundError("Connector not found");
    reply.status(204).send();
  });

  api.post("/connectors/:connectorId/sync", { preHandler: requireCurrentUser }, async (request, reply) => {
    const currentUser = getCurrentUser(request);
    const { connectorId } = request.params as { connectorId: string };
    const { org } = request.query as { org: string };
    const organization = await getOrgBySlug(org);
    await getCurrentMembership(org, currentUser.id);
    const connector = await getConnectorOr404(connectorId, organization.id);
    if (!connector.credentials) throw new BadRequestError("Connector has no credentials - complete OAuth first");
    const result = await query(SQL_INSERT_SYNC_JOB, [connectorId, organization.id, "manual"]);
    const syncJob = result.rows[0];
    await syncQueue.add("sync", { syncJobId: syncJob.id, connectorId }, {
      jobId: `sync:${syncJob.id}`,
    });
    reply.status(202).send(mapSyncJob(syncJob));
  });

  api.post("/connectors/:connectorId/pause", { preHandler: requireCurrentUser }, async (request) => {
    const currentUser = getCurrentUser(request);
    const { connectorId } = request.params as { connectorId: string };
    const { org } = request.query as { org: string };
    const organization = await getOrgBySlug(org);
    const membership = await getCurrentMembership(org, currentUser.id);
    requireRole(membership, ["owner", "admin"]);
    const result = await query(SQL_PAUSE_CONNECTOR, [connectorId, organization.id]);
    if (!result.rowCount) throw new NotFoundError("Connector not found");
    return mapConnector(result.rows[0]);
  });

  api.post("/connectors/:connectorId/resume", { preHandler: requireCurrentUser }, async (request) => {
    const currentUser = getCurrentUser(request);
    const { connectorId } = request.params as { connectorId: string };
    const { org } = request.query as { org: string };
    const organization = await getOrgBySlug(org);
    const membership = await getCurrentMembership(org, currentUser.id);
    requireRole(membership, ["owner", "admin"]);
    const result = await query(SQL_RESUME_CONNECTOR, [connectorId, organization.id]);
    if (!result.rowCount) throw new NotFoundError("Connector not found");
    return mapConnector(result.rows[0]);
  });
}
