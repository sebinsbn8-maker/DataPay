import { runMigrations } from "../src/db";
import { ensureAdmin } from "../src/server/bootstrap";

(async () => {
  const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD");
  if (password.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
  await runMigrations();
  const r = await ensureAdmin(email, password, process.env.ADMIN_NAME ?? "Administrator");
  console.log(r.created ? `Admin created: ${email}` : `Admin already exists: ${email}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
