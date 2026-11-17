"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button, Field, Input, api } from "@/components/ui";

function Form() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="w-full max-w-sm space-y-6">
      <Logo dark />
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        try { await api("/api/password/reset", { method: "POST", json: { token, password } }); setMsg({ ok: true, text: "Password updated. You can sign in now." }); }
        catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
      }}>
        <Field label="New password" hint="At least 10 characters"><Input type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {msg && <p className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-red-700"}>{msg.text}</p>}
        <Button className="w-full">Update password</Button>
      </form>
      <Link href="/login" className="block text-sm text-violet">Back to sign in</Link>
    </div>
  );
}
export default function ResetPassword() {
  return <main className="flex min-h-screen items-center justify-center p-6"><Suspense><Form /></Suspense></main>;
}
