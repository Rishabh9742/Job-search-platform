import Link from "next/link";
import { Download, FileText, RefreshCw, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { ActionButton, AutoRefresh } from "@/components/client";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { ResumeUpload } from "./upload";
import { ProfileEditor, type EditableProfile } from "./profile-editor";

export default async function ResumeStudio() {
  const user = await requireUser();
  const [resumes, profile, versions] = await Promise.all([
    db.masterResume.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.userProfile.findUnique({ where: { userId: user.id } }),
    db.resumeVersion.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30, include: { job: { select: { title: true, company: true } } } }),
  ]);
  const parsing = resumes.some((r) => r.parseStatus === "PENDING" || r.parseStatus === "PARSING");
  const active = resumes.find((r) => r.isActive);

  return (
    <div className="mx-auto max-w-5xl">
      {parsing && <AutoRefresh ms={3000} />}
      <PageHeader title="Resume Studio" description="Your master resume, verified profile, and every tailored version generated for a job." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ResumeUpload />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Master resumes</CardTitle>
            <CardDescription>Originals are preserved unchanged.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {resumes.length === 0 && <p className="text-sm text-muted-foreground">None uploaded yet.</p>}
            {resumes.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium" title={r.fileName}>
                    {r.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(r.createdAt)} · {r.parseStatus.toLowerCase()}
                    {r.parser && ` (${r.parser === "ai" ? "AI" : "rule-based"})`}
                    {r.isActive && " · active"}
                  </p>
                  {r.parseError && <p className="text-xs text-destructive">{r.parseError}</p>}
                </div>
                <a href={`/api/resume/${r.id}`} aria-label="Download original" className="text-muted-foreground hover:text-foreground">
                  <Download className="size-4" />
                </a>
                <ActionButton url={`/api/resume/${r.id}`} variant="ghost" size="icon" aria-label="Re-parse">
                  <RefreshCw />
                </ActionButton>
                <ActionButton url={`/api/resume/${r.id}`} method="DELETE" variant="ghost" size="icon" aria-label="Delete" confirmText="Deletes the stored file permanently.">
                  <Trash2 />
                </ActionButton>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Verified profile</h2>
        {parsing && <Alert tone="info" title="Parsing your resume…">This runs in the background — the page will update automatically. Make sure the worker is running (npm run worker).</Alert>}
        {!profile && !parsing && <EmptyState icon={<FileText />} title="No profile yet">Upload a resume to extract your profile.</EmptyState>}
        {profile && (
          <ProfileEditor
            key={profile.updatedAt.toISOString()}
            initial={{
              ...(profile as unknown as EditableProfile),
              verifiedAt: profile.verifiedAt?.toISOString() ?? null,
            }}
          />
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Tailored versions</h2>
        {versions.length === 0 ? (
          <EmptyState icon={<FileText />} title="No tailored resumes yet">They are generated per job when you apply or the agent prepares an application.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Job</th>
                  <th className="p-3">Generated</th>
                  <th className="p-3">Generator</th>
                  <th className="p-3">Fact-check</th>
                  <th className="p-3">Files</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => {
                  const issues = ((v.consistencyReport as { issues?: unknown[] } | null)?.issues ?? []).length;
                  return (
                    <tr key={v.id} className="border-t">
                      <td className="p-3">{v.job ? `${v.job.title} — ${v.job.company}` : "—"}</td>
                      <td className="p-3">{fmtDate(v.createdAt, true)}</td>
                      <td className="p-3">{v.generator}</td>
                      <td className="p-3">{issues ? <Badge tone="warning">{issues} AI edit(s) reverted</Badge> : <Badge tone="success">Clean</Badge>}</td>
                      <td className="space-x-3 p-3">
                        <Link className="text-primary hover:underline" href={`/api/versions/${v.id}?format=pdf`}>
                          PDF
                        </Link>
                        <Link className="text-primary hover:underline" href={`/api/versions/${v.id}?format=docx`}>
                          DOCX
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {active && <p className="mt-2 text-xs text-muted-foreground">Active master: {active.fileName}</p>}
      </section>
    </div>
  );
}
