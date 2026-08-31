import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRoutes } from "./routes/auth.js";
import { studentRoutes } from "./routes/students.js";
import { questionRoutes } from "./routes/questions.js";
import { attemptRoutes } from "./routes/attempts.js";
import { flagRoutes } from "./routes/flags.js";
import { adminRoutes } from "./routes/admin.js";

const app = new Hono();

// FRONTEND_ORIGIN is set as a Worker var (see wrangler.toml / .dev.vars) —
// e.g. https://olympiad-trail.pages.dev. `credentials: true` is required
// since auth relies on an httpOnly session cookie, not a bearer token.
app.use("*", (c, next) => cors({
  origin: c.env.FRONTEND_ORIGIN,
  credentials: true,
})(c, next));

app.get("/", (c) => c.json({ ok: true, service: "olympiad-trail-api" }));

app.route("/auth", authRoutes);
app.route("/students", studentRoutes);
app.route("/questions", questionRoutes);
app.route("/attempts", attemptRoutes);
app.route("/flags", flagRoutes);
app.route("/admin", adminRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Something went wrong." }, 500);
});

export default app;
