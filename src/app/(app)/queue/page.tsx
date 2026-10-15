import { Hand, ListChecks, Loader, HelpCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AutoRefresh } from "@/components/client";
import { ApplicationRow } from "@/components/application-row";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui";

export default async function QueuePage() {
  const user = await requireUser();
  const include = { job: { select: { title: true, company: true, sourceKey: true, isMock: true } } };
  const [inProgress, manual, unconfirmed] = await Promise.all([
    db.application.findMany({ where: { userId: user.id, status: { in: ["QUEUED", "PREPARING", "READY_TO_SUBMIT", "SUBMITTING", "RETRY_ELIGIBLE"] } }, include, orderBy: { updatedAt: "desc" } }),
    db.application.findMany({ where: { userId: user.id, status: "MANUAL_ACTION_REQUIRED" }, include, orderBy: { updatedAt: "desc" } }),
    db.application.findMany({ where: { userId: user.id, status: "SUBMISSION_UNCONFIRMED" }, include, orderBy: { updatedAt: "desc" } }),
  ]);
  const sections = [
    { title: "Needs your action", desc: "Unsupported application flows, unanswered questions, or declarations only you can make. Documents are prepared — open each to finish.", icon: Hand, items: manual },
    { title: "Unconfirmed submissions", desc: "A request was sent but the provider's response did not prove receipt. These are never re-sent until verified.", icon: HelpCircle, items: unconfirmed },
    { title: "In progress", desc: "Being verified, tailored, prepared, or submitted by the background agent.", icon: Loader, items: inProgress },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <AutoRefresh ms={5000} />
      <PageHeader title="Application Queue" description="Everything between “found” and “confirmed”." />
      {inProgress.length + manual.length + unconfirmed.length === 0 && (
        <EmptyState icon={<ListChecks />} title="Queue is empty">Apply from Find Jobs, or start the Auto-Apply Agent.</EmptyState>
      )}
      {sections
        .filter((s) => s.items.length)
        .map((s) => (
          <Card key={s.title}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <s.icon className="size-4" /> {s.title} ({s.items.length})
              </CardTitle>
              <CardDescription>{s.desc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {s.items.map((a) => (
                <ApplicationRow key={a.id} a={a} />
              ))}
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
