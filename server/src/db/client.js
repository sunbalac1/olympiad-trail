import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema.js";

// Workers can't hold a long-lived TCP connection the way node-postgres does,
// so we use Neon's HTTP driver — each query is a single fetch(), which is
// exactly what a stateless Worker invocation needs.
export function getDb(databaseUrl) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}
