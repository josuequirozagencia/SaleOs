/**
 * Server entrypoint. Starts the HTTP server and the scheduled-message job.
 * Runnable with plain `node` (compiled) — no external framework dependency.
 *
 * SECURITY: all secrets come from environment variables (server-side only).
 * The frontend never receives tokens; it talks to /api/crm which proxies to
 * the CRM provider with credentials injected here.
 *
 * GRACEFUL SHUTDOWN: on SIGTERM/SIGINT the server stops accepting new
 * connections, the scheduler is stopped, and in-flight requests drain.
 */

import { createServer } from "node:http";
import { createApp } from "./app";
import { startScheduler, stopScheduler } from "./jobs/schedulerJob";
import { config } from "./config/env";
import { logger } from "./utils/router";
import { runMigrations } from "./db/migrations";
import { dbAvailable } from "./db/client";
import { createStaticHandler } from "./middleware/staticFiles";

const router = createApp();

async function bootstrap() {
  // Apply DB migrations before accepting traffic. In production a missing
  // DATABASE_URL is a hard failure (no silent in-memory fallback).
  if (config.nodeEnv === "production" && !config.databaseUrl) {
    throw new Error("DATABASE_URL is required in production");
  }
  if (dbAvailable()) {
    await runMigrations();
    logger.info("Database migrations applied");
  } else {
    logger.warn("No DATABASE_URL — running with in-memory stores (dev only)");
  }

  // Same-origin serving: the compiled SPA is served from this process, so the
  // browser only ever sees one origin and CORS never enters the picture.
  // `/api/*` always belongs to the router; everything else is offered to the
  // static handler first, which falls through when there is no build on disk
  // (local API-only development).
  const routerHandler = router.handler();
  const serveStatic = createStaticHandler(config.webRoot);

  const server = createServer((req, res) => {
    const pathname = (req.url ?? "/").split("?")[0];
    if (pathname.startsWith("/api/")) return routerHandler(req, res);

    serveStatic(req, res)
      .then((handled) => {
        if (!handled) routerHandler(req, res);
      })
      .catch((err) => {
        logger.error(err);
        if (!res.writableEnded) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ code: "INTERNAL_ERROR", message: "Static handler failed" }));
        }
      });
  });
  server.listen(config.port, () => {
    logger.info(`BeautyCRM backend listening on :${config.port} (${config.nodeEnv})`);
    if (config.nodeEnv !== "test") startScheduler();
  });

  function shutdown(signal: string) {
    logger.info(`${signal} received — shutting down gracefully`);
    stopScheduler();
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  logger.error(err);
  process.exit(1);
});
