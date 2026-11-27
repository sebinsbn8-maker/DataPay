"use client";
import { useRef, useState } from "react";
import { Button, Modal, api } from "@/components/ui";

const MAX_W = 600, MAX_H = 200;

/** Resize an uploaded picture to a signature-sized PNG so it stays small (and keeps any transparency). */
async function fileToSignature(file: File): Promise<string> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error("Please choose a PNG or JPG image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("That image is too large (max 8 MB).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("That image could not be read.")); i.src = url; });
    for (const scale of [1, 0.7, 0.5]) {
      const k = Math.min(1, (MAX_W * scale) / img.width, (MAX_H * scale) / img.height);
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/png");
      if (out.length < 500_000) return out;
    }
    throw new Error("That image is too detailed. Try a simpler or smaller picture.");
  } finally { URL.revokeObjectURL(url); }
}

function DrawPad({ onUse, onCancel }: { onUse: (dataUrl: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [inked, setInked] = useState(false);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * MAX_W, y: ((e.clientY - r.top) / r.height) * MAX_H }; };
  const start = (e: React.PointerEvent) => { drawing.current = true; ref.current!.setPointerCapture(e.pointerId); const ctx = ref.current!.getContext("2d")!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111"; };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const ctx = ref.current!.getContext("2d")!; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); setInked(true); };
  const stop = () => { drawing.current = false; };
  const clear = () => { ref.current!.getContext("2d")!.clearRect(0, 0, MAX_W, MAX_H); setInked(false); };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Sign inside the box using your mouse, finger or stylus.</p>
      <canvas ref={ref} width={MAX_W} height={MAX_H} aria-label="Signature pad" className="w-full touch-none rounded-lg border border-dashed border-muted bg-card-2"
        onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerLeave={stop} />
      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={clear}>Clear</Button>
        <span className="flex gap-2"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="button" disabled={!inked} onClick={() => onUse(ref.current!.toDataURL("image/png"))}>Use this signature</Button></span>
      </div>
    </div>
  );
}

/** Shows a contributor's e-signature and lets them (or an admin) upload, draw or remove it. */
export function SignaturePanel({ contributorId, canEdit }: { contributorId: string; canEdit: boolean }) {
  const [ver, setVer] = useState(0);
  const [has, setHas] = useState<"loading" | "yes" | "no">("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [draw, setDraw] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function save(dataUrl: string) {
    setBusy(true); setMsg(null);
    try { await api(`/api/contributors/${contributorId}/signature`, { method: "PUT", json: { dataUrl } }); setHas("loading"); setVer((v) => v + 1); setMsg({ ok: true, text: "Signature saved." }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }
  async function onFile(f?: File) {
    if (!f) return;
    try { await save(await fileToSignature(f)); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    if (file.current) file.current.value = "";
  }
  async function remove() {
    if (!confirm("Remove this signature? Future payment slips will show no signature.")) return;
    setBusy(true); setMsg(null);
    try { await api(`/api/contributors/${contributorId}/signature`, { method: "DELETE" }); setHas("no"); setVer((v) => v + 1); setMsg({ ok: true, text: "Signature removed." }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }

  return (
    <div>
      <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-line bg-card-2 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={ver} src={`/api/contributors/${contributorId}/signature?v=${ver}`} alt="Signature" className={has === "yes" ? "max-h-24 max-w-full" : "hidden"}
          onLoad={() => setHas("yes")} onError={() => setHas("no")} />
        {has !== "yes" && <p className="text-sm text-muted">{has === "loading" ? "Loading…" : "No signature uploaded yet."}</p>}
      </div>
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input ref={file} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button type="button" variant="outline" disabled={busy} onClick={() => file.current?.click()}>{has === "yes" ? "Upload new image" : "Upload image"}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setDraw(true)}>Draw signature</Button>
          {has === "yes" && <Button type="button" variant="danger" disabled={busy} onClick={remove}>Remove</Button>}
        </div>)}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-good" : "text-bad"}`} role="status">{msg.text}</p>}
      {canEdit && <p className="mt-2 text-xs text-muted">Use a clear signature on a white or transparent background (PNG or JPG). It is printed on payment acknowledgement slips.</p>}
      <Modal open={draw} onClose={() => setDraw(false)} title="Draw your signature">
        {draw && <DrawPad onCancel={() => setDraw(false)} onUse={(d) => { setDraw(false); save(d); }} />}
      </Modal>
    </div>
  );
}
