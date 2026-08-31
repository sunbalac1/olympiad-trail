import { sign, verify } from "hono/jwt";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

const COOKIE_NAME = "session";
const SESSION_DAYS = 30;

export async function issueSession(c, account) {
  const payload = {
    accountId: account.id,
    isAdmin: account.isAdmin,
    exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60,
  };
  const token = await sign(payload, c.env.JWT_SECRET);
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export function clearSession(c) {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}

// Hono middleware: requires a valid session cookie, sets c.var.account = { id, isAdmin }.
// Every route that touches student/attempt/flag data should sit behind this,
// and then filter every query by accountId — that's what actually makes
// "students can't see each other's data" true, not anything in the UI.
export async function requireAuth(c, next) {
  const token = getCookie(c, COOKIE_NAME);
  if (!token) return c.json({ error: "Not signed in." }, 401);
  try {
    const payload = await verify(token, c.env.JWT_SECRET, "HS256");
    c.set("account", { id: payload.accountId, isAdmin: !!payload.isAdmin });
    await next();
  } catch {
    return c.json({ error: "Session expired or invalid." }, 401);
  }
}

export async function requireAdmin(c, next) {
  const account = c.get("account");
  if (!account?.isAdmin) return c.json({ error: "Admin access required." }, 403);
  await next();
}
