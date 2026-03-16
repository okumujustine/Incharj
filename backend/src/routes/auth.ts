import type { FastifyInstance, FastifyReply } from "fastify";
import { config } from "../config";
import { withTransaction } from "../db";
import { BadRequestError } from "../errors";
import { getCurrentUser, requireCurrentUser } from "../middleware/auth";
import { loginUser, logoutSession, refreshSession, registerUser } from "../services/auth-service";
import { mapUser } from "../utils/serialization";
import { COOKIE_MAX_AGE, REFRESH_COOKIE } from "../constants/auth";
import { loginSchema, registerSchema } from "../schemas/auth";

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function setRefreshCookie(reply: FastifyReply, refreshToken: string) {
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/api/v1/auth",
  });
}

function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
}

export default async function authRoutes(api: FastifyInstance) {
  api.get("/auth/me", { preHandler: requireCurrentUser }, async (request) => {
    return mapUser(getCurrentUser(request));
  });

  api.post("/auth/register", async (request, reply) => {
    const payload = registerSchema.parse(request.body);
    const result = await withTransaction((client) =>
      registerUser(client, payload, {
        userAgent: headerValue(request.headers["user-agent"]),
        ipAddress: request.ip,
      })
    );
    setRefreshCookie(reply, result.refreshToken);
    reply.status(201).send(result.tokenResponse);
  });

  api.post("/auth/login", async (request, reply) => {
    const payload = loginSchema.parse(request.body);
    const result = await withTransaction((client) =>
      loginUser(client, payload, {
        userAgent: headerValue(request.headers["user-agent"]),
        ipAddress: request.ip,
      })
    );
    setRefreshCookie(reply, result.refreshToken);
    reply.send(result.tokenResponse);
  });

  api.post("/auth/refresh", async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE];
    if (!refreshToken) throw new BadRequestError("Missing refresh token");
    const result = await withTransaction((client) =>
      refreshSession(client, refreshToken, {
        userAgent: headerValue(request.headers["user-agent"]),
        ipAddress: request.ip,
      })
    );
    setRefreshCookie(reply, result.refreshToken);
    reply.send(result.tokenResponse);
  });

  api.post("/auth/logout", async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE];
    if (refreshToken) await logoutSession(refreshToken);
    clearRefreshCookie(reply);
    reply.status(204).send();
  });
}
