import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import type { DbUser } from "../types";

export async function createInvitation(
  client: PoolClient,
  orgId: string,
  invitedBy: string,
  email: string,
  role = "member"
) {
  const userResult = await client.query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [email]
  );
  const user = userResult.rows[0];

  if (user) {
    const membershipResult = await client.query<{ id: string }>(
      "SELECT id FROM memberships WHERE org_id = $1 AND user_id = $2",
      [orgId, user.id]
    );
    if (membershipResult.rowCount) {
      throw new ConflictError("User is already a member of this organization");
    }
  }

  const existingResult = await client.query<{ expires_at: string }>(
    `SELECT expires_at FROM invitations
     WHERE org_id = $1 AND email = $2 AND accepted_at IS NULL`,
    [orgId, email]
  );
  const existing = existingResult.rows[0];
  if (existing && new Date(existing.expires_at) > new Date()) {
    throw new ConflictError("Pending invitation already exists for this email");
  }

  const result = await client.query(
    `INSERT INTO invitations (org_id, invited_by, email, role, token, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')
     RETURNING id, org_id, invited_by, email, role, token, accepted_at, expires_at, created_at`,
    [orgId, invitedBy, email, role, randomBytes(48).toString("base64url")]
  );
  return result.rows[0];
}

export async function acceptInvitation(
  client: PoolClient,
  token: string,
  user: DbUser
) {
  const invitationResult = await client.query<{
    id: string;
    org_id: string;
    email: string;
    role: string;
    accepted_at: string | null;
    expires_at: string;
  }>(
    `SELECT id, org_id, email, role, accepted_at, expires_at
     FROM invitations WHERE token = $1`,
    [token]
  );
  const invitation = invitationResult.rows[0];
  if (!invitation) {
    throw new NotFoundError("Invitation not found");
  }
  if (invitation.accepted_at) {
    throw new BadRequestError("Invitation already accepted");
  }
  if (new Date(invitation.expires_at) < new Date()) {
    throw new BadRequestError("Invitation has expired");
  }
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new BadRequestError("Invitation email does not match your account email");
  }

  const membershipResult = await client.query(
    `INSERT INTO memberships (org_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role
     RETURNING id, org_id, user_id, role, joined_at`,
    [invitation.org_id, user.id, invitation.role]
  );

  await client.query(
    "UPDATE invitations SET accepted_at = now() WHERE id = $1",
    [invitation.id]
  );

  return membershipResult.rows[0];
}
