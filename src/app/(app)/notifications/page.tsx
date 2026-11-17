"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Card, PageHeader, api } from "@/components/ui";
import { useApi } from "@/components/hooks";

type N = { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };
export default function NotificationsPage() {
  const { data, reload } = useApi<N[]>("/api/notifications");
  useEffect(() => { if (data?.some((n) => !n.readAt)) { const t = setTimeout(() => api("/api/notifications", { method: "POST" }).then(reload), 1500); return () => clearTimeout(t); } }, [data, reload]);
  return (
    <div>
      <PageHeader title="Notifications" />
      <div className="space-y-3">
        {(data ?? []).map((n) => (
          <Card key={n.id} className={n.readAt ? "" : "border-violet/40"}>
            <p className="font-medium">{n.title}</p>{n.body && <p className="mt-1 break-all text-sm text-muted">{n.body}</p>}
            <p className="mt-2 text-xs text-muted">{new Date(n.createdAt).toLocaleString("en-IN")}{n.link && <> · <Link href={n.link} className="text-violet">Open</Link></>}</p>
          </Card>))}
        {data && !data.length && <Card className="text-center text-muted">You&apos;re all caught up.</Card>}
      </div>
    </div>
  );
}
