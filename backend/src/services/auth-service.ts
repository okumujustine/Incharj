import type { PoolClient } from "pg";
import { config } from "../config";
import { query } from "../db";
import { ConflictError, UnauthorizedError } from "../errors";
import {
  createAccessToken,
  createRefreshToken,
  hashPassword,
  verifyPassword
} from "../utils/security";

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.slice(0, 50) || "org";
}

async function uniqueSlug(client: PoolClient, base: string): Promise<string> {
  let slug = base;
  let counter = 1;

  while (true) {
    const result = await client.query<{ id: string }>(
      "SELECT id FROM organizations WHERE slug = $1",
      [slug]
    );
    if (!result.rowCount) {
      return slug;
    }
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

async function buildTokenResponse(userId: string) {
  return {
    access_token: await createAccessToken({ sub: userId }),
    token_type: "bearer",
    expires_in: config.accessTokenExpireMinutes * 60
  };
}

export async function registerUser(
  client: PoolClient,
  payload: {
    email: string;
    password: string;
    full_name?: string | null;
    org_name?: string | null;
  },
  meta: { userAgent?: string; ipAddress?: string }
) {
  const existing = await client.query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [payload.email]
  );
  if (existing.rowCount) {
    throw new ConflictError("Email already registered");
  }

  const hashedPassword = await hashPassword(payload.password);
  const userResult = await client.query<{ id: string }>(
    `INSERT INTO users (email, hashed_password, full_name, is_verified, is_active)
     VALUES ($1, $2, $3, false, true)
     RETURNING id`,
    [payload.email, hashedPassword, payload.full_name ?? null]
  );
  const userId = userResult.rows[0].id;

  const orgName =
    payload.org_name ??
    `${payload.full_name ?? payload.email.split("@")[0]}'s Workspace`;
  const orgSlug = await uniqueSlug(client, slugify(orgName));
  const orgResult = await client.query<{ id: string }>(
    `INSERT INTO organizations (slug, name, plan)
     VALUES ($1, $2, 'free')
     RETURNING id`,
    [orgSlug, orgName]
  );
  const orgId = orgResult.rows[0].id;

  await client.query(
    `INSERT INTO memberships (org_id, user_id, role)
     VALUES ($1, $2, 'owner')`,
    [orgId, userId]
  );

  const refreshToken = createRefreshToken();
  await client.query(
    `INSERT INTO sessions (user_id, refresh_token, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)`,
    [
      userId,
      refreshToken,
      meta.userAgent ?? null,
      meta.ipAddress ?? null,
      String(config.refreshTokenExpireDays)
    ]
  );

  return {
    tokenResponse: await buildTokenResponse(userId),
    refreshToken
  };
}

export async function loginUser(
  client: PoolClient,
  payload: { email: string; password: string },
  meta: { userAgent?: string; ipAddress?: string }
) {
  const result = await client.query<{
    id: string;
    hashed_password: string | null;
    is_active: boolean;
  }>(
    `SELECT id, hashed_password, is_active
     FROM users WHERE email = $1`,
    [payload.email]
  );
  const user = result.rows[0];
  if (!user?.hashed_password) {
    throw new UnauthorizedError("Invalid credentials");
  }
  if (!(await verifyPassword(payload.password, user.hashed_password))) {
    throw new UnauthorizedError("Invalid credentials");
  }
  if (!user.is_active) {
    throw new UnauthorizedError("Account is disabled");
  }

  const refreshToken = createRefreshToken();
  await client.query(
    `INSERT INTO sessions (user_id, refresh_token, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)`,
    [
      user.id,
      refreshToken,
      meta.userAgent ?? null,
      meta.ipAddress ?? null,
      String(config.refreshTokenExpireDays)
    ]
  );

  return {
    tokenResponse: await buildTokenResponse(user.id),
    refreshToken
  };
}

export async function refreshSession(
  client: PoolClient,
  oldRefreshToken: string,
  meta: { userAgent?: string; ipAddress?: string }
) {
  const sessionResult = await client.query<{
    id: string;
    user_id: string;
    expires_at: string;
  }>(
    `SELECT id, user_id, expires_at
     FROM sessions WHERE refresh_token = $1`,
    [oldRefreshToken]
  );
  const session = sessionResult.rows[0];
  if (!session || new Date(session.expires_at) < new Date()) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  const userResult = await client.query<{ id: string; is_active: boolean }>(
    "SELECT id, is_active FROM users WHERE id = $1",
    [session.user_id]
  );
  const user = userResult.rows[0];
  if (!user || !user.is_active) {
    throw new UnauthorizedError("User not found or inactive");
  }

  await client.query("DELETE FROM sessions WHERE id = $1", [session.id]);

  const refreshToken = createRefreshToken();
  await client.query(
    `INSERT INTO sessions (user_id, refresh_token, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)`,
    [
      user.id,
      refreshToken,
      meta.userAgent ?? null,
      meta.ipAddress ?? null,
      String(config.refreshTokenExpireDays)
    ]
  );

  return {
    tokenResponse: await buildTokenResponse(user.id),
    refreshToken
  };
}

export async function logoutSession(refreshToken: string) {
  await query("DELETE FROM sessions WHERE refresh_token = $1", [refreshToken]);
}
