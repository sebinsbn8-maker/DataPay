import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { HOME_BY_ROLE } from "@/lib/permissions";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect(HOME_BY_ROLE[session.user.role]);
  const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <main className="grid min-h-screen grid-rows-[auto_1fr] lg:grid-cols-[1.4fr_1fr] lg:grid-rows-none">
      {/* Brand panel: full on desktop, compact header on mobile */}
      <section className="relative flex flex-col justify-between overflow-hidden border-r border-white/[0.06] bg-navy/55 px-6 py-6 text-white backdrop-blur-sm lg:px-12 lg:py-10">
        <Logo />
        <div className="hidden max-w-xl lg:block">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 text-xs font-medium tracking-wide text-cyan"><span className="pulse-dot" aria-hidden />AI data operations platform</p>
          <h1 className="text-gradient font-display text-5xl font-semibold leading-tight tracking-tight">
            Every hour counts.<br />Every contribution matters.
          </h1>
          <p className="mt-5 text-lg text-muted">
            Hours, client acceptance, productivity and industry payments — your whole data collection operation in one workspace.
          </p>
        </div>
        <p className="hidden text-sm text-muted lg:block">Secure team workspace · DataPay</p>
        <p className="mt-4 text-sm text-muted lg:hidden">Every hour counts. Every contribution matters.</p>
      </section>

      <section className="flex items-center justify-center px-6 py-10">
        <div className="glass grad-border page-enter w-full max-w-sm rounded-2xl p-7 sm:p-8">
          <LoginForm googleEnabled={googleEnabled} />
        </div>
      </section>
    </main>
  );
}
