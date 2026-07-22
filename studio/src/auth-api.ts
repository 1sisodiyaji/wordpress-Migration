const TOKEN_KEY = "ms_auth_token";

export type AuthProviderKind = "email" | "google" | "github";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  provider: AuthProviderKind;
  emailVerified: boolean;
  avatarUrl?: string;
  createdAt: string;
}

async function authFetch(path: string, init?: RequestInit) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { ...init, headers, credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export function persistToken(token: string | null | undefined) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function fetchMe(): Promise<AuthUser | null> {
  const data = await authFetch("/api/auth/me");
  return data.user ?? null;
}

export async function registerAccount(body: {
  name: string;
  email: string;
  password: string;
}): Promise<{ user: AuthUser; token: string; verifyToken: string; verifyUrl: string }> {
  const data = await authFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
  persistToken(data.token);
  return data;
}

export async function loginAccount(body: {
  email: string;
  password: string;
}): Promise<{ user: AuthUser; token: string }> {
  const data = await authFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
  persistToken(data.token);
  return data;
}

export async function logoutAccount(): Promise<void> {
  try {
    await authFetch("/api/auth/logout", { method: "POST", body: "{}" });
  } finally {
    persistToken(null);
  }
}

export async function verifyAccount(token: string): Promise<AuthUser> {
  const data = await authFetch("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  return data.user;
}

export async function resendVerification(): Promise<{ verifyToken: string; verifyUrl: string }> {
  return authFetch("/api/auth/resend-verify", { method: "POST", body: "{}" });
}

export async function forgotPassword(email: string): Promise<{
  message: string;
  resetToken?: string;
  resetUrl?: string;
}> {
  return authFetch("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetAccountPassword(body: {
  token: string;
  password: string;
}): Promise<{ user: AuthUser; token: string }> {
  const data = await authFetch("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(body),
  });
  persistToken(data.token);
  return data;
}

export async function socialLogin(
  provider: "google" | "github",
  profile?: { email?: string; name?: string },
): Promise<{ user: AuthUser; token: string; mode: string; message?: string }> {
  const data = await authFetch(`/api/auth/social/${provider}`, {
    method: "POST",
    body: JSON.stringify({ ...profile, mode: "start" }),
  });
  if (data.mode === "oauth" && data.url) {
    window.location.href = data.url;
    return data;
  }
  persistToken(data.token);
  return data;
}
