import { query } from "../db";
import { NotFoundError } from "../errors";

export const SQL_SELECT_ORG_BY_SLUG = `
  SELECT id, slug, name, plan, settings, created_at
  FROM organizations
  WHERE slug = $1
`;

export const SQL_SELECT_ORGS_FOR_USER = `
  SELECT o.id, o.slug, o.name, o.plan, o.settings, o.created_at
  FROM organizations o
  JOIN memberships m ON m.org_id = o.id
  WHERE m.user_id = $1
  ORDER BY o.created_at DESC
`;

export const SQL_INSERT_ORG = `
  INSERT INTO organizations (slug, name, plan)
  VALUES ($1, $2, 'free')
  RETURNING id, slug, name, plan, settings, created_at
`;

export const SQL_INSERT_MEMBERSHIP = `
  INSERT INTO memberships (org_id, user_id, role)
  VALUES ($1, $2, $3)
`;

export const SQL_SELECT_MEMBERS = `
  SELECT m.id, m.org_id, m.user_id, m.role, m.joined_at,
         u.id AS user_id_ref, u.email, u.full_name, u.avatar_url
  FROM memberships m
  LEFT JOIN users u ON u.id = m.user_id
  WHERE m.org_id = $1
`;

export const SQL_DELETE_MEMBERSHIP = `
  DELETE FROM memberships
  WHERE org_id = $1 AND user_id = $2
  RETURNING id
`;

export const SQL_UPDATE_MEMBERSHIP_ROLE = `
  UPDATE memberships
  SET role = $3
  WHERE org_id = $1 AND user_id = $2
  RETURNING id, org_id, user_id, role, joined_at
`;

export const SQL_SELECT_USER_BY_ID = `
  SELECT id, email, full_name, avatar_url FROM users WHERE id = $1
`;

export const SQL_SELECT_PENDING_INVITATIONS = `
  SELECT id, org_id, invited_by, email, role, token, accepted_at, expires_at, created_at
  FROM invitations
  WHERE org_id = $1 AND accepted_at IS NULL
`;

export const SQL_CHECK_ORG_SLUG_EXISTS = `SELECT id FROM organizations WHERE slug = $1`;

export const ORG_RETURN_FIELDS = `id, slug, name, plan, settings, created_at`;

export function buildUpdateOrgSql(sets: string[]): string {
  return `
    UPDATE organizations
    SET ${sets.join(", ")}, updated_at = now()
    WHERE slug = $1
    RETURNING ${ORG_RETURN_FIELDS}
  `;
}

export async function getOrgBySlug(slug: string) {
  const result = await query(SQL_SELECT_ORG_BY_SLUG, [slug]);
  const org = result.rows[0];
  if (!org) throw new NotFoundError("Organization not found");
  return org;
}
