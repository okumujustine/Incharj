import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { config } from "./config";
import { initializeDatabase } from "./db";
import { HttpError } from "./errors";
import { loadConnectors } from "./connectors/registry";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import orgRoutes from "./routes/orgs";
import connectorRoutes from "./routes/connectors";
import oauthRoutes from "./routes/oauth";
import syncRoutes from "./routes/sync";
import documentRoutes from "./routes/documents";
import searchRoutes from "./routes/search";

export async function buildApp() {
  const app = Fastify({ logger: true });
  await loadConnectors();

  await app.register(cookie);
  await app.register(cors, {
    origin: [config.frontendUrl, "http://localhost:5173"],
    credentials: true,
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      if (error.headers) {
        for (const [key, value] of Object.entries(error.headers)) {
          reply.header(key, value);
        }
      }
      reply.status(error.statusCode).send({ detail: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      reply.status(422).send({ detail: error.issues[0]?.message ?? "Validation error" });
      return;
    }
    request.log.error(error);
    const message = config.isProduction
      ? "Internal server error"
      : (error instanceof Error ? error.message : String(error));
    reply.status(500).send({ detail: message });
  });

  app.get("/health", async () => ({ status: "ok", version: "1.0.0" }));

  app.register(async (api) => {
    api.register(authRoutes);
    api.register(userRoutes);
    api.register(orgRoutes);
    api.register(connectorRoutes);
    api.register(oauthRoutes);
    api.register(syncRoutes);
    api.register(documentRoutes);
    api.register(searchRoutes);
  }, { prefix: "/api/v1" });

  app.addHook("onReady", async () => {
    await initializeDatabase();
  });

  return app;
}
