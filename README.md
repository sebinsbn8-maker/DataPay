# DataPay

**Every hour counts. Every contribution matters.**

Online platform for data-collection companies to manage projects, industries, contributors, daily hours,
client acceptance (QC), productivity, and industry-level payments. Responsive (desktop, tablet, Android, iPhone).

Stack: Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Recharts · PostgreSQL · Drizzle ORM · NextAuth (email/password + Google).

> **Why Drizzle instead of Prisma?** Prisma downloads a native engine from `binaries.prisma.sh`, which the build
> environment blocked, so Prisma could not be run or tested. Drizzle is pure TypeScript, still PostgreSQL, and let every
> calculation and workflow be tested against a real Postgres engine. The schema is in `src/db/schema.ts`; SQL migrations are in `drizzle/`.

---

## 1. Quick start (no database install needed)

```bash
npm install
cp .env.example .env.local
#   in .env.local set:  DATABASE_URL=pglite://./.pgdata   NEXTAUTH_SECRET=$(openssl rand -base64 32)
npm run db:seed:demo      # migrates, creates the admin + the "Scene Capture Project" sample data
npm run dev               # http://localhost:3000
```

`pglite://` is an embedded PostgreSQL stored in `./.pgdata`. It is for **local demos and tests only** (single process).
For anything shared or online, use a real PostgreSQL URL (section 3).

Demo logins created by `db:seed:demo`:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@datapay.local` | `DemoAdmin#2026` |
| Manager (Manufacturing only) | `manager@datapay.local` | `DemoManager#2026` |
| Contributor | `contributor@datapay.local` | `DemoContrib#2026` |

The sample data has 1 project, 7 industries, 21 contributors, two weeks of hours, individual and industry-level client
acceptance, and statements in every payment state. **Do not seed demo data in production.**

## 2. Initialising the real admin account

```bash
DATABASE_URL=postgres://... ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='a-long-password' ADMIN_NAME='Your Name' npm run db:seed:admin
```

This applies migrations, creates the three roles, and creates the first admin (idempotent). Sign in, then create managers
and contributor logins under **User Management**. Change the password under **Settings**.

## 3. Production database & environment

Copy `.env.example`. Required: `DATABASE_URL` (PostgreSQL), `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (your public https URL).
Optional: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (the Google button appears only when both are set), `DB_POOL_MAX`.

Apply migrations with `npm run db:migrate` (safe to re-run). After a schema change: edit `src/db/schema.ts`, run `npm run db:generate`, commit the new file in `drizzle/`.

### Google sign-in
Create an OAuth client (Web) in Google Cloud Console. Authorised redirect URI: `https://<your-domain>/api/auth/callback/google`.
Google sign-in only works for emails an admin already created in User Management (no self-registration).

## 4. Deployment

### Option A: Vercel (app) + Render PostgreSQL (database)
1. Render → New → PostgreSQL. Copy the **External** connection string (append `?sslmode=require` if not present).
2. Vercel → import the repo. Environment variables: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (the Vercel URL / custom domain), optional Google keys.
3. Build command: `npm run vercel-build` (runs migrations, then `next build`). Deploy.
4. Once, from your machine: `DATABASE_URL=<render url> ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:seed:admin`.

There is no separate backend: the REST API lives in `src/app/api/*` and deploys with the app. If you later want a standalone API, the business logic is already isolated in `src/server/*`.

### Option B: everything on Render
Use the included `render.yaml` (Blueprint): creates the web service and PostgreSQL, runs migrations before each deploy. Set `NEXTAUTH_URL` after the first deploy.

### Backups
Managed PostgreSQL (Render/Neon/Supabase) provides automated backups: enable and test restoring one. For your own copies: `DATABASE_URL=... npm run db:backup` (needs `pg_dump`; keeps the latest 30 in `./backups`).
Financial and QC records are never hard-deleted (archive/void only), and every change is in the audit log.

## 5. Tests

```bash
npm test          # 25 tests: formulas, rate priority, QC, statements, payments, audit, consistency
npm run typecheck
npm run lint
```
Workflow tests run the real services against an in-memory PostgreSQL engine and reproduce the examples from the specification
(10 h @ 90 % = 9 h; 10 h @ 87 % = 8.7 h; ₹2,250 + ₹2,175 = ₹4,425).

---

## 6. How the business rules are implemented

