import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import {
  SQL_ACCEPT_INVITATION,
  SQL_INSERT_INVITATION,
  SQL_SELECT_INVITATION_BY_TOKEN,
  SQL_SELECT_MEMBERSHIP_BY_ORG_USER,
  SQL_SELECT_PENDING_INVITATION,
  SQL_SELECT_USER_BY_EMAIL_FOR_INVITE,
  SQL_UPSERT_MEMBERSHIP_ON_ACCEPT,
} from "../sql/invitations";
import type { DbUser } from "../types/index";

export async function createInvitation(
  client: PoolClient,
  orgId: string,
  invitedBy: string,
  email: string,
  role = "member"
) {
  const userResult = await client.query<{ id: string }>(SQL_SELECT_USER_BY_EMAIL_FOR_INVITE, [email]);
  const user = userResult.rows[0];

  if (user) {
    const membershipResult = await client.query<{ id: string }>(SQL_SELECT_MEMBERSHIP_BY_ORG_USER, [orgId, user.id]);
    if (membershipResult.rowCount) throw new ConflictError("User is already a member of this organization");
  }

  const existingResult = await client.query<{ expires_at: string }>(SQL_SELECT_PENDING_INVITATION, [orgId, email]);
  const existing = existingResult.rows[0];
  if (existing && new Date(existing.expires_at) > new Date()) {
    throw new ConflictError("Pending invitation already exists for this email");
  }

  const result = await client.query(SQL_INSERT_INVITATION, [
    orgId, invitedBy, email, role, randomBytes(48).toString("base64url"),
  ]);
  return result.rows[0];
}

export async function acceptInvitation(client: PoolClient, token: string, user: DbUser) {
  const invitationResult = await client.query<{
    id: string; org_id: string; email: string; role: string; accepted_at: string | null; expires_at: string;
  }>(SQL_SELECT_INVITATION_BY_TOKEN, [token]);
  const invitation = invitationResult.rows[0];
  if (!invitation) throw new NotFoundError("Invitation not found");
  if (invitation.accepted_at) throw new BadRequestError("Invitation already accepted");
  if (new Date(invitation.expires_at) < new Date()) throw new BadRequestError("Invitation has expired");
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new BadRequestError("Invitation email does not match your account email");
  }

  const membershipResult = await client.query(SQL_UPSERT_MEMBERSHIP_ON_ACCEPT, [
    invitation.org_id, user.id, invitation.role,
  ]);

  await client.query(SQL_ACCEPT_INVITATION, [invitation.id]);

  return membershipResult.rows[0];
}
