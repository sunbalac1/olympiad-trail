import { Hono } from "hono";
import { getDb } from "../db/client.js";
import { flags } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";
import { assertOwnsStudent } from "../lib/ownership.js";

export const flagRoutes = new Hono();
flagRoutes.use("*", requireAuth);

// Any signed-in account can flag a question, but only for a student they own.
// Admin-only listing/resolving lives in routes/admin.js, mounted at
// /admin/flags — see that file for why.
flagRoutes.post("/", async (c) => {
  const { id: accountId } = c.get("account");
  const { studentId, questionId, reason } = await c.req.json().catch(() => ({}));
  if (!studentId || !questionId || !["wrong", "no-correct-option"].includes(reason)) {
    return c.json({ error: "studentId, questionId, and a valid reason are required." }, 400);
  }
  const db = getDb(c.env.DATABASE_URL);
  if (!(await assertOwnsStudent(db, accountId, studentId))) {
    return c.json({ error: "Student not found." }, 404);
  }
  const [flag] = await db.insert(flags).values({ studentId, questionId, reason }).returning();
  return c.json(flag);
});
