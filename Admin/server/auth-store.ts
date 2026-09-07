import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type AuthProvider = "email" | "google" | "github";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  passwordHash?: string;
  provider: AuthProvider;
  emailVerified: boolean;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface AuthToken {
  token: string;
  userId: string;
  type: "verify" | "reset";
  expiresAt: string;
}

interface AuthDb {
  users: AuthUser[];
  sessions: AuthSession[];
  tokens: AuthToken[];
}

const DATA_DIR = path.join(process.cwd(), ".studio-data");
const DB_PATH = path.join(DATA_DIR, "auth.json");
const SESSION_DAYS = 30;

function emptyDb(): AuthDb {
  return { users: [], sessions: [], tokens: [] };
}

function readDb(): AuthDb {
  try {
    if (!fs.existsSync(DB_PATH)) return emptyDb();
    const raw = JSON.parse(fs.readFileSync(DB_PATH, "utf8")) as AuthDb;
    return {
      users: Array.isArray(raw.users) ? raw.users : [],
      sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
      tokens: Array.isArray(raw.tokens) ? raw.tokens : [],
    };
  } catch {
    return emptyDb();
  }
}

function writeDb(db: AuthDb): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, useSalt, 64).toString("hex");
  return { hash: `${useSalt}:${hash}`, salt: useSalt };
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = crypto.scryptSync(password, salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(next, "hex"));
  } catch {
    return false;
  }
}

function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    provider: user.provider,
    emailVerified: user.emailVerified,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}

export type PublicUser = ReturnType<typeof publicUser>;

export function findUserByEmail(email: string): AuthUser | undefined {
  const normalized = email.trim().toLowerCase();
  return readDb().users.find((u) => u.email === normalized);
}

export function getUserById(id: string): AuthUser | undefined {
  return readDb().users.find((u) => u.id === id);
}

export function createSession(userId: string): { token: string; expiresAt: string } {
  const db = readDb();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.sessions = db.sessions.filter((s) => s.userId !== userId || new Date(s.expiresAt) > new Date());
  db.sessions.push({
    token,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt,
  });
  writeDb(db);
  return { token, expiresAt };
}

export function getSessionUser(token: string | undefined | null): PublicUser | null {
  if (!token) return null;
  const db = readDb();
  const session = db.sessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) {
    db.sessions = db.sessions.filter((s) => s.token !== token);
    writeDb(db);
    return null;
  }
  const user = db.users.find((u) => u.id === session.userId);
  return user ? publicUser(user) : null;
}

export function destroySession(token: string | undefined | null): void {
  if (!token) return;
  const db = readDb();
  db.sessions = db.sessions.filter((s) => s.token !== token);
  writeDb(db);
}

function issueToken(userId: string, type: "verify" | "reset"): string {
  const db = readDb();
  db.tokens = db.tokens.filter((t) => !(t.userId === userId && t.type === type));
  const token = randomToken();
  const hours = type === "verify" ? 48 : 2;
  db.tokens.push({
    token,
    userId,
    type,
    expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
  });
  writeDb(db);
  return token;
}

function consumeToken(token: string, type: "verify" | "reset"): AuthUser | null {
  const db = readDb();
  const entry = db.tokens.find((t) => t.token === token && t.type === type);
  if (!entry) return null;
  if (new Date(entry.expiresAt) < new Date()) {
    db.tokens = db.tokens.filter((t) => t.token !== token);
    writeDb(db);
    return null;
  }
  const user = db.users.find((u) => u.id === entry.userId);
  db.tokens = db.tokens.filter((t) => t.token !== token);
  writeDb(db);
  return user ?? null;
}

