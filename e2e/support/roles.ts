import { DatabaseSync } from "node:sqlite";
import { demoDatabase } from "./demo-data.ts";

/** The dev bypass always signs in this user (EmDash `auth/dev-bypass.ts`). */
const DEV_USER_EMAIL = "dev@emdash.local";

export const ROLES = {
  subscriber: 10,
  contributor: 20,
  author: 30,
  editor: 40,
  admin: 50,
} as const;

/**
 * Changes the signed-in dev user's role in the demo database. EmDash reads the role on every
 * request, and its users API refuses to change your own role, so the database is the only way.
 */
export function setDevRole(platform: string, role: number) {
  const db = new DatabaseSync(demoDatabase(platform));
  try {
    const result = db
      .prepare("UPDATE users SET role = ? WHERE email = ?")
      .run(role, DEV_USER_EMAIL);
    if (result.changes !== 1) throw new Error(`Dev user ${DEV_USER_EMAIL} not found`);
  } finally {
    db.close();
  }
}
