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

const router = createApp();
const server = createServer(router.handler());

server.listen(config.port, () => {
  logger.info(`SalesOS backend listening on :${config.port} (${config.nodeEnv})`);
  if (config.nodeEnv !== "test") startScheduler();
});

function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down gracefully`);
  stopScheduler();
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
  // Force exit after 10s if connections don't drain.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { server };
