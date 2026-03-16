import type { PoolClient } from "pg";
import { config } from "../config";
import { query } from "../db";
import { ConflictError, UnauthorizedError } from "../errors";
import {
  SQL_CHECK_EMAIL_EXISTS,
  SQL_DELETE_SESSION_BY_ID,
  SQL_DELETE_SESSION_BY_TOKEN,
  SQL_INSERT_SESSION,
  SQL_INSERT_USER,
  SQL_SELECT_SESSION_BY_TOKEN,
  SQL_SELECT_USER_FOR_LOGIN,
  SQL_SELECT_USER_IS_ACTIVE,
} from "../sql/auth";
import { SQL_CHECK_ORG_SLUG_EXISTS, SQL_INSERT_MEMBERSHIP, SQL_INSERT_ORG } from "../sql/orgs";
import {
  createAccessToken,
  createRefreshToken,
  hashPassword,
  verifyPassword,
} from "../utils/security";

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.slice(0, 50) || "org";
}

async function uniqueSlug(client: PoolClient, base: string): Promise<string> {
  let slug = base;
  let counter = 1;
  while (true) {
    const result = await client.query<{ id: string }>(SQL_CHECK_ORG_SLUG_EXISTS, [slug]);
    if (!result.rowCount) return slug;
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

async function buildTokenResponse(userId: string) {
  return {
    access_token: await createAccessToken({ sub: userId }),
    token_type: "bearer",
    expires_in: config.accessTokenExpireMinutes * 60,
  };
}

export async function registerUser(
  client: PoolClient,
  payload: { email: string; password: string; full_name?: string | null; org_name?: string | null },
  meta: { userAgent?: string; ipAddress?: string }
) {
  const existing = await client.query<{ id: string }>(SQL_CHECK_EMAIL_EXISTS, [payload.email]);
  if (existing.rowCount) throw new ConflictError("Email already registered");

  const hashedPassword = await hashPassword(payload.password);
  const userResult = await client.query<{ id: string }>(SQL_INSERT_USER, [
    payload.email, hashedPassword, payload.full_name ?? null,
  ]);
  const userId = userResult.rows[0].id;

  const orgName = payload.org_name ?? `${payload.full_name ?? payload.email.split("@")[0]}'s Workspace`;
  const orgSlug = await uniqueSlug(client, slugify(orgName));
  const orgResult = await client.query<{ id: string }>(SQL_INSERT_ORG, [orgSlug, orgName]);
  const orgId = orgResult.rows[0].id;

  await client.query(SQL_INSERT_MEMBERSHIP, [orgId, userId, "owner"]);

  const refreshToken = createRefreshToken();
  await client.query(SQL_INSERT_SESSION, [
    userId, refreshToken, meta.userAgent ?? null, meta.ipAddress ?? null,
    String(config.refreshTokenExpireDays),
  ]);

  return { tokenResponse: await buildTokenResponse(userId), refreshToken };
}

export async function loginUser(
  client: PoolClient,
  payload: { email: string; password: string },
  meta: { userAgent?: string; ipAddress?: string }
) {
  const result = await client.query<{ id: string; hashed_password: string | null; is_active: boolean }>(
    SQL_SELECT_USER_FOR_LOGIN, [payload.email]
  );
  const user = result.rows[0];
  if (!user?.hashed_password) throw new UnauthorizedError("Invalid credentials");
  if (!(await verifyPassword(payload.password, user.hashed_password))) throw new UnauthorizedError("Invalid credentials");
  if (!user.is_active) throw new UnauthorizedError("Account is disabled");

  const refreshToken = createRefreshToken();
  await client.query(SQL_INSERT_SESSION, [
    user.id, refreshToken, meta.userAgent ?? null, meta.ipAddress ?? null,
    String(config.refreshTokenExpireDays),
  ]);

  return { tokenResponse: await buildTokenResponse(user.id), refreshToken };
}

export async function refreshSession(
  client: PoolClient,
  oldRefreshToken: string,
  meta: { userAgent?: string; ipAddress?: string }
) {
  const sessionResult = await client.query<{ id: string; user_id: string; expires_at: string }>(
    SQL_SELECT_SESSION_BY_TOKEN, [oldRefreshToken]
  );
  const session = sessionResult.rows[0];
  if (!session || new Date(session.expires_at) < new Date()) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  const userResult = await client.query<{ id: string; is_active: boolean }>(
    SQL_SELECT_USER_IS_ACTIVE, [session.user_id]
  );
  const user = userResult.rows[0];
  if (!user || !user.is_active) throw new UnauthorizedError("User not found or inactive");

  await client.query(SQL_DELETE_SESSION_BY_ID, [session.id]);

  const refreshToken = createRefreshToken();
  await client.query(SQL_INSERT_SESSION, [
    user.id, refreshToken, meta.userAgent ?? null, meta.ipAddress ?? null,
    String(config.refreshTokenExpireDays),
  ]);

  return { tokenResponse: await buildTokenResponse(user.id), refreshToken };
}

export async function logoutSession(refreshToken: string) {
  await query(SQL_DELETE_SESSION_BY_TOKEN, [refreshToken]);
}
