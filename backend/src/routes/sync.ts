import type { FastifyInstance } from "fastify";
import { query } from "../db";
import { NotFoundError } from "../errors";
import { getCurrentMembership, getCurrentUser, requireCurrentUser } from "../middleware/auth";
import {
  SQL_SELECT_SYNC_JOB_BY_ID,
  SQL_SELECT_SYNC_JOB_STREAM,
  buildSyncJobsListSql,
} from "../sql/sync-jobs";
import { getOrgBySlug } from "../sql/orgs";
import { mapSyncJob } from "../utils/serialization";

export default async function syncRoutes(api: FastifyInstance) {
  api.get("/sync/jobs", { preHandler: requireCurrentUser }, async (request) => {
    const currentUser = getCurrentUser(request);
    const { org, connector_id: connectorId, limit = "50", offset = "0" } = request.query as Record<string, string>;
    const organization = await getOrgBySlug(org);
    await getCurrentMembership(org, currentUser.id);
    const values: unknown[] = [organization.id];
    if (connectorId) {
      values.push(connectorId);
    }
    values.push(Number(limit), Number(offset));
    const limitPos = connectorId ? 3 : 2;
    const offsetPos = connectorId ? 4 : 3;
    const result = await query(
      buildSyncJobsListSql(!!connectorId, limitPos, offsetPos),
      values
    );
    return result.rows.map(mapSyncJob);
  });

  api.get("/sync/jobs/:jobId", { preHandler: requireCurrentUser }, async (request) => {
    const currentUser = getCurrentUser(request);
    const { jobId } = request.params as { jobId: string };
    const { org } = request.query as { org: string };
    const organization = await getOrgBySlug(org);
    await getCurrentMembership(org, currentUser.id);
    const result = await query(SQL_SELECT_SYNC_JOB_BY_ID, [jobId, organization.id]);
    if (!result.rowCount) throw new NotFoundError("Sync job not found");
    return mapSyncJob(result.rows[0]);
  });

  api.get("/sync/jobs/:jobId/stream", { preHandler: requireCurrentUser }, async (request, reply) => {
    const currentUser = getCurrentUser(request);
    const { jobId } = request.params as { jobId: string };
    const { org } = request.query as { org: string };
    const organization = await getOrgBySlug(org);
    await getCurrentMembership(org, currentUser.id);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const terminalStates = new Set(["done", "failed"]);
    let iterations = 0;

    const interval = setInterval(async () => {
      iterations += 1;
      const result = await query(SQL_SELECT_SYNC_JOB_STREAM, [jobId, organization.id]);
      const job = result.rows[0];
      if (!job) {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ detail: "Job not found" })}\n\n`);
        clearInterval(interval);
        reply.raw.end();
        return;
      }
      reply.raw.write(`data: ${JSON.stringify(job)}\n\n`);
      if (terminalStates.has(String(job.status)) || iterations >= 3600) {
        clearInterval(interval);
        reply.raw.end();
      }
    }, 1000);

    request.raw.on("close", () => clearInterval(interval));
    return reply;
  });
}
