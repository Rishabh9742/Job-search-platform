import { Check, Minus, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { aiEnabled, env } from "@/lib/env";
import { providerStatuses } from "@/lib/jobs/registry";
import { DEFAULT_GREENHOUSE_BOARDS } from "@/lib/jobs/providers/greenhouse";
import { DEFAULT_LEVER_SITES } from "@/lib/jobs/providers/lever";
import { DEFAULT_ASHBY_BOARDS } from "@/lib/jobs/providers/ashby";
import { ADAPTERS, UNSUPPORTED } from "@/lib/apply/registry";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { timeAgo } from "@/lib/utils";
import { ActionButton } from "@/components/client";
import { PreferencesForm } from "@/components/preferences-form";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from "@/components/ui";
import { BoardsEditor, CredentialForm, DeleteAccountButton, SourceToggle } from "./settings-client";

const DEFAULT_BOARDS: Record<string, string[]> = { greenhouse: DEFAULT_GREENHOUSE_BOARDS, lever: DEFAULT_LEVER_SITES, ashby: DEFAULT_ASHBY_BOARDS };
const Yes = ({ v }: { v: boolean }) => (v ? <Check className="size-4 text-success" aria-label="yes" /> : <Minus className="size-4 text-muted-foreground" aria-label="no" />);

export default async function SettingsPage() {
  const user = await requireUser();
  const [prefs, sources, creds] = await Promise.all([db.jobPreferences.findUnique({ where: { userId: user.id } }), providerStatuses(), db.providerCredential.findMany({ where: { userId: user.id } })]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader title="Settings" description="Search preferences, job sources, integrations, and your data." />

      <Card>
        <CardHeader>
          <CardTitle>Job search preferences</CardTitle>
          <CardDescription>Used for discovery and matching. Auto-apply limits live on the Auto-Apply Agent page.</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm section="search" initial={{ ...DEFAULT_PREFERENCES, ...(prefs ?? {}) } as typeof DEFAULT_PREFERENCES} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job sources</CardTitle>
          <CardDescription>Each source is an independent adapter. Coverage differs — no source covers every country.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sources.map((s) => (
            <div key={s.key} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  {s.isMock && <Badge tone="warning">Mock</Badge>}
                  {!s.configured && <Badge tone="muted">Needs {s.credentialsRequired.join(" + ")}</Badge>}
                  {s.lastStatus === "error" && <Badge tone="destructive">Last fetch failed</Badge>}
                  {s.lastStatus === "rate_limited" && <Badge tone="warning">Rate limited</Badge>}
                </div>
                <SourceToggle sourceKey={s.key} enabled={s.enabled} disabled={!s.configured} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{s.coverage}</p>
              <p className="mt-1 text-xs text-muted-foreground">Terms: {s.termsNote}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Last fetched {timeAgo(s.lastFetchedAt)}
                {s.lastJobCount != null && ` · ${s.lastJobCount} listings`}
                {s.lastError && ` · ${s.lastError}`}
              </p>
              {DEFAULT_BOARDS[s.key] && (
                <div className="mt-2">
                  <BoardsEditor sourceKey={s.key} boards={s.config.boards ?? []} defaults={DEFAULT_BOARDS[s.key]} />
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Application integrations — capability registry</CardTitle>
          <CardDescription>What each integration can actually do, and how it was verified.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Integration</th>
                <th className="px-2">Form</th>
                <th className="px-2">Uploads</th>
                <th className="px-2">Submit</th>
                <th className="px-2">Confirm</th>
                <th className="px-2">Status</th>
                <th className="py-2 pl-3">Verification & requirements</th>
              </tr>
            </thead>
            <tbody>
              {[...ADAPTERS, ...UNSUPPORTED].map((a) => (
                <tr key={a.key} className="border-t align-top">
                  <td className="py-2 pr-3 font-medium">{a.label}</td>
                  <td className="px-2 py-2"><Yes v={a.capabilities.applicationFormRetrieval} /></td>
                  <td className="px-2 py-2"><Yes v={a.capabilities.documentUploads} /></td>
                  <td className="px-2 py-2"><Yes v={a.capabilities.applicationSubmission} /></td>
                  <td className="px-2 py-2"><Yes v={a.capabilities.confirmationRetrieval} /></td>
                  <td className="px-2 py-2"><Yes v={a.capabilities.statusUpdates} /></td>
                  <td className="py-2 pl-3 text-xs text-muted-foreground">
                    {a.capabilities.verification}
                    <br />
                    <span className="text-foreground/80">Requires: {a.capabilities.requirements}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employer API credentials</CardTitle>
          <CardDescription>
            Greenhouse and Lever only accept programmatic applications with a key issued by the employer for their own board (e.g. a partner or campus-recruiting arrangement). Keys are encrypted at rest and never shown again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CredentialForm />
          {creds.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span>
                {c.provider} · <code>{c.boardToken}</code> · added {timeAgo(c.createdAt)}
              </span>
              <ActionButton url={`/api/credentials?id=${c.id}`} method="DELETE" variant="ghost" size="icon" aria-label="Delete credential">
                <Trash2 />
              </ActionButton>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI provider</CardTitle>
        </CardHeader>
        <CardContent>
          {aiEnabled() ? (
            <Alert tone="success" title={`Anthropic · ${env().AI_MODEL}`}>Resume parsing, tailoring, and cover letters use AI; every AI output passes a factual-consistency check against your verified profile.</Alert>
          ) : (
            <Alert tone="warning" title="AI not configured — using rule-based mode">Set AI_PROVIDER=anthropic and ANTHROPIC_API_KEY in .env for AI parsing and writing. Rule-based mode still parses, matches, and tailors (by reordering verified content only).</Alert>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Delete account and data</CardTitle>
          <CardDescription>Permanently deletes your resumes, generated documents, profile, applications, and history. Applications already sent to employers cannot be recalled.</CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountButton />
        </CardContent>
      </Card>
    </div>
  );
}
