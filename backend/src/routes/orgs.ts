import type { FastifyInstance } from "fastify";
import { query, withTransaction } from "../db";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { getCurrentMembership, getCurrentUser, requireCurrentUser, requireRole } from "../middleware/auth";
import { inviteSchema, memberRoleSchema, orgCreateSchema, orgUpdateSchema } from "../schemas/org";
import {
  SQL_CHECK_ORG_SLUG_EXISTS,
  SQL_DELETE_MEMBERSHIP,
  SQL_INSERT_MEMBERSHIP,
  SQL_INSERT_ORG,
  SQL_SELECT_MEMBERS,
  SQL_SELECT_ORGS_FOR_USER,
  SQL_SELECT_PENDING_INVITATIONS,
  SQL_SELECT_USER_BY_ID,
  SQL_UPDATE_MEMBERSHIP_ROLE,
  buildUpdateOrgSql,
  getOrgBySlug,
} from "../sql/orgs";
import { acceptInvitation, createInvitation } from "../services/invitation-service";
import { mapInvitation, mapMembership, mapOrg } from "../utils/serialization";

export default async function orgRoutes(api: FastifyInstance) {
  api.get("/orgs", { preHandler: requireCurrentUser }, async (request) => {
    const currentUser = getCurrentUser(request);
    const result = await query(SQL_SELECT_ORGS_FOR_USER, [currentUser.id]);
    return result.rows.map(mapOrg);
  });

  api.post("/orgs", { preHandler: requireCurrentUser }, async (request, reply) => {
    const payload = orgCreateSchema.parse(request.body);
    const currentUser = getCurrentUser(request);
    const result = await withTransaction(async (client) => {
      const existing = await client.query(SQL_CHECK_ORG_SLUG_EXISTS, [payload.slug]);
      if (existing.rowCount) throw new ConflictError("Slug already taken");
      const orgResult = await client.query(SQL_INSERT_ORG, [payload.slug, payload.name]);
      await client.query(SQL_INSERT_MEMBERSHIP, [orgResult.rows[0].id, currentUser.id, "owner"]);
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
    if (!sets.length) return mapOrg(await getOrgBySlug(slug));
    const result = await query(buildUpdateOrgSql(sets), values);
    return mapOrg(result.rows[0]);
  });

  api.get("/orgs/:slug/members", { preHandler: requireCurrentUser }, async (request) => {
    const currentUser = getCurrentUser(request);
    const { slug } = request.params as { slug: string };
    const org = await getOrgBySlug(slug);
    await getCurrentMembership(slug, currentUser.id);
    const result = await query(SQL_SELECT_MEMBERS, [org.id]);
    return result.rows.map((row) =>
      mapMembership(row, {
        id: row.user_id_ref,
        email: row.email,
        full_name: row.full_name,
        avatar_url: row.avatar_url,
      })
    );
  });

  api.delete("/orgs/:slug/members/:userId", { preHandler: requireCurrentUser }, async (request, reply) => {
    const currentUser = getCurrentUser(request);
    const { slug, userId } = request.params as { slug: string; userId: string };
    const org = await getOrgBySlug(slug);
    const membership = await getCurrentMembership(slug, currentUser.id);
    requireRole(membership, ["owner", "admin"]);
    if (currentUser.id === userId) throw new ForbiddenError("Cannot remove yourself");
    const result = await query(SQL_DELETE_MEMBERSHIP, [org.id, userId]);
    if (!result.rowCount) throw new NotFoundError("Member not found");
    reply.status(204).send();
  });

  api.patch("/orgs/:slug/members/:userId", { preHandler: requireCurrentUser }, async (request) => {
    const currentUser = getCurrentUser(request);
    const { slug, userId } = request.params as { slug: string; userId: string };
    const payload = memberRoleSchema.parse(request.body);
    const org = await getOrgBySlug(slug);
    const membership = await getCurrentMembership(slug, currentUser.id);
    requireRole(membership, ["owner"]);
    const result = await query(SQL_UPDATE_MEMBERSHIP_ROLE, [org.id, userId, payload.role]);
    if (!result.rowCount) throw new NotFoundError("Member not found");
    const userResult = await query(SQL_SELECT_USER_BY_ID, [userId]);
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
    const result = await query(SQL_SELECT_PENDING_INVITATIONS, [org.id]);
    return result.rows.map(mapInvitation);
  });

  api.post("/invitations/:token/accept", { preHandler: requireCurrentUser }, async (request) => {
    const currentUser = getCurrentUser(request);
    const { token } = request.params as { token: string };
    const membership = await withTransaction((client) => acceptInvitation(client, token, currentUser));
    const userResult = await query(SQL_SELECT_USER_BY_ID, [membership.user_id]);
    return mapMembership(membership, userResult.rows[0]);
  });
}
