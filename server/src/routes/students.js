import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { students } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";

export const studentRoutes = new Hono();
studentRoutes.use("*", requireAuth);

// Every query here is scoped to the caller's account_id — this is the actual
// mechanism that keeps one family's kids invisible to another family, not
// anything the frontend does.

studentRoutes.get("/", async (c) => {
  const { id: accountId } = c.get("account");
  const db = getDb(c.env.DATABASE_URL);
  const rows = await db.select().from(students).where(eq(students.accountId, accountId));
  return c.json(rows);
});

studentRoutes.post("/", async (c) => {
  const { id: accountId } = c.get("account");
  const { name, avatar, grade } = await c.req.json().catch(() => ({}));
  if (!name?.trim() || !avatar || !grade) return c.json({ error: "name, avatar, and grade are required." }, 400);
  const db = getDb(c.env.DATABASE_URL);
  const [student] = await db.insert(students).values({ accountId, name: name.trim(), avatar, grade }).returning();
  return c.json(student);
});

studentRoutes.delete("/:id", async (c) => {
  const { id: accountId } = c.get("account");
  const studentId = Number(c.req.param("id"));
  const db = getDb(c.env.DATABASE_URL);
  const deleted = await db.delete(students)
    .where(and(eq(students.id, studentId), eq(students.accountId, accountId)))
    .returning();
  if (deleted.length === 0) return c.json({ error: "Student not found." }, 404);
  return c.json({ ok: true });
});
