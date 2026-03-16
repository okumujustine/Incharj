import type { FastifyInstance } from "fastify";
import { query } from "../db";
import { getCurrentUser, requireCurrentUser } from "../middleware/auth";
import { userUpdateSchema } from "../schemas/user";
import { buildUpdateUserSql } from "../sql/users";
import { mapUser } from "../utils/serialization";

export default async function userRoutes(api: FastifyInstance) {
  api.get("/users/me", { preHandler: requireCurrentUser }, async (request) => {
    return mapUser(getCurrentUser(request));
  });

  api.patch("/users/me", { preHandler: requireCurrentUser }, async (request) => {
    const payload = userUpdateSchema.parse(request.body);
    const currentUser = getCurrentUser(request);
    const sets: string[] = [];
    const values: unknown[] = [currentUser.id];

    if ("full_name" in payload) {
      values.push(payload.full_name ?? null);
      sets.push(`full_name = $${values.length}`);
    }
    if ("avatar_url" in payload) {
      values.push(payload.avatar_url ?? null);
      sets.push(`avatar_url = $${values.length}`);
    }
    if (!sets.length) return mapUser(currentUser);

    const result = await query(buildUpdateUserSql(sets), values);
    return mapUser(result.rows[0]);
  });
}