| Rule | Where / how |
|---|---|
| Accepted = Submitted × % ÷ 100; Rejected = Submitted − Accepted | `src/lib/calc.ts` (arbitrary-precision decimals; stored to 6 dp; never rounded early) |
| Pay **only** on accepted hours | Pending (no client % yet) hours are excluded everywhere; rejected hours are 0-value |
| Productivity | Submitted ÷ Target and Accepted ÷ Target; pending QC hours never count as accepted |
| Rates | `payment_rates` is append-only with an effective date. Priority: **contributor → industry → project**; the latest rate effective on or before the *work date* applies |
| Historical protection | When hours go into a statement they are **locked** (`statement_id`) with the rate and exact amount frozen. Later rate changes can't touch them |
| No double billing | Statement creation atomically claims unclaimed, reviewed records; a second statement for the same hours finds nothing |
| Approval / payment | Row-locked transactions. Approve once only; payments ≤ outstanding; reference unique per statement; partial payments supported |
| Calculated vs approved vs paid | `calculated_amount` (+ `adjustments_total`) → `approved_amount` (frozen at approval) → `paid_amount` (sum of transactions) |
| Audit | Every QC change, rate change, adjustment, approval, payment, allocation and master-data edit is in `audit_logs` with before/after, visible in **Settings** (Admin) |
| One number everywhere | Money is rounded to the paisa per contributor, per rate, per statement: exactly how statements bill. Dashboard, reports and payments therefore agree to the paisa |

### Decisions taken where the specification was open (all configurable or easy to change)
- **Submitted ≤ actual hours.** A contributor can't submit more than they worked; the form and API reject it.
- **Multiple work sessions per day** are supported (actual = sum of sessions); one daily record per contributor per industry per day, so duplicates can't occur.
- **Industry-level client %**: accepted hours are allocated pro-rata to each record's submitted hours (`PRO_RATA_BY_SUBMITTED`). Records with an individually-set % are **not** overwritten unless the admin ticks "overwrite"; the allocation is audited.
- **Statement scope:** a statement contains reviewed hours for an industry and period. Hours still pending client review are excluded and can be billed in a later statement.
- **Void:** an unpaid statement can be voided (reason required), which releases its hours so QC can be corrected. A statement with payments can't be voided (use adjustments).
- **Industry payment status** (Not Ready / Pending Approval / Approved / Partially Paid / Paid) is derived from money state: reviewed-but-unbilled hours or a statement awaiting approval → Pending Approval; otherwise Paid when nothing remains, Partially Paid when something is paid, else Approved.
- **Managers** can enter hours, prepare payment statements and view reports for projects/industries assigned to them (set on the project or industry). They cannot approve, pay, adjust, change rates/targets, or see QC configuration. Only Admin approves and records payments.
- **Transfers:** moving a contributor to another industry closes the old assignment and opens a new one; history stays with the old industry.
- **Targets** are per assignment (daily/weekly/monthly), snapshotted onto each daily record when it is created.
- **Currency** is INR (₹), stored per rate row.
- **Password reset:** no email server is configured, so a reset request notifies the admins (with a one-hour link), and admins can generate a link in User Management. Add SMTP in `src/app/api/password/forgot/route.ts` to email it directly.
- **Reports** aggregate in the application, which is comfortable for tens of thousands of daily records per query. If you outgrow that, move the grouping into SQL (`src/server/facts.ts`/`analytics.ts`).

## 7. Project layout

```
src/db/              schema + client + migrator          drizzle/    SQL migrations
src/lib/calc.ts      all formulas (pure)                 src/lib/aggregate.ts   grouping + money rule (pure)
src/server/          services: hours, qc, payments, analytics, exporters, auth, audit
src/app/api/         REST endpoints (every one checks session + role)
src/app/(app)/       dashboard, projects, industries, contributors, daily-hours, qc, productivity, payments, reports, users, settings, my
src/proxy.ts         route gate (Next 16 "proxy", formerly middleware)
tests/               unit + workflow tests        scripts/    migrate, seed-admin, seed-demo, backup
```

## 8. Security notes
bcrypt (cost 12) password hashing · 8-hour JWT sessions · role checks on every API route and page (the proxy is only an optimistic gate) ·
zod validation on all inputs · parameterised queries (Drizzle) · login/reset responses don't reveal whether an email exists · exports neutralise spreadsheet-formula injection ·
managers are scoped to assigned projects/industries and contributors to their own records on the server, not just in the UI.
**Before going live:** use a long random `NEXTAUTH_SECRET`, serve over HTTPS only, and consider adding rate limiting / an IP allow-list in front (e.g. Vercel Firewall or Cloudflare) for the login endpoint.

## 9. What was and wasn't verified
Verified here: 25 automated tests (including the spec's worked examples), a production build, real logins for all three roles, role isolation over HTTP, exports (xlsx/csv/pdf open correctly), a headless-browser pass over every page at desktop and phone sizes with no console or network errors, and a scripted click-through of hours → QC → statement → approval → partial payment.
**Not verified:** a live Google OAuth round trip (needs your credentials), an actual Vercel/Render deployment, load/performance at scale, and real iPhone/Android devices (layouts were checked in a headless browser at 390 px width).
