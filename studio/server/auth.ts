import type { Express, Request, Response, NextFunction } from "express";
import {
  createSession,
  destroySession,
  getSessionUser,
  loginEmail,
  loginSocial,
  registerEmailUser,
  requestPasswordReset,
  resendVerifyToken,
  resetPassword,
  verifyEmail,
  type PublicUser,
} from "./auth-store";

const COOKIE_NAME = "ms_session";

declare global {
  namespace Express {
    interface Request {
      authUser?: PublicUser | null;
      authToken?: string | null;
    }
  }
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const parts = header.split(";").map((p) => p.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

function setSessionCookie(res: Response, token: string, expiresAt: string): void {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  );
}

function clearSessionCookie(res: Response): void {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function getToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return parseCookie(req.headers.cookie, COOKIE_NAME);
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const token = getToken(req);
  req.authToken = token;
  req.authUser = getSessionUser(token);
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  next();
}

export function registerAuthRoutes(app: Express): void {
  app.use(authMiddleware);

  app.get("/api/auth/me", (req, res) => {
    res.json({ user: req.authUser ?? null });
  });

  app.post("/api/auth/register", (req, res) => {
    try {
      const { name, email, password } = req.body ?? {};
      const result = registerEmailUser({
        name: String(name ?? ""),
        email: String(email ?? ""),
        password: String(password ?? ""),
      });
      setSessionCookie(res, result.sessionToken, new Date(Date.now() + 30 * 864e5).toISOString());

      const verifyUrl = `#/verify?token=${encodeURIComponent(result.verifyToken)}`;
      res.json({
        ok: true,
        user: result.user,
        token: result.sessionToken,
        verifyUrl,
        // Local/dev: expose token so UI can show a one-click verify link without email SMTP.
        verifyToken: result.verifyToken,
        message: "Account created. Verify your email to unlock full access.",
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      const result = loginEmail(String(email ?? ""), String(password ?? ""));
      setSessionCookie(res, result.sessionToken, new Date(Date.now() + 30 * 864e5).toISOString());
      res.json({ ok: true, user: result.user, token: result.sessionToken });
    } catch (err) {
      res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    destroySession(req.authToken);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.post("/api/auth/verify", (req, res) => {
    try {
      const token = String(req.body?.token ?? req.query?.token ?? "");
      const user = verifyEmail(token);
      res.json({ ok: true, user });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/auth/resend-verify", (req, res) => {
    try {
      if (!req.authUser) {
        res.status(401).json({ error: "Sign in required" });
        return;
      }
      const verifyToken = resendVerifyToken(req.authUser.id);
      res.json({
        ok: true,
        verifyToken,
        verifyUrl: `#/verify?token=${encodeURIComponent(verifyToken)}`,
        message: "Verification link ready (dev mode — check the link below).",
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/auth/forgot-password", (req, res) => {
    try {
      const email = String(req.body?.email ?? "");
      const { resetToken } = requestPasswordReset(email);
      // Always succeed to avoid email enumeration.
      res.json({
        ok: true,
        message: "If an account exists for that email, a reset link is ready.",
        ...(resetToken
          ? {
              resetToken,
              resetUrl: `#/reset-password?token=${encodeURIComponent(resetToken)}`,
            }
          : {}),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/auth/reset-password", (req, res) => {
    try {
      const token = String(req.body?.token ?? "");
      const password = String(req.body?.password ?? "");
      const user = resetPassword(token, password);
      const { token: sessionToken, expiresAt } = createSession(user.id);
      setSessionCookie(res, sessionToken, expiresAt);
      res.json({ ok: true, user, token: sessionToken });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * Social login (Google / GitHub).
   * Production: wire real OAuth with GOOGLE_CLIENT_ID / GITHUB_CLIENT_ID.
   * Local/dev: accepts a demo profile so the full portal flow works without OAuth apps.
   */
  app.post("/api/auth/social/:provider", (req, res) => {
    try {
      const provider = String(req.params.provider);
      if (provider !== "google" && provider !== "github") {
        res.status(400).json({ error: "Unsupported provider" });
        return;
      }

      const googleId = process.env.GOOGLE_CLIENT_ID;
      const githubId = process.env.GITHUB_CLIENT_ID;
      const configured = provider === "google" ? Boolean(googleId) : Boolean(githubId);

      // If real OAuth is configured, return the authorize URL for the client to redirect.
      if (configured && req.body?.mode === "start") {
        const origin = `${req.protocol}://${req.get("host")}`;
        const redirectUri = `${origin}/api/auth/oauth/${provider}/callback`;
        if (provider === "google") {
          const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
          url.searchParams.set("client_id", googleId!);
          url.searchParams.set("redirect_uri", redirectUri);
          url.searchParams.set("response_type", "code");
          url.searchParams.set("scope", "openid email profile");
          url.searchParams.set("access_type", "online");
          res.json({ ok: true, mode: "oauth", url: url.toString() });
          return;
        }
        const url = new URL("https://github.com/login/oauth/authorize");
        url.searchParams.set("client_id", githubId!);
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set("scope", "read:user user:email");
        res.json({ ok: true, mode: "oauth", url: url.toString() });
        return;
      }

      // Demo / local social login — full flow without external OAuth apps.
      const email =
        String(req.body?.email ?? "").trim() ||
        (provider === "google" ? "demo.google@migration.studio" : "demo.github@migration.studio");
      const name =
        String(req.body?.name ?? "").trim() ||
        (provider === "google" ? "Google User" : "GitHub User");

      const result = loginSocial(provider, {
        email,
        name,
        avatarUrl: String(req.body?.avatarUrl ?? "") || undefined,
      });
      setSessionCookie(res, result.sessionToken, new Date(Date.now() + 30 * 864e5).toISOString());
      res.json({
        ok: true,
        mode: "demo",
        created: result.created,
        user: result.user,
        token: result.sessionToken,
        message: configured
          ? undefined
          : `Signed in with ${provider} (demo mode). Set ${provider === "google" ? "GOOGLE_CLIENT_ID" : "GITHUB_CLIENT_ID"} for real OAuth.`,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
