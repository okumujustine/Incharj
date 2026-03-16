import type { FastifyReply } from "fastify";
import { HttpError } from "../errors";

export function assert(condition: unknown, error: HttpError): asserts condition {
  if (!condition) {
    throw error;
  }
}

export function noContent(reply: FastifyReply) {
  reply.status(204).send();
}
