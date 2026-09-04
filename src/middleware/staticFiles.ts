/**
 * Static file serving for the compiled frontend (`web/dist`).
 *
 * Serving the SPA from the same origin as the API is what removes CORS from
 * the picture entirely: the browser sees one origin, the session cookie is
 * first-party, and no preflight is ever issued.
 *
 * SECURITY: the resolved path is checked to be inside the root before any read,
 * so a crafted URL (`..%2f..%2fetc%2fpasswd`) cannot escape the directory.
 * Only GET and HEAD are served; anything else falls through to the API router.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, normalize, resolve, sep, extname } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

async function fileSize(path: string): Promise<number | null> {
  try {
    const s = await stat(path);
    return s.isFile() ? s.size : null;
  } catch {
    return null;
  }
}

/**
 * Build a handler that serves files from `root`.
 *
 * Returns `true` when it answered the request, `false` when the caller should
 * continue (so a missing build simply falls through to the API router instead
 * of breaking the backend).
 */
export function createStaticHandler(root: string) {
  const rootDir = resolve(root);

  return async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") return false;

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      // A malformed percent-encoding is not a path we should guess at.
      return false;
    }

    // Resolve inside the root and confirm it stayed there.
    const candidate = resolve(join(rootDir, normalize(pathname)));
    const insideRoot = candidate === rootDir || candidate.startsWith(rootDir + sep);

    let filePath: string | null = null;
    let size: number | null = null;

    if (insideRoot) {
      size = await fileSize(candidate);
      if (size !== null) filePath = candidate;
    }

    if (!filePath) {
      // SPA fallback: a client-side route like /conversaciones is not a file.
      // Only fall back for navigations — a missing asset must stay a 404, not
      // silently return HTML that the browser then fails to parse as JS.
      const accepts = String(req.headers.accept ?? "");
      const looksLikeAsset = extname(pathname) !== "";
      if (looksLikeAsset || !accepts.includes("text/html")) return false;

      const indexPath = join(rootDir, "index.html");
      size = await fileSize(indexPath);
      if (size === null) return false; // no build present — let the router answer
      filePath = indexPath;
    }

    const ext = extname(filePath).toLowerCase();
    res.setHeader("Content-Type", CONTENT_TYPES[ext] ?? "application/octet-stream");
    res.setHeader("Content-Length", String(size));

    // Vite fingerprints asset filenames, so those are safe to cache hard.
    // index.html must never be cached, or a deploy leaves clients on the old
    // bundle whose hashed assets no longer exist.
    if (filePath.endsWith("index.html")) {
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
    } else if (pathname.startsWith("/assets/")) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      res.setHeader("Cache-Control", "public, max-age=3600");
    }

    if (method === "HEAD") {
      res.writeHead(200);
      res.end();
      return true;
    }

    res.writeHead(200);
    await new Promise<void>((done) => {
      const stream = createReadStream(filePath!);
      stream.on("error", () => {
        // The file vanished between stat and read (a deploy swapping files).
        if (!res.writableEnded) res.end();
        done();
      });
      stream.on("close", () => done());
      stream.pipe(res);
    });
    return true;
  };
}
