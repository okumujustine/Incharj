export const SQL_SELECT_USER_BY_EMAIL_FOR_INVITE = `SELECT id FROM users WHERE email = $1`;

export const SQL_SELECT_MEMBERSHIP_BY_ORG_USER = `
  SELECT id FROM memberships WHERE org_id = $1 AND user_id = $2
`;

export const SQL_SELECT_PENDING_INVITATION = `
  SELECT expires_at FROM invitations
  WHERE org_id = $1 AND email = $2 AND accepted_at IS NULL
`;

export const SQL_INSERT_INVITATION = `
  INSERT INTO invitations (org_id, invited_by, email, role, token, expires_at)
  VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')
  RETURNING id, org_id, invited_by, email, role, token, accepted_at, expires_at, created_at
`;

export const SQL_SELECT_INVITATION_BY_TOKEN = `
  SELECT id, org_id, email, role, accepted_at, expires_at
  FROM invitations WHERE token = $1
`;

export const SQL_UPSERT_MEMBERSHIP_ON_ACCEPT = `
  INSERT INTO memberships (org_id, user_id, role)
  VALUES ($1, $2, $3)
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role
  RETURNING id, org_id, user_id, role, joined_at
`;

export const SQL_ACCEPT_INVITATION = `UPDATE invitations SET accepted_at = now() WHERE id = $1`;
