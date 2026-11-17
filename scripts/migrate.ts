import { runMigrations } from "../src/db";

runMigrations()
  .then(() => { console.log("Migrations applied."); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
