import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { questions } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";

export const questionRoutes = new Hono();
questionRoutes.use("*", requireAuth);

// The question bank is shared content, same for every account — no
// account-scoping here, unlike students/attempts/flags.
questionRoutes.get("/", async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const { subject, grade, topic } = c.req.query();

  const conditions = [];
  if (subject) conditions.push(eq(questions.subject, subject));
  if (grade) conditions.push(eq(questions.grade, Number(grade)));
  if (topic) conditions.push(eq(questions.topic, topic));

  const rows = conditions.length > 0
    ? await db.select().from(questions).where(and(...conditions))
    : await db.select().from(questions);

  return c.json(rows);
});
