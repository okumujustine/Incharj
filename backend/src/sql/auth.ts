export const SQL_CHECK_EMAIL_EXISTS = `SELECT id FROM users WHERE email = $1`;

export const SQL_INSERT_USER = `
  INSERT INTO users (email, hashed_password, full_name, is_verified, is_active)
  VALUES ($1, $2, $3, false, true)
  RETURNING id
`;

export const SQL_INSERT_SESSION = `
  INSERT INTO sessions (user_id, refresh_token, user_agent, ip_address, expires_at)
  VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)
`;

export const SQL_SELECT_USER_FOR_LOGIN = `
  SELECT id, hashed_password, is_active FROM users WHERE email = $1
`;

export const SQL_SELECT_SESSION_BY_TOKEN = `
  SELECT id, user_id, expires_at FROM sessions WHERE refresh_token = $1
`;

export const SQL_SELECT_USER_IS_ACTIVE = `SELECT id, is_active FROM users WHERE id = $1`;

export const SQL_DELETE_SESSION_BY_ID = `DELETE FROM sessions WHERE id = $1`;

export const SQL_DELETE_SESSION_BY_TOKEN = `DELETE FROM sessions WHERE refresh_token = $1`;

export const SQL_SELECT_USER_BY_ID = `
  SELECT id, email, hashed_password, full_name, avatar_url, is_verified, is_active, created_at
  FROM users WHERE id = $1
`;

export const SQL_SELECT_ORG_ID_BY_SLUG = `SELECT id FROM organizations WHERE slug = $1`;

export const SQL_SELECT_MEMBERSHIP_BY_ORG_USER = `
  SELECT id, org_id, user_id, role, joined_at
  FROM memberships WHERE org_id = $1 AND user_id = $2
`;
