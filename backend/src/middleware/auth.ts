import type { FastifyReply, FastifyRequest } from "fastify";
import { query } from "../db";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "../errors";
import type { AuthenticatedRequest, DbMembership, DbUser } from "../types";
import { decodeAccessToken } from "../utils/security";

export async function requireCurrentUser(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing Bearer token");
  }

  const payload = await decodeAccessToken(authHeader.slice("Bearer ".length));
  const userId = payload?.sub;
  if (!userId || typeof userId !== "string") {
    throw new UnauthorizedError("Invalid or expired token");
  }

  const result = await query<DbUser>(
    `SELECT id, email, hashed_password, full_name, avatar_url, is_verified, is_active, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  const user = result.rows[0];
  if (!user || !user.is_active) {
    throw new UnauthorizedError("User not found or inactive");
  }

  (request as AuthenticatedRequest).currentUser = user;
}

export function getCurrentUser(request: FastifyRequest): DbUser {
  const user = (request as AuthenticatedRequest).currentUser;
  if (!user) {
    throw new UnauthorizedError("Missing authenticated user");
  }
  return user;
}

export async function getCurrentMembership(
  orgSlug: string,
  userId: string
): Promise<DbMembership> {
  const orgResult = await query<{ id: string }>(
    "SELECT id FROM organizations WHERE slug = $1",
    [orgSlug]
  );
  const org = orgResult.rows[0];
  if (!org) {
    throw new NotFoundError("Organization not found");
  }

  const membershipResult = await query<DbMembership>(
    `SELECT id, org_id, user_id, role, joined_at
     FROM memberships WHERE org_id = $1 AND user_id = $2`,
    [org.id, userId]
  );
  const membership = membershipResult.rows[0];
  if (!membership) {
    throw new ForbiddenError("Not a member of this organization");
  }

  return membership;
}

export function requireRole(membership: DbMembership, roles: string[]) {
  if (!roles.includes(membership.role)) {
    throw new ForbiddenError(
      `Required role: ${roles.join(", ")}. Current role: ${membership.role}`
    );
  }
}
