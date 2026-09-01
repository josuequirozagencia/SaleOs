import type { Router, RouteContext } from "../utils/router";
import { sendJson } from "../utils/router";
import { requireAuth, setSessionCookie, clearSessionCookie } from "../auth/middleware";
import { authService } from "../auth/authService";
import { rateLimits } from "../middleware/rateLimit";
import { auditRepo } from "../repositories/auditRepo";
import { ApiError } from "../utils/errors";

function ok(ctx: RouteContext, body: unknown, status = 200) {
  sendJson(ctx.res, status, body);
}

export function authRoutes(router: Router) {
  // ── BeautyCRM native login (email + password) ─────────────────────────
  // BeautyCRM's own credential store. The client sends only email + password;
  // the backend derives tenantId, ghlUserId, role and scope from the verified
  // app_users row — never from the request body. The session is then linked
  // to the CRM user via ghlUserId. Reuses the existing JWT/cookie infra.
  router.post("/auth/login", rateLimits.auth, async (ctx) => {
    const { email, password } = (ctx.body ?? {}) as { email?: string; password?: string };
    const result = await authService.login(email ?? "", password ?? "");
    setSessionCookie(ctx.res, result.token);
    auditRepo.record({
      tenantId: result.session.tenantId,
      ghlUserId: result.session.ghlUserId,
      action: "password_login",
      resource: "auth",
      resourceId: result.session.ghlUserId,
    });
    ok(ctx, { token: result.token, user: result.user, profile: result.profile });
  });

  // ── Embedded SSO ─────────────────────────────────────────────────────
  // The frontend forwards the opaque encrypted user context from the platform.
  // The backend decrypts it with the Marketplace Shared Secret and derives
  // the full identity. No client-supplied identity is trusted.
  router.post("/auth/sso", rateLimits.auth, async (ctx) => {
    const { encryptedData } = (ctx.body ?? {}) as { encryptedData?: string };
    const result = await authService.sso(encryptedData ?? "");
    setSessionCookie(ctx.res, result.token);
    auditRepo.record({
      tenantId: result.session.tenantId,
      ghlUserId: result.session.ghlUserId,
      action: "sso_login",
      resource: "auth",
      resourceId: result.session.ghlUserId,
    });
    ok(ctx, { token: result.token, user: result.user, profile: result.profile });
  });

  // ── Standalone OAuth ─────────────────────────────────────────────────
  // Begin: returns the platform authorize URL + single-use state.
  router.get("/auth/oauth/start", rateLimits.auth, async (ctx) => {
    const redirectAfter = ctx.query.get("redirect") ?? undefined;
    const { authorizeUrl, state } = await authService.startOAuth(redirectAfter);
    ok(ctx, { authorizeUrl, state });
  });

  // Callback: the platform redirects here with ?code=&state=. We exchange the
  // code server-side, derive identity, and set the session cookie before
  // redirecting the browser to the app. The code is single-use; state is
  // consumed to prevent replay/CSRF.
  router.get("/auth/oauth/callback", rateLimits.auth, async (ctx) => {
    const code = ctx.query.get("code") ?? "";
    const state = ctx.query.get("state") ?? "";
    const error = ctx.query.get("error");
    if (error) throw new ApiError("UNAUTHORIZED", `OAuth rechazado: ${error}`);
    const { result, redirectAfter } = await authService.oauthCallback(code, state);
    setSessionCookie(ctx.res, result.token);
    auditRepo.record({
      tenantId: result.session.tenantId,
      ghlUserId: result.session.ghlUserId,
      action: "oauth_login",
      resource: "auth",
      resourceId: result.session.ghlUserId,
    });
    // Redirect to the app; the cookie carries the session.
    const safeRedirect = redirectAfter?.startsWith("/") ? redirectAfter : "/";
    ctx.res.writeHead(302, { Location: safeRedirect });
    ctx.res.end();
  });

  // ── Refresh ──────────────────────────────────────────────────────────
  // Sliding-window re-issue for an already-authenticated user. Never elevates
  // role or changes tenant — re-derives them from the CRM record.
  router.post("/auth/refresh", rateLimits.auth, requireAuth, async (ctx) => {
    const { token } = await authService.refresh(ctx.session!);
    setSessionCookie(ctx.res, token);
    ok(ctx, { token });
  });

  // ── Logout ────────────────────────────────────────────────────────────
  router.post("/auth/logout", rateLimits.auth, requireAuth, async (ctx) => {
    await authService.logout(ctx.session!);
    clearSessionCookie(ctx.res);
    auditRepo.record({
      tenantId: ctx.session!.tenantId,
      ghlUserId: ctx.session!.ghlUserId,
      action: "logout",
      resource: "auth",
      resourceId: ctx.session!.ghlUserId,
    });
    ok(ctx, { ok: true });
  });

  // ── Session lookup ────────────────────────────────────────────────────
  router.get("/auth/session", requireAuth, async (ctx) => {
    const { user, profile } = await authService.getSession(ctx.session!);
    ok(ctx, { user, profile });
  });

  // ── Impersonation (super admin only) ──────────────────────────────────
  router.post("/auth/view-as", requireAuth, async (ctx) => {
    const { targetUserId } = (ctx.body ?? {}) as { targetUserId?: string };
    const { token } = await authService.viewAs(ctx.session!, targetUserId ?? "");
    setSessionCookie(ctx.res, token);
    auditRepo.record({
      tenantId: ctx.session!.tenantId,
      ghlUserId: ctx.session!.ghlUserId,
      action: "view_as_started",
      resource: "auth",
      resourceId: targetUserId ?? "",
    });
    ok(ctx, { token });
  });

  router.post("/auth/exit-view-as", requireAuth, async (ctx) => {
    const { token } = await authService.exitViewAs(ctx.session!);
    setSessionCookie(ctx.res, token);
    auditRepo.record({
      tenantId: ctx.session!.tenantId,
      ghlUserId: ctx.session!.ghlUserId,
      action: "view_as_exited",
      resource: "auth",
      resourceId: ctx.session!.ghlUserId,
    });
    ok(ctx, { token });
  });
}
