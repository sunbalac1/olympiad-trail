import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { accounts } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { issueSession, clearSession, requireAuth } from "../lib/auth.js";

export const authRoutes = new Hono();

authRoutes.post("/signup", async (c) => {
  const { email, password } = await c.req.json().catch(() => ({}));
  if (!email || !password || password.length < 8) {
    return c.json({ error: "Email and a password (8+ characters) are required." }, 400);
  }
  const db = getDb(c.env.DATABASE_URL);
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await db.select().from(accounts).where(eq(accounts.email, normalizedEmail)).limit(1);
  if (existing.length > 0) return c.json({ error: "An account with that email already exists." }, 409);

  const passwordHash = await hashPassword(password);
  const [account] = await db.insert(accounts).values({ email: normalizedEmail, passwordHash }).returning();

  await issueSession(c, account);
  return c.json({ id: account.id, email: account.email, isAdmin: account.isAdmin });
});

authRoutes.post("/login", async (c) => {
  const { email, password } = await c.req.json().catch(() => ({}));
  if (!email || !password) return c.json({ error: "Email and password are required." }, 400);
  const db = getDb(c.env.DATABASE_URL);
  const normalizedEmail = email.trim().toLowerCase();

  const [account] = await db.select().from(accounts).where(eq(accounts.email, normalizedEmail)).limit(1);
  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    return c.json({ error: "Incorrect email or password." }, 401);
  }

  await issueSession(c, account);
  return c.json({ id: account.id, email: account.email, isAdmin: account.isAdmin });
});

authRoutes.post("/logout", requireAuth, async (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const { id, isAdmin } = c.get("account");
  const db = getDb(c.env.DATABASE_URL);
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!account) return c.json({ error: "Account no longer exists." }, 401);
  return c.json({ id: account.id, email: account.email, isAdmin });
});
