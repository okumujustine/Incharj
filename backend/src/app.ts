import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify, { type FastifyReply } from "fastify";
import { z } from "zod";
import { config } from "./config";
import { initializeDatabase, query, withTransaction } from "./db";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  HttpError,
  NotFoundError
} from "./errors";
import {
  getCurrentMembership,
  getCurrentUser,
  requireCurrentUser,
  requireRole
} from "./middleware/auth";
import { loginUser, logoutSession, refreshSession, registerUser } from "./services/auth-service";
import { getConnector, loadConnectors } from "./services/connectors/registry";
import { acceptInvitation, createInvitation } from "./services/invitation-service";
import { fullTextSearch } from "./services/search-service";
import { mapConnector, mapDocument, mapInvitation, mapMembership, mapOrg, mapSyncJob, mapUser } from "./utils/serialization";
import { encryptCredentials } from "./utils/security";

const REFRESH_COOKIE = "refresh_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().nullable().optional(),
  org_name: z.string().nullable().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

const userUpdateSchema = z.object({
  full_name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional()
});

const orgCreateSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1)
});

const orgUpdateSchema = z.object({
  name: z.string().nullable().optional(),
  settings: z.record(z.any()).nullable().optional()
});

const memberRoleSchema = z.object({
  role: z.string()
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.string().default("member")
});

const connectorCreateSchema = z.object({
  kind: z.string(),
  name: z.string(),
  config: z.record(z.any()).nullable().optional(),
  sync_frequency: z.string().default("1 hour")
});

const connectorUpdateSchema = z.object({
  name: z.string().optional(),
  config: z.record(z.any()).nullable().optional(),
  sync_frequency: z.string().optional()
});

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function setRefreshCookie(reply: FastifyReply, refreshToken: string) {
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/api/v1/auth"
  });
}

function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
}

async function getOrgBySlug(slug: string) {
  const result = await query(
    `SELECT id, slug, name, plan, settings, created_at
     FROM organizations WHERE slug = $1`,
    [slug]
  );
  const org = result.rows[0];
  if (!org) {
    throw new NotFoundError("Organization not found");
  }
  return org;
}

async function getConnectorOr404(connectorId: string, orgId: string) {
  const result = await query(
    `SELECT id, org_id, created_by, kind, name, status, credentials, config,
            sync_cursor, last_synced_at, last_error, sync_frequency, doc_count, created_at
     FROM connectors
     WHERE id = $1 AND org_id = $2`,
    [connectorId, orgId]
  );
  const connector = result.rows[0];
  if (!connector) {
    throw new NotFoundError("Connector not found");
  }
  return connector;
}

