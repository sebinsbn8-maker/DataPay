import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Optimistic gate only; every API route and server page re-checks the session and role.
const gate = withAuth(
  function proxy(req) {
    const role = req.nextauth.token?.role as string | undefined;
    const path = req.nextUrl.pathname;
    const adminOnly = ["/users", "/settings", "/qc"];
    if (role === "CONTRIBUTOR" && !path.startsWith("/my")) return NextResponse.redirect(new URL("/my", req.url));
    if (role === "MANAGER" && adminOnly.some((p) => path.startsWith(p))) return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  },
  { pages: { signIn: "/login" } },
);

export default gate;
export const config = {
  matcher: ["/((?!login|forgot-password|reset-password|api|_next|favicon.ico|logo.svg|.*\\.(?:png|svg|jpg|ico)$).*)"],
};
