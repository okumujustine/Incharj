export const USER_RETURN_FIELDS = `
  id, email, full_name, avatar_url, is_verified, is_active, created_at
`;

export function buildUpdateUserSql(sets: string[]): string {
  return `
    UPDATE users
    SET ${sets.join(", ")}, updated_at = now()
    WHERE id = $1
    RETURNING ${USER_RETURN_FIELDS}
  `;
}