export async function buildApp() {
  const app = Fastify({ logger: true });
  await loadConnectors();

  await app.register(cookie);
  await app.register(cors, {
    origin: [config.frontendUrl, "http://localhost:5173"],
    credentials: true
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      if (error.headers) {
        for (const [key, value] of Object.entries(error.headers)) {
          reply.header(key, value);
        }
      }
      reply.status(error.statusCode).send({ detail: error.message });
      return;
    }

    if (error instanceof z.ZodError) {
      reply.status(422).send({ detail: error.issues[0]?.message ?? "Validation error" });
      return;
    }

    request.log.error(error);
    reply.status(500).send({ detail: "Internal server error" });
  });

  app.get("/health", async () => ({ status: "ok", version: "1.0.0" }));

  app.register(async (api) => {
    api.get("/auth/me", { preHandler: requireCurrentUser }, async (request) => {
      return mapUser(getCurrentUser(request));
    });

    api.post("/auth/register", async (request, reply) => {
      const payload = registerSchema.parse(request.body);
      const result = await withTransaction((client) =>
        registerUser(client, payload, {
          userAgent: headerValue(request.headers["user-agent"]),
          ipAddress: request.ip
        })
      );
      setRefreshCookie(reply, result.refreshToken);
      reply.status(201).send(result.tokenResponse);
    });

    api.post("/auth/login", async (request, reply) => {
      const payload = loginSchema.parse(request.body);
      const result = await withTransaction((client) =>
        loginUser(client, payload, {
          userAgent: headerValue(request.headers["user-agent"]),
          ipAddress: request.ip
        })
      );
      setRefreshCookie(reply, result.refreshToken);
      reply.send(result.tokenResponse);
    });

    api.post("/auth/refresh", async (request, reply) => {
      const refreshToken = request.cookies[REFRESH_COOKIE];
      if (!refreshToken) {
        throw new BadRequestError("Missing refresh token");
      }
      const result = await withTransaction((client) =>
        refreshSession(client, refreshToken, {
          userAgent: headerValue(request.headers["user-agent"]),
          ipAddress: request.ip
        })
      );
      setRefreshCookie(reply, result.refreshToken);
      reply.send(result.tokenResponse);
    });

    api.post("/auth/logout", async (request, reply) => {
      const refreshToken = request.cookies[REFRESH_COOKIE];
      if (refreshToken) {
        await logoutSession(refreshToken);
      }
      clearRefreshCookie(reply);
      reply.status(204).send();
    });

    api.get("/users/me", { preHandler: requireCurrentUser }, async (request) => {
      return mapUser(getCurrentUser(request));
    });

    api.patch("/users/me", { preHandler: requireCurrentUser }, async (request) => {
      const payload = userUpdateSchema.parse(request.body);
      const currentUser = getCurrentUser(request);
      const sets: string[] = [];
      const values: unknown[] = [currentUser.id];
      if ("full_name" in payload) {
        values.push(payload.full_name ?? null);
        sets.push(`full_name = $${values.length}`);
      }
      if ("avatar_url" in payload) {
        values.push(payload.avatar_url ?? null);
        sets.push(`avatar_url = $${values.length}`);
      }
      if (!sets.length) {
        return mapUser(currentUser);
      }
      const result = await query(
        `UPDATE users
         SET ${sets.join(", ")},
             updated_at = now()
         WHERE id = $1
         RETURNING id, email, full_name, avatar_url, is_verified, is_active, created_at`,
        values
      );
      return mapUser(result.rows[0]);
    });

    api.get("/orgs", { preHandler: requireCurrentUser }, async (request) => {
      const currentUser = getCurrentUser(request);
      const result = await query(
        `SELECT o.id, o.slug, o.name, o.plan, o.settings, o.created_at
         FROM organizations o
         JOIN memberships m ON m.org_id = o.id
         WHERE m.user_id = $1
         ORDER BY o.created_at DESC`,
        [currentUser.id]
      );
      return result.rows.map(mapOrg);
    });

    api.post("/orgs", { preHandler: requireCurrentUser }, async (request, reply) => {
      const payload = orgCreateSchema.parse(request.body);
      const currentUser = getCurrentUser(request);
      const result = await withTransaction(async (client) => {
        const existing = await client.query("SELECT id FROM organizations WHERE slug = $1", [payload.slug]);
        if (existing.rowCount) {
          throw new ConflictError("Slug already taken");
        }
        const orgResult = await client.query(
          `INSERT INTO organizations (slug, name, plan)
           VALUES ($1, $2, 'free')
           RETURNING id, slug, name, plan, settings, created_at`,
          [payload.slug, payload.name]
        );
        await client.query(
          `INSERT INTO memberships (org_id, user_id, role)
           VALUES ($1, $2, 'owner')`,
          [orgResult.rows[0].id, currentUser.id]
        );
        return orgResult.rows[0];
      });
      reply.status(201).send(mapOrg(result));
    });

    api.get("/orgs/:slug", { preHandler: requireCurrentUser }, async (request) => {
      const currentUser = getCurrentUser(request);
      const { slug } = request.params as { slug: string };
      await getCurrentMembership(slug, currentUser.id);
      return mapOrg(await getOrgBySlug(slug));
    });

    api.patch("/orgs/:slug", { preHandler: requireCurrentUser }, async (request) => {
      const currentUser = getCurrentUser(request);
      const { slug } = request.params as { slug: string };
      const payload = orgUpdateSchema.parse(request.body);
      const membership = await getCurrentMembership(slug, currentUser.id);
      requireRole(membership, ["owner", "admin"]);
      const sets: string[] = [];
      const values: unknown[] = [slug];
      if ("name" in payload) {
        values.push(payload.name ?? null);
        sets.push(`name = $${values.length}`);
      }
      if ("settings" in payload) {
        values.push(payload.settings ?? null);
        sets.push(`settings = $${values.length}`);
      }
      if (!sets.length) {
        return mapOrg(await getOrgBySlug(slug));
      }
      const result = await query(
        `UPDATE organizations
         SET ${sets.join(", ")},
             updated_at = now()
         WHERE slug = $1
         RETURNING id, slug, name, plan, settings, created_at`,
        values
      );
      return mapOrg(result.rows[0]);
    });

    api.get("/orgs/:slug/members", { preHandler: requireCurrentUser }, async (request) => {
      const currentUser = getCurrentUser(request);
      const { slug } = request.params as { slug: string };
      const org = await getOrgBySlug(slug);
      await getCurrentMembership(slug, currentUser.id);
      const result = await query(
        `SELECT m.id, m.org_id, m.user_id, m.role, m.joined_at,
                u.id AS user_id_ref, u.email, u.full_name, u.avatar_url
         FROM memberships m
         LEFT JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1`,
        [org.id]
      );
      return result.rows.map((row) =>
        mapMembership(row, {
          id: row.user_id_ref,
          email: row.email,
          full_name: row.full_name,
          avatar_url: row.avatar_url
        })
      );
    });

    api.delete("/orgs/:slug/members/:userId", { preHandler: requireCurrentUser }, async (request, reply) => {
      const currentUser = getCurrentUser(request);
      const { slug, userId } = request.params as { slug: string; userId: string };
      const org = await getOrgBySlug(slug);
      const membership = await getCurrentMembership(slug, currentUser.id);
      requireRole(membership, ["owner", "admin"]);
      if (currentUser.id === userId) {
        throw new ForbiddenError("Cannot remove yourself");
      }
      const result = await query(
        `DELETE FROM memberships
         WHERE org_id = $1 AND user_id = $2
         RETURNING id`,
        [org.id, userId]
      );
      if (!result.rowCount) {
        throw new NotFoundError("Member not found");
      }
      reply.status(204).send();
    });

    api.patch("/orgs/:slug/members/:userId", { preHandler: requireCurrentUser }, async (request) => {
      const currentUser = getCurrentUser(request);
      const { slug, userId } = request.params as { slug: string; userId: string };
      const payload = memberRoleSchema.parse(request.body);
      const org = await getOrgBySlug(slug);
      const membership = await getCurrentMembership(slug, currentUser.id);
      requireRole(membership, ["owner"]);
      const result = await query(
        `UPDATE memberships
         SET role = $3
         WHERE org_id = $1 AND user_id = $2
         RETURNING id, org_id, user_id, role, joined_at`,
        [org.id, userId, payload.role]
      );
      if (!result.rowCount) {
        throw new NotFoundError("Member not found");
      }
      const userResult = await query(
        `SELECT id, email, full_name, avatar_url FROM users WHERE id = $1`,
        [userId]
      );
      return mapMembership(result.rows[0], userResult.rows[0]);
    });

    api.post("/orgs/:slug/invitations", { preHandler: requireCurrentUser }, async (request, reply) => {
      const currentUser = getCurrentUser(request);
      const { slug } = request.params as { slug: string };
      const payload = inviteSchema.parse(request.body);
      const org = await getOrgBySlug(slug);
      const membership = await getCurrentMembership(slug, currentUser.id);
      requireRole(membership, ["owner", "admin"]);
      const invitation = await withTransaction((client) =>
        createInvitation(client, org.id, currentUser.id, payload.email, payload.role)
      );
      reply.status(201).send(mapInvitation(invitation));
    });

    api.get("/orgs/:slug/invitations", { preHandler: requireCurrentUser }, async (request) => {
      const currentUser = getCurrentUser(request);
      const { slug } = request.params as { slug: string };
      const org = await getOrgBySlug(slug);
      const membership = await getCurrentMembership(slug, currentUser.id);
      requireRole(membership, ["owner", "admin"]);
      const result = await query(
        `SELECT id, org_id, invited_by, email, role, token, accepted_at, expires_at, created_at
         FROM invitations
         WHERE org_id = $1 AND accepted_at IS NULL`,
        [org.id]
      );
      return result.rows.map(mapInvitation);
    });

    api.post("/invitations/:token/accept", { preHandler: requireCurrentUser }, async (request) => {
      const currentUser = getCurrentUser(request);
      const { token } = request.params as { token: string };
      const membership = await withTransaction((client) =>
        acceptInvitation(client, token, currentUser)
      );
      const userResult = await query(
        `SELECT id, email, full_name, avatar_url FROM users WHERE id = $1`,
        [membership.user_id]
      );
      return mapMembership(membership, userResult.rows[0]);
    });

    api.get("/orgs/:slug/connectors", { preHandler: requireCurrentUser }, async (request) => {
      const currentUser = getCurrentUser(request);
      const { slug } = request.params as { slug: string };
      const org = await getOrgBySlug(slug);
      await getCurrentMembership(slug, currentUser.id);
      const result = await query(
        `SELECT id, org_id, created_by, kind, name, status, credentials, config,
                sync_cursor, last_synced_at, last_error, sync_frequency, doc_count, created_at
         FROM connectors WHERE org_id = $1
         ORDER BY created_at DESC`,
        [org.id]
      );
      return result.rows.map(mapConnector);
    });

    api.post("/orgs/:slug/connectors", { preHandler: requireCurrentUser }, async (request, reply) => {
      const currentUser = getCurrentUser(request);
      const { slug } = request.params as { slug: string };
      const payload = connectorCreateSchema.parse(request.body);
      const org = await getOrgBySlug(slug);
      const membership = await getCurrentMembership(slug, currentUser.id);
      requireRole(membership, ["owner", "admin"]);
      const result = await query(
        `INSERT INTO connectors (org_id, created_by, kind, name, status, config, sync_frequency)
         VALUES ($1, $2, $3, $4, 'idle', $5, $6)
         RETURNING id, org_id, created_by, kind, name, status, credentials, config,
                   sync_cursor, last_synced_at, last_error, sync_frequency, doc_count, created_at`,
        [
          org.id,
          currentUser.id,
          payload.kind,
          payload.name,
          payload.config ?? null,
          payload.sync_frequency
        ]
      );
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
      if (!sets.length) {
        return mapConnector(await getConnectorOr404(connectorId, organization.id));
      }
      const result = await query(
        `UPDATE connectors
         SET ${sets.join(", ")},
             updated_at = now()
         WHERE id = $1 AND org_id = $2
         RETURNING id, org_id, created_by, kind, name, status, credentials, config,
                   sync_cursor, last_synced_at, last_error, sync_frequency, doc_count, created_at`,
        values
      );
      return mapConnector(result.rows[0]);
    });

    api.delete("/connectors/:connectorId", { preHandler: requireCurrentUser }, async (request, reply) => {
      const currentUser = getCurrentUser(request);
      const { connectorId } = request.params as { connectorId: string };
      const { org } = request.query as { org: string };
      const organization = await getOrgBySlug(org);
      const membership = await getCurrentMembership(org, currentUser.id);
      requireRole(membership, ["owner", "admin"]);
      const result = await query(
        `DELETE FROM connectors WHERE id = $1 AND org_id = $2 RETURNING id`,
        [connectorId, organization.id]
      );
      if (!result.rowCount) {
        throw new NotFoundError("Connector not found");
      }
      reply.status(204).send();
    });

    api.post("/connectors/:connectorId/sync", { preHandler: requireCurrentUser }, async (request, reply) => {
      const currentUser = getCurrentUser(request);
      const { connectorId } = request.params as { connectorId: string };
      const { org } = request.query as { org: string };
      const organization = await getOrgBySlug(org);
      await getCurrentMembership(org, currentUser.id);
      const connector = await getConnectorOr404(connectorId, organization.id);
      if (!connector.credentials) {
        throw new BadRequestError("Connector has no credentials - complete OAuth first");
      }
      const result = await query(
        `INSERT INTO sync_jobs (connector_id, org_id, triggered_by, status)
         VALUES ($1, $2, 'manual', 'pending')
         RETURNING id, connector_id, org_id, triggered_by, status, started_at, finished_at,
                   docs_indexed, docs_skipped, docs_errored, error_message, meta, created_at`,
        [connectorId, organization.id]
      );
      reply.status(202).send(mapSyncJob(result.rows[0]));
    });

    api.post("/connectors/:connectorId/pause", { preHandler: requireCurrentUser }, async (request) => {
      const currentUser = getCurrentUser(request);
      const { connectorId } = request.params as { connectorId: string };
      const { org } = request.query as { org: string };
      const organization = await getOrgBySlug(org);
      const membership = await getCurrentMembership(org, currentUser.id);
      requireRole(membership, ["owner", "admin"]);
      const result = await query(
        `UPDATE connectors SET status = 'paused', updated_at = now()
         WHERE id = $1 AND org_id = $2
         RETURNING id, org_id, created_by, kind, name, status, credentials, config,
                   sync_cursor, last_synced_at, last_error, sync_frequency, doc_count, created_at`,
        [connectorId, organization.id]
      );
      if (!result.rowCount) {
        throw new NotFoundError("Connector not found");
      }
      return mapConnector(result.rows[0]);
    });

    api.post("/connectors/:connectorId/resume", { preHandler: requireCurrentUser }, async (request) => {
      const currentUser = getCurrentUser(request);
      const { connectorId } = request.params as { connectorId: string };
      const { org } = request.query as { org: string };
      const organization = await getOrgBySlug(org);
      const membership = await getCurrentMembership(org, currentUser.id);
      requireRole(membership, ["owner", "admin"]);
      const result = await query(
        `UPDATE connectors SET status = 'idle', updated_at = now()
         WHERE id = $1 AND org_id = $2
         RETURNING id, org_id, created_by, kind, name, status, credentials, config,
                   sync_cursor, last_synced_at, last_error, sync_frequency, doc_count, created_at`,
        [connectorId, organization.id]
      );
      if (!result.rowCount) {
        throw new NotFoundError("Connector not found");
      }
      return mapConnector(result.rows[0]);
    });

    api.get("/oauth/:kind/authorize", { preHandler: requireCurrentUser }, async (request) => {
      const { kind } = request.params as { kind: string };
      const state = randomUUID();
      const connector = getConnector({
        kind,
        connectorId: "00000000-0000-0000-0000-000000000000",
        orgId: "00000000-0000-0000-0000-000000000000",
        credentials: {}
      });
      return {
        authorization_url: connector.authorizeUrl(state),
        state
      };
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
        config: connectorRow.config
      });
      const credentials = await connector.exchangeCode(
        code,
        `${config.frontendUrl}/oauth/${kind}/callback`
      );
      const result = await query(
        `UPDATE connectors
         SET credentials = $3, status = 'idle', updated_at = now()
         WHERE id = $1 AND org_id = $2
         RETURNING id, org_id, created_by, kind, name, status, credentials, config,
                   sync_cursor, last_synced_at, last_error, sync_frequency, doc_count, created_at`,
        [connectorRow.id, org.id, encryptCredentials(credentials)]
      );
      return mapConnector(result.rows[0]);
    });

    api.get("/sync/jobs", { preHandler: requireCurrentUser }, async (request) => {
      const currentUser = getCurrentUser(request);
      const { org, connector_id: connectorId, limit = "50", offset = "0" } = request.query as Record<string, string>;
      const organization = await getOrgBySlug(org);
      await getCurrentMembership(org, currentUser.id);
      const values: unknown[] = [organization.id];
      let connectorFilter = "";
      if (connectorId) {
        values.push(connectorId);
        connectorFilter = ` AND connector_id = $${values.length}`;
      }
      values.push(Number(limit), Number(offset));
      const result = await query(
        `SELECT id, connector_id, org_id, triggered_by, status, started_at, finished_at,
                docs_indexed, docs_skipped, docs_errored, error_message, meta, created_at
         FROM sync_jobs
         WHERE org_id = $1${connectorFilter}
         ORDER BY created_at DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
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
      const result = await query(
        `SELECT id, connector_id, org_id, triggered_by, status, started_at, finished_at,
                docs_indexed, docs_skipped, docs_errored, error_message, meta, created_at
         FROM sync_jobs WHERE id = $1 AND org_id = $2`,
        [jobId, organization.id]
      );
      if (!result.rowCount) {
        throw new NotFoundError("Sync job not found");
      }
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
        "X-Accel-Buffering": "no"
      });

      const terminalStates = new Set(["done", "failed"]);
      let iterations = 0;

      const interval = setInterval(async () => {
        iterations += 1;
        const result = await query(
          `SELECT id, status, docs_indexed, docs_skipped, docs_errored, error_message, started_at, finished_at
           FROM sync_jobs WHERE id = $1 AND org_id = $2`,
          [jobId, organization.id]
        );
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

      request.raw.on("close", () => {
        clearInterval(interval);
      });

      return reply;
    });

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
      const result = await query(
        `SELECT id, org_id, connector_id, external_id, url, title, kind, ext, author_name,
                author_email, content_hash, word_count, mtime, indexed_at, metadata
         FROM documents
         WHERE ${filters.join(" AND ")}
         ORDER BY indexed_at DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );
      return result.rows.map((row) => mapDocument(row));
    });

    api.get("/documents/:documentId", { preHandler: requireCurrentUser }, async (request) => {
      const currentUser = getCurrentUser(request);
      const { documentId } = request.params as { documentId: string };
      const { org } = request.query as { org: string };
      const organization = await getOrgBySlug(org);
      await getCurrentMembership(org, currentUser.id);

      const documentResult = await query(
        `SELECT id, org_id, connector_id, external_id, url, title, kind, ext, author_name,
                author_email, content_hash, word_count, mtime, indexed_at, metadata
         FROM documents WHERE id = $1 AND org_id = $2`,
        [documentId, organization.id]
      );
      const document = documentResult.rows[0];
      if (!document) {
        throw new NotFoundError("Document not found");
      }
      const chunks = await query(
        `SELECT id, document_id, chunk_index, content, token_count, created_at
         FROM document_chunks WHERE document_id = $1 ORDER BY chunk_index ASC`,
        [documentId]
      );
      return mapDocument(document, chunks.rows);
    });

    api.delete("/documents/:documentId", { preHandler: requireCurrentUser }, async (request, reply) => {
      const currentUser = getCurrentUser(request);
      const { documentId } = request.params as { documentId: string };
      const { org } = request.query as { org: string };
      const organization = await getOrgBySlug(org);
      await getCurrentMembership(org, currentUser.id);
      const result = await query(
        `DELETE FROM documents WHERE id = $1 AND org_id = $2 RETURNING id`,
        [documentId, organization.id]
      );
      if (!result.rowCount) {
        throw new NotFoundError("Document not found");
      }
      reply.status(204).send();
    });

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
          offset: Number(queryParams.offset ?? 0)
        })
      );
    });
  }, { prefix: "/api/v1" });

  app.addHook("onReady", async () => {
    await initializeDatabase();
  });

  return app;
}
