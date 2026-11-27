import { beforeAll, describe, expect, it } from "vitest";
process.env.DATABASE_URL = "pglite://memory";
import { runMigrations } from "../src/db";
import { ensureAdmin } from "../src/server/bootstrap";
import { createUser, updateUser, deleteUser, listUsers } from "../src/server/users";

let admin: string;
beforeAll(async () => { await runMigrations(); admin = (await ensureAdmin("admin@test.io", "TestPassword123")).id; });
const find = async (email: string) => (await listUsers()).find((u) => u.email === email)!;

describe("user management", () => {
  it("edits name, email, role and status; blocks duplicate emails", async () => {
    const m = await createUser(admin, { name: "Mgr", email: "m@x.io", role: "MANAGER", password: "LongPassword123", isActive: true });
    await createUser(admin, { name: "Other", email: "o@x.io", role: "MANAGER", password: "LongPassword123", isActive: true });
    await updateUser(admin, m.id, { name: "Manager One", email: "m2@x.io", isActive: false });
    const u = await find("m2@x.io");
    expect(u).toMatchObject({ name: "Manager One", isActive: false, role: "MANAGER" });
    await expect(updateUser(admin, m.id, { email: "o@x.io" })).rejects.toThrow(/already/);
    await updateUser(admin, m.id, { role: "ADMIN" });
    expect((await find("m2@x.io")).role).toBe("ADMIN");
    expect((await find("m2@x.io")).isActive).toBe(false); // editing the role must not re-enable
  });
  it("protects yourself and the last active admin", async () => {
    await expect(updateUser(admin, admin, { isActive: false })).rejects.toThrow(/own account/);
    await expect(deleteUser(admin, admin)).rejects.toThrow(/own account/);
    const b = await createUser(admin, { name: "Adm2", email: "a2@x.io", role: "ADMIN", password: "LongPassword123", isActive: true });
    await updateUser(admin, b.id, { isActive: false }); // fine: original admin remains active
    await expect(deleteUser(b.id, admin)).rejects.toThrow(/active admin/); // would leave no other active admin
  });
  it("deletes a user with no activity, refuses one with activity", async () => {
    const x = await createUser(admin, { name: "Temp", email: "t@x.io", role: "MANAGER", password: "LongPassword123", isActive: true });
    await deleteUser(admin, x.id);
    expect((await listUsers()).some((u) => u.email === "t@x.io")).toBe(false);
    const y = await createUser(admin, { name: "Busy", email: "y@x.io", role: "ADMIN", password: "LongPassword123", isActive: true });
    await createUser(y.id, { name: "Made by Y", email: "z@x.io", role: "MANAGER", password: "LongPassword123", isActive: true }); // writes an audit row by y
    await expect(deleteUser(admin, y.id)).rejects.toThrow(/Disable them instead/);
  });
});

describe("deleting a user who only signed in", () => {
  it("is allowed (login records don't count as activity)", async () => {
    const { audit } = await import("../src/server/audit");
    const { getDb } = await import("../src/db");
    const u = await createUser(admin, { name: "Login only", email: "lo@x.io", role: "MANAGER", password: "LongPassword123", isActive: true });
    await audit(await getDb(), { userId: u.id, action: "LOGIN", entity: "user", entityId: u.id });
    await deleteUser(admin, u.id);
    expect((await listUsers()).some((x) => x.email === "lo@x.io")).toBe(false);
  });
});
