"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setBusy(false);
    if (res?.error) return setError("Incorrect email or password, or the account is inactive.");
    router.replace("/dashboard"); // the proxy sends contributors on to /my
    router.refresh();
  }

  return (
    <div>
      <h2 className="text-gradient font-display text-3xl font-semibold tracking-tight">Sign in</h2>
      <p className="mt-1 text-muted">Welcome back to your workspace.</p>

      <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Email</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="input mt-1 h-12 w-full rounded-xl px-3 text-base" />
        </label>
        <label className="block">
          <span className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Password</span>
            <Link href="/forgot-password" className="text-xs font-medium text-violet">Forgot password?</Link>
          </span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="input mt-1 h-12 w-full rounded-xl px-3 text-base" />
        </label>
        {error && <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <button disabled={busy} className="btn-primary h-12 w-full rounded-xl font-semibold disabled:opacity-60">
          {busy ? <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Authenticating…</span> : "Sign in"}
        </button>
      </form>

      {googleEnabled && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or continue with<span className="h-px flex-1 bg-line" /></div>
          <button onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="flex h-12 w-full items-center justify-center gap-3 btn-outline rounded-xl font-medium">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
            Sign in with Google
          </button>
        </>
      )}
    </div>
  );
}
