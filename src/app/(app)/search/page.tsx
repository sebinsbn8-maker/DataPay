import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { listContributors, listIndustries, listProjects } from "@/server/masterdata";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

function Section({ title, href, items }: { title: string; href: string; items: { id: string; label: string }[] }) {
  if (!items.length) return null;
  return (
    <Card><h2 className="mb-2 font-semibold">{title}</h2><ul className="space-y-1 text-sm">{items.map((i) => <li key={i.id}><Link href={href} className="text-violet">{i.label}</Link></li>)}</ul></Card>
  );
}
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const session = await getServerSession(authOptions);
  const term = q.trim().toLowerCase();
  let projects: { id: string; name: string }[] = [], industries: { id: string; name: string }[] = [], contributors: { id: string; fullName: string; code: string }[] = [];
  if (term && session?.user && session.user.role !== "CONTRIBUTOR") {
    const u = session.user;
    const has = (...v: (string | null | undefined)[]) => v.some((x) => x?.toLowerCase().includes(term));
    projects = (await listProjects(u)).filter((p) => has(p.name, p.code, p.clientName));
    industries = (await listIndustries(u)).filter((i) => has(i.name));
    contributors = (await listContributors(u)).filter((c) => has(c.fullName, c.code, c.email));
  }
  return (
    <div className="space-y-4">
      <PageHeader title={term ? `Results for “${q}”` : "Search"} subtitle={term ? undefined : "Type in the search box above."} />
      <Section title="Projects" href="/projects" items={projects.map((p) => ({ id: p.id, label: p.name }))} />
      <Section title="Industries" href="/industries" items={industries.map((p) => ({ id: p.id, label: p.name }))} />
      <Section title="Contributors" href="/contributors" items={contributors.map((p) => ({ id: p.id, label: `${p.fullName} (${p.code})` }))} />
      {term && !projects.length && !industries.length && !contributors.length && <Card className="text-center text-muted">Nothing found.</Card>}
    </div>
  );
}
