"use client";
import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button, Field, Input, api } from "@/components/ui";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <Logo dark />
        <h1 className="text-2xl font-semibold">Forgot password</h1>
        {sent ? (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">If that email belongs to an active account, a reset link has been issued. Your administrator can also share it with you.</p>
        ) : (
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await api("/api/password/forgot", { method: "POST", json: { email } }).catch(() => {}); setSent(true); setBusy(false); }}>
            <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Button className="w-full" disabled={busy}>Send reset link</Button>
          </form>
        )}
        <Link href="/login" className="block text-sm text-violet">Back to sign in</Link>
      </div>
    </main>
  );
}
