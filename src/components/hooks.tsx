"use client";
import { useCallback, useEffect, useState } from "react";
import { api, Select, Input, Field } from "./ui";

export function useApi<T>(url: string | null) {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string }>({ url: null, data: null, error: "" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let stale = false;
    api<T>(url)
      .then((data) => { if (!stale) setState({ url, data, error: "" }); })
      .catch((e: Error) => { if (!stale) setState((s) => ({ url, data: s.data, error: e.message })); });
    return () => { stale = true; };
  }, [url, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  // keeps showing the previous result while a new request is in flight
  return { data: state.data, error: state.error, loading: !!url && state.url !== url, reload };
}

export type Project = { id: string; code: string; name: string; clientName: string; description: string | null; startDate: string | null; endDate: string | null; status: string; managerId: string | null; notes: string | null; archivedAt: string | null };
export type Industry = { id: string; projectId: string; name: string; description: string | null; managerId: string | null; status: string };

export function useLookups() {
  const p = useApi<Project[]>("/api/projects");
  const i = useApi<Industry[]>("/api/industries");
  return { projects: p.data ?? [], industries: i.data ?? [], reload: () => { p.reload(); i.reload(); }, ready: !p.loading && !i.loading };
}

export const today = () => new Date().toISOString().slice(0, 10);
export const monthStart = () => today().slice(0, 8) + "01";

export type FilterState = { from: string; to: string; projectId: string; industryId: string };
export function FilterBar({ value, onChange, projects, industries, showDates = true }: {
  value: FilterState; onChange: (v: FilterState) => void; projects: Project[]; industries: Industry[]; showDates?: boolean;
}) {
  const inds = industries.filter((i) => !value.projectId || i.projectId === value.projectId);
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
      {showDates && <Field label="From"><Input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} /></Field>}
      {showDates && <Field label="To"><Input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} /></Field>}
      <Field label="Project">
        <Select value={value.projectId} onChange={(e) => onChange({ ...value, projectId: e.target.value, industryId: "" })}>
          <option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Industry">
        <Select value={value.industryId} onChange={(e) => onChange({ ...value, industryId: e.target.value })}>
          <option value="">All industries</option>{inds.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </Select>
      </Field>
    </div>
  );
}

export const toQuery = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  return p.toString();
};
export const hrs = (n: number | string) => (Math.round(Number(n) * 100) / 100).toLocaleString("en-IN");
export const inr = (n: number | string) => "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
