import type { FastifyReply, FastifyRequest } from "fastify";
import type { DbUser } from "./db";

export interface AuthenticatedRequest extends FastifyRequest {
  currentUser?: DbUser;
}

export interface AppContext {
  request: AuthenticatedRequest;
  reply: FastifyReply;
}
