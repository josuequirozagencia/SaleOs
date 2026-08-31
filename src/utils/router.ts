/**
 * Minimal dependency-free HTTP router. Routes are registered by method+path
 * with `:param` segments. Handlers receive a typed context. This keeps the
 * backend framework-agnostic and runnable with plain `node` (no install).
 *
 * The router mounts under `/api/crm` to match the frontend's API_BASE_URL.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError } from "../utils/errors";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RouteContext {
  req: IncomingMessage & { session?: import("../types").AuthSession; body?: unknown; params: Record<string, string>; query: URLSearchParams };
  res: ServerResponse;
  /** resolved params from the path match */
  params: Record<string, string>;
  /** parsed query string */
  query: URLSearchParams;
  /** parsed JSON body (for POST/PATCH/PUT) */
  body: unknown;
  /** the authenticated session (or undefined) */
  session: import("../types").AuthSession | undefined;
}

type Handler = (ctx: RouteContext) => Promise<void> | void;
type Middleware = (req: IncomingMessage & { session?: import("../types").AuthSession }, res: ServerResponse, next: (err?: unknown) => void) => void;

interface Route {
  method: HttpMethod;
  segments: string[];
  raw: string;
  handler: Handler;
  middlewares: Middleware[];
}

function matchRoute(route: Route, pathSegments: string[]): { ok: boolean; params: Record<string, string> } {
  if (route.segments.length !== pathSegments.length) return { ok: false, params: {} };
  const params: Record<string, string> = {};
  for (let i = 0; i < route.segments.length; i++) {
    const r = route.segments[i];
    const p = pathSegments[i];
    if (r.startsWith(":")) {
      params[r.slice(1)] = decodeURIComponent(p);
    } else if (r !== p) {
      return { ok: false, params: {} };
    }
  }
  return { ok: true, params };
}

export class Router {
  private routes: Route[] = [];
  private globalMiddleware: Middleware[] = [];

  use(mw: Middleware) {
    this.globalMiddleware.push(mw);
    return this;
  }

  private add(method: HttpMethod, path: string, middlewares: Middleware[], handler: Handler) {
    const clean = path.replace(/^\/+|\/+$/g, "");
    const segments = clean ? clean.split("/") : [];
    this.routes.push({ method, segments, raw: path, handler, middlewares: [...this.globalMiddleware, ...middlewares] });
  }

  /** Mount another router's routes under a path prefix. */
  mount(prefix: string, sub: Router) {
    const p = prefix.replace(/^\/+|\/+$/g, "");
    for (const r of (sub as any).routes as Route[]) {
      const fullPath = p ? `${p}/${r.raw.replace(/^\/+|\/+$/g, "")}` : r.raw;
      this.add(r.method, fullPath, r.middlewares.filter((m) => !(this.globalMiddleware as Middleware[]).includes(m)), r.handler);
    }
    return this;
  }

  get(path: string, ...rest: [...Middleware[], Handler]) {
    const [handler, ...mws] = rest.reverse();
    this.add("GET", path, mws.reverse(), handler as Handler);
  }
  post(path: string, ...rest: [...Middleware[], Handler]) {
    const [handler, ...mws] = rest.reverse();
    this.add("POST", path, mws.reverse(), handler as Handler);
  }
  patch(path: string, ...rest: [...Middleware[], Handler]) {
    const [handler, ...mws] = rest.reverse();
    this.add("PATCH", path, mws.reverse(), handler as Handler);
  }
  put(path: string, ...rest: [...Middleware[], Handler]) {
    const [handler, ...mws] = rest.reverse();
    this.add("PUT", path, mws.reverse(), handler as Handler);
  }
  delete(path: string, ...rest: [...Middleware[], Handler]) {
    const [handler, ...mws] = rest.reverse();
    this.add("DELETE", path, mws.reverse(), handler as Handler);
  }

  /** Returns the main request handler for http.createServer. */
  handler() {
    return async (req: IncomingMessage, res: ServerResponse) => {
      const requestId = (req.headers["x-request-id"] as string) ?? `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      res.setHeader("X-Request-Id", requestId);
      const startedAt = Date.now();
      try {
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        const pathSegments = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
        const method = (req.method ?? "GET").toUpperCase() as HttpMethod;

        const route = this.routes.find((r) => r.method === method && matchRoute(r, pathSegments).ok);
        if (!route) {
          logger.warn(`404 ${method} ${url.pathname}`, { requestId });
          return sendError(res, new ApiError("NOT_FOUND", `No route for ${method} ${url.pathname}`));
        }

        const { params } = matchRoute(route, pathSegments);
        const query = url.searchParams;

        // Run route middleware chain
        const mws = route.middlewares;
        let idx = 0;
        const extReq = req as IncomingMessage & { session?: import("../types").AuthSession };
        const runMw = (err?: unknown): void => {
          if (err) return sendError(res, err);
          if (idx >= mws.length) {
            // all middleware passed — parse body then run handler
            return runHandler();
          }
          const mw = mws[idx++];
          try {
            mw(extReq, res, runMw);
          } catch (e) {
            sendError(res, e);
          }
        };

        const runHandler = async () => {
          let body: unknown = undefined;
          if (method === "POST" || method === "PATCH" || method === "PUT") {
            body = await parseBody(req);
          }
          const ctx: RouteContext = {
            req: extReq,
            res,
            params,
            query,
            body,
            session: extReq.session,
          };
          try {
            const result = await route.handler(ctx);
            // Handlers either send their own response or return a body.
            if (result !== undefined && !res.writableEnded) {
              sendJson(res, 200, result);
            }
            logger.info(`${res.statusCode} ${method} ${url.pathname} ${Date.now() - startedAt}ms`, { requestId, tenantId: extReq.session?.tenantId, userId: extReq.session?.ghlUserId });
          } catch (e) {
            sendError(res, e);
          }
        };

        runMw();
      } catch (e) {
        sendError(res, e);
      }
    };
  }
}

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new ApiError("VALIDATION_ERROR", "Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  if (res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function sendError(res: ServerResponse, err: unknown) {
  if (res.writableEnded) return;
  const apiErr = err instanceof ApiError ? err : new ApiError("INTERNAL_ERROR", err instanceof Error ? err.message : "Internal error");
  logger.error(apiErr);
  sendJson(res, apiErr.status, apiErr.toJSON());
}

/** Minimal logger that never logs secrets. */
export const logger = {
  info: (msg: string, meta?: unknown) => console.log(`[info] ${msg}`, meta ?? ""),
  warn: (msg: string, meta?: unknown) => console.warn(`[warn] ${msg}`, meta ?? ""),
  error: (err: unknown) => {
    if (err instanceof ApiError) console.error(`[error] ${err.code} ${err.status}: ${err.message}`);
    else console.error("[error]", err);
  },
};