export function registerEmailUser(input: {
  name: string;
  email: string;
  password: string;
}): { user: PublicUser; verifyToken: string; sessionToken: string } {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || email.split("@")[0];
  if (!email || !input.password || input.password.length < 8) {
    throw new Error("Name, valid email, and password (8+ chars) are required");
  }
  if (findUserByEmail(email)) {
    throw new Error("An account with this email already exists");
  }

  const now = new Date().toISOString();
  const { hash } = hashPassword(input.password);
  const user: AuthUser = {
    id: crypto.randomUUID(),
    email,
    name,
    passwordHash: hash,
    provider: "email",
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  };

  const db = readDb();
  db.users.push(user);
  writeDb(db);

  const verifyToken = issueToken(user.id, "verify");
  const { token: sessionToken } = createSession(user.id);
  return { user: publicUser(user), verifyToken, sessionToken };
}

export function loginEmail(email: string, password: string): { user: PublicUser; sessionToken: string } {
  const user = findUserByEmail(email);
  if (!user || user.provider !== "email" || !user.passwordHash) {
    throw new Error("Invalid email or password");
  }
  if (!verifyPassword(password, user.passwordHash)) {
    throw new Error("Invalid email or password");
  }
  const { token } = createSession(user.id);
  return { user: publicUser(user), sessionToken: token };
}

export function verifyEmail(token: string): PublicUser {
  const user = consumeToken(token, "verify");
  if (!user) throw new Error("Invalid or expired verification link");

  const db = readDb();
  const idx = db.users.findIndex((u) => u.id === user.id);
  if (idx < 0) throw new Error("User not found");
  db.users[idx] = {
    ...db.users[idx],
    emailVerified: true,
    updatedAt: new Date().toISOString(),
  };
  writeDb(db);
  return publicUser(db.users[idx]);
}

export function requestPasswordReset(email: string): { resetToken: string | null } {
  const user = findUserByEmail(email);
  if (!user || user.provider !== "email") {
    // Do not reveal whether the email exists.
    return { resetToken: null };
  }
  return { resetToken: issueToken(user.id, "reset") };
}

export function resetPassword(token: string, password: string): PublicUser {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const user = consumeToken(token, "reset");
  if (!user) throw new Error("Invalid or expired reset link");

  const { hash } = hashPassword(password);
  const db = readDb();
  const idx = db.users.findIndex((u) => u.id === user.id);
  if (idx < 0) throw new Error("User not found");
  db.users[idx] = {
    ...db.users[idx],
    passwordHash: hash,
    emailVerified: true,
    updatedAt: new Date().toISOString(),
  };
  // Invalidate existing sessions after password change.
  db.sessions = db.sessions.filter((s) => s.userId !== user.id);
  writeDb(db);
  return publicUser(db.users[idx]);
}

export function loginSocial(
  provider: "google" | "github",
  profile: { email: string; name: string; avatarUrl?: string },
): { user: PublicUser; sessionToken: string; created: boolean } {
  const email = profile.email.trim().toLowerCase();
  if (!email) throw new Error("Social provider did not return an email");

  const db = readDb();
  let user = db.users.find((u) => u.email === email);
  let created = false;

  if (!user) {
    const now = new Date().toISOString();
    user = {
      id: crypto.randomUUID(),
      email,
      name: profile.name.trim() || email.split("@")[0],
      provider,
      emailVerified: true,
      avatarUrl: profile.avatarUrl,
      createdAt: now,
      updatedAt: now,
    };
    db.users.push(user);
    writeDb(db);
    created = true;
  } else {
    const idx = db.users.findIndex((u) => u.id === user!.id);
    db.users[idx] = {
      ...db.users[idx],
      name: profile.name.trim() || db.users[idx].name,
      avatarUrl: profile.avatarUrl ?? db.users[idx].avatarUrl,
      emailVerified: true,
      updatedAt: new Date().toISOString(),
    };
    writeDb(db);
    user = db.users[idx];
  }

  const { token } = createSession(user.id);
  return { user: publicUser(user), sessionToken: token, created };
}

export function resendVerifyToken(userId: string): string {
  const user = getUserById(userId);
  if (!user) throw new Error("User not found");
  if (user.emailVerified) throw new Error("Email already verified");
  return issueToken(user.id, "verify");
}
