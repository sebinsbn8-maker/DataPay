import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { audit } from "./audit";
import { HttpError } from "./guard";
import type { Role } from "@/lib/permissions";

type U = { id: string; role: Role; contributorId?: string | null };
export const MAX_SIGNATURE_BYTES = 400 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Accepts only PNG / JPEG data URLs (no SVG: it can carry scripts), checks the real file signature and size. */
export function parseSignatureDataUrl(input: string) {
  const m = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec((input ?? "").trim());
  if (!m) throw new HttpError(400, "The signature must be a PNG or JPEG image");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > MAX_SIGNATURE_BYTES) throw new HttpError(400, `The signature image is too large (max ${MAX_SIGNATURE_BYTES / 1024} KB)`);
  const okPng = buf.length > 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
  const okJpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (m[1] === "image/png" ? !okPng : !okJpg) throw new HttpError(400, "The file content does not match an image of that type");
  return { mime: m[1], base64: m[2], bytes: buf.length };
}

async function assertContributor(id: string) {
  const db = await getDb();
  const [c] = await db.select({ id: s.contributors.id }).from(s.contributors).where(eq(s.contributors.id, id));
  if (!c) throw new HttpError(404, "Contributor not found");
}
/** Admins can edit anyone's signature; a contributor can edit only their own. */
export function assertCanEdit(u: U, contributorId: string) {
  if (u.role === "ADMIN" || (u.role === "CONTRIBUTOR" && u.contributorId === contributorId)) return;
  throw new HttpError(403, "You can only change your own signature");
}
export function assertCanView(u: U, contributorId: string) {
  if (u.role === "ADMIN" || u.role === "MANAGER" || (u.role === "CONTRIBUTOR" && u.contributorId === contributorId)) return;
  throw new HttpError(403, "Forbidden");
}

export async function setSignature(u: U, contributorId: string, dataUrl: string) {
  assertCanEdit(u, contributorId);
  await assertContributor(contributorId);
  const p = parseSignatureDataUrl(dataUrl);
  const db = await getDb();
  await db.insert(s.contributorSignatures).values({ contributorId, mime: p.mime, data: p.base64, bytes: p.bytes, updatedBy: u.id })
    .onConflictDoUpdate({ target: s.contributorSignatures.contributorId, set: { mime: p.mime, data: p.base64, bytes: p.bytes, updatedBy: u.id, updatedAt: new Date() } });
  await audit(db, { userId: u.id, action: "SIGNATURE", entity: "contributor", entityId: contributorId, note: `signature uploaded (${p.bytes} bytes)` });
  return { ok: true };
}

export async function removeSignature(u: U, contributorId: string) {
  assertCanEdit(u, contributorId);
  const db = await getDb();
  await db.delete(s.contributorSignatures).where(eq(s.contributorSignatures.contributorId, contributorId));
  await audit(db, { userId: u.id, action: "SIGNATURE", entity: "contributor", entityId: contributorId, note: "signature removed" });
  return { ok: true };
}

export async function getSignature(contributorId: string) {
  const db = await getDb();
  const [r] = await db.select().from(s.contributorSignatures).where(eq(s.contributorSignatures.contributorId, contributorId));
  return r ? { mime: r.mime, data: r.data } : null;
}
