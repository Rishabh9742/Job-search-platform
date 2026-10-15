"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "@/components/client";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Select, Textarea } from "@/components/ui";
import type { AnswerBankEntry, Certification, Education, Experience, Link, Project, WorkAuthorization } from "@/lib/profile/schema";
import { COUNTRIES } from "@/lib/taxonomy/countries";

export interface EditableProfile {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  countryCode: string | null;
  headline: string | null;
  summary: string | null;
  links: Link[];
  skills: string[];
  experience: Experience[];
  education: Education[];
  projects: Project[];
  certifications: Certification[];
  achievements: string[];
  languages: string[];
  yearsExperience: number | null;
  workAuthorizations: WorkAuthorization[];
  salaryExpectation: string | null;
  availability: string | null;
  answerBank: AnswerBankEntry[];
  uncertainFields: string[];
  verifiedAt: string | null;
}

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const csv = (s: string) => s.split(",").map((l) => l.trim()).filter(Boolean);

export function ProfileEditor({ initial }: { initial: EditableProfile }) {
  const router = useRouter();
  const [p, setP] = React.useState(initial);
  const [busy, setBusy] = React.useState<"save" | "verify" | null>(null);
  const [msg, setMsg] = React.useState<{ tone: "success" | "destructive"; text: string } | null>(null);
  const set = <K extends keyof EditableProfile>(k: K, v: EditableProfile[K]) => setP((x) => ({ ...x, [k]: v }));

  const uncertain = (path: string) => p.uncertainFields.some((f) => f === path || f.startsWith(`${path}.`));
  const confirm = (path: string) => set("uncertainFields", p.uncertainFields.filter((f) => !(f === path || f.startsWith(`${path}.`))));
  const Flag = ({ path }: { path: string }) =>
    uncertain(path) ? (
      <span className="inline-flex items-center gap-1">
        <Badge tone="warning">
          <AlertTriangle className="size-3" /> Please check
        </Badge>
        <Button type="button" size="sm" variant="ghost" onClick={() => confirm(path)}>
          <Check /> Looks right
        </Button>
      </span>
    ) : null;

  async function save(markVerified: boolean) {
    setBusy(markVerified ? "verify" : "save");
    setMsg(null);
    try {
      const { verifiedAt: _v, ...rest } = p;
      await api("/api/profile", { method: "PUT", json: { ...rest, markVerified } });
      setMsg({ tone: "success", text: markVerified ? "Profile verified. The agent can now use it in applications." : "Saved. Remember to verify before auto-applying." });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "destructive", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const updateList = <T,>(key: "experience" | "education" | "projects" | "certifications" | "links" | "workAuthorizations" | "answerBank", i: number, patch: Partial<T>) =>
    setP((x) => ({ ...x, [key]: (x[key] as T[]).map((item, idx) => (idx === i ? { ...item, ...patch } : item)) }));
  const removeAt = (key: "experience" | "education" | "projects" | "certifications" | "links" | "workAuthorizations" | "answerBank", i: number) =>
    setP((x) => ({ ...x, [key]: (x[key] as unknown[]).filter((_, idx) => idx !== i) }));

  return (
    <div className="space-y-6">
      {p.uncertainFields.length > 0 ? (
        <Alert tone="warning" title={`${p.uncertainFields.length} field(s) need your review`}>
          Highlighted fields were ambiguous in your resume. Correct them or click “Looks right”. Nothing uncertain is used in an application.
        </Alert>
      ) : p.verifiedAt ? (
        <Alert tone="success" title="Profile verified">
          Last verified {new Date(p.verifiedAt).toLocaleString()}. Editing and saving will require re-verification.
        </Alert>
      ) : (
        <Alert tone="info" title="Not verified yet">Review everything below, then click “Verify profile”.</Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Contact & basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["fullName", "Full name"],
              ["email", "Email"],
              ["phone", "Phone"],
              ["location", "Location (city, country)"],
              ["headline", "Headline"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={k}>
                {label} <Flag path={k} />
              </Label>
              <Input id={k} value={p[k] ?? ""} onChange={(e) => set(k, e.target.value || null)} className={uncertain(k) ? "border-warning" : ""} />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="country">
              Country of residence <Flag path="countryCode" />
            </Label>
            <Select id="country" value={p.countryCode ?? ""} onChange={(e) => set("countryCode", e.target.value || null)} className={uncertain("countryCode") ? "border-warning" : ""}>
              <option value="">Select…</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="years">
              Years of professional experience <Flag path="yearsExperience" />
            </Label>
            <Input id="years" type="number" min={0} max={60} step={0.5} value={p.yearsExperience ?? ""} onChange={(e) => set("yearsExperience", e.target.value === "" ? null : Number(e.target.value))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="summary">
              Professional summary <Flag path="summary" />
            </Label>
            <Textarea id="summary" value={p.summary ?? ""} onChange={(e) => set("summary", e.target.value || null)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="skills">
              Skills (comma-separated) <Flag path="skills" />
            </Label>
            <Textarea id="skills" defaultValue={p.skills.join(", ")} onBlur={(e) => set("skills", csv(e.target.value))} />
            <p className="text-xs text-muted-foreground">Only list skills you genuinely have — tailored resumes never add skills beyond this list.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="languages">
              Languages (comma-separated) <Flag path="languages" />
            </Label>
            <Input id="languages" defaultValue={p.languages.join(", ")} onBlur={(e) => set("languages", csv(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>
            Experience <Flag path="experience" />
          </CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => set("experience", [...p.experience, { title: "", company: "", startDate: "", endDate: "", current: false, location: "", bullets: [] }])}>
            <Plus /> Add role
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {p.experience.length === 0 && <p className="text-sm text-muted-foreground">No roles extracted.</p>}
          {p.experience.map((e, i) => (
            <div key={i} className={`space-y-3 rounded-md border p-3 ${uncertain(`experience.${i}`) ? "border-warning" : ""}`}>
              <div className="flex items-center justify-between">
                <Flag path={`experience.${i}`} />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeAt("experience", i)} aria-label="Remove role">
                  <Trash2 />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input aria-label="Title" placeholder="Title" value={e.title} onChange={(ev) => updateList<Experience>("experience", i, { title: ev.target.value })} />
                <Input aria-label="Company" placeholder="Company" value={e.company} onChange={(ev) => updateList<Experience>("experience", i, { company: ev.target.value })} />
                <Input aria-label="Start date" placeholder="Start (e.g. Jan 2021)" value={e.startDate ?? ""} onChange={(ev) => updateList<Experience>("experience", i, { startDate: ev.target.value })} />
                <Input aria-label="End date" placeholder="End (or Present)" value={e.endDate ?? ""} onChange={(ev) => updateList<Experience>("experience", i, { endDate: ev.target.value, current: /present/i.test(ev.target.value) })} />
              </div>
              <Textarea aria-label="Bullet points" rows={4} placeholder="One achievement/responsibility per line" defaultValue={e.bullets.join("\n")} onBlur={(ev) => updateList<Experience>("experience", i, { bullets: lines(ev.target.value) })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>
            Education <Flag path="education" />
          </CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => set("education", [...p.education, { institution: "", degree: "", field: "", startDate: "", endDate: "", grade: "" }])}>
            <Plus /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {p.education.map((e, i) => (
            <div key={i} className={`grid gap-3 rounded-md border p-3 sm:grid-cols-3 ${uncertain(`education.${i}`) ? "border-warning" : ""}`}>
              <Input aria-label="Institution" placeholder="Institution" value={e.institution} onChange={(ev) => updateList<Education>("education", i, { institution: ev.target.value })} />
              <Input aria-label="Degree" placeholder="Degree" value={e.degree ?? ""} onChange={(ev) => updateList<Education>("education", i, { degree: ev.target.value })} />
              <Input aria-label="Field" placeholder="Field of study" value={e.field ?? ""} onChange={(ev) => updateList<Education>("education", i, { field: ev.target.value })} />
              <Input aria-label="Start" placeholder="Start" value={e.startDate ?? ""} onChange={(ev) => updateList<Education>("education", i, { startDate: ev.target.value })} />
              <Input aria-label="End" placeholder="End" value={e.endDate ?? ""} onChange={(ev) => updateList<Education>("education", i, { endDate: ev.target.value })} />
              <div className="flex gap-2">
                <Input aria-label="Grade" placeholder="Grade" value={e.grade ?? ""} onChange={(ev) => updateList<Education>("education", i, { grade: ev.target.value })} />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeAt("education", i)} aria-label="Remove education">
                  <Trash2 />
                </Button>
              </div>
              <div className="sm:col-span-3">
                <Flag path={`education.${i}`} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>
            Projects <Flag path="projects" />
          </CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => set("projects", [...p.projects, { name: "", description: "", technologies: [], url: "", bullets: [] }])}>
            <Plus /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {p.projects.map((x, i) => (
            <div key={i} className="space-y-2 rounded-md border p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <Input aria-label="Project name" placeholder="Name" value={x.name} onChange={(ev) => updateList<Project>("projects", i, { name: ev.target.value })} />
                <Input aria-label="Technologies" placeholder="Technologies (comma-separated)" defaultValue={x.technologies.join(", ")} onBlur={(ev) => updateList<Project>("projects", i, { technologies: csv(ev.target.value) })} />
                <div className="flex gap-2">
                  <Input aria-label="URL" placeholder="URL" value={x.url ?? ""} onChange={(ev) => updateList<Project>("projects", i, { url: ev.target.value })} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeAt("projects", i)} aria-label="Remove project">
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <Textarea aria-label="Project details" rows={3} placeholder="Details, one per line" defaultValue={[x.description, ...x.bullets].filter(Boolean).join("\n")} onBlur={(ev) => updateList<Project>("projects", i, { description: null, bullets: lines(ev.target.value) })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Certifications, achievements & links</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="certs">
              Certifications (one per line) <Flag path="certifications" />
            </Label>
            <Textarea id="certs" defaultValue={p.certifications.map((c) => c.name).join("\n")} onBlur={(e) => set("certifications", lines(e.target.value).map((name) => ({ name, issuer: null, date: null })))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ach">
              Achievements (one per line) <Flag path="achievements" />
            </Label>
            <Textarea id="ach" defaultValue={p.achievements.join("\n")} onBlur={(e) => set("achievements", lines(e.target.value))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="links">
              Links — portfolio, LinkedIn, GitHub (one URL per line) <Flag path="links" />
            </Label>
            <Textarea
              id="links"
              defaultValue={p.links.map((l) => l.url).join("\n")}
              onBlur={(e) => set("links", lines(e.target.value).map((url) => ({ url, label: /linkedin/i.test(url) ? "LinkedIn" : /github/i.test(url) ? "GitHub" : "Website" })))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" /> Work authorization & declarations
            </CardTitle>
            <CardDescription>Only you can declare these. Jobs in countries without a declaration are never auto-submitted, and the agent never guesses an answer.</CardDescription>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => set("workAuthorizations", [...p.workAuthorizations, { countryCode: p.countryCode ?? "US", authorized: false, requiresSponsorship: true }])}>
            <Plus /> Add country
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {p.workAuthorizations.map((w, i) => (
            <div key={i} className="flex flex-wrap items-center gap-4 rounded-md border p-3">
              <Select aria-label="Country" className="w-48" value={w.countryCode} onChange={(e) => updateList<WorkAuthorization>("workAuthorizations", i, { countryCode: e.target.value })}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={w.authorized} onChange={(e) => updateList<WorkAuthorization>("workAuthorizations", i, { authorized: e.target.checked })} />I am legally authorized to work here
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={w.requiresSponsorship} onChange={(e) => updateList<WorkAuthorization>("workAuthorizations", i, { requiresSponsorship: e.target.checked })} />I require visa sponsorship
              </label>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeAt("workAuthorizations", i)} aria-label="Remove declaration">
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="salary">Salary expectation (used verbatim in forms)</Label>
              <Input id="salary" placeholder="e.g. INR 18–22 LPA or negotiable" value={p.salaryExpectation ?? ""} onChange={(e) => set("salaryExpectation", e.target.value || null)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avail">Availability / notice period</Label>
              <Input id="avail" placeholder="e.g. 30 days notice" value={p.availability ?? ""} onChange={(e) => set("availability", e.target.value || null)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>Answer bank</CardTitle>
            <CardDescription>Your saved answers to recurring application questions. Reused only when a question closely matches.</CardDescription>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => set("answerBank", [...p.answerBank, { key: crypto.randomUUID(), question: "", answer: "" }])}>
            <Plus /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {p.answerBank.map((a, i) => (
            <div key={a.key} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]">
              <Input aria-label="Question" placeholder="Question" value={a.question} onChange={(e) => updateList<AnswerBankEntry>("answerBank", i, { question: e.target.value })} />
              <Input aria-label="Answer" placeholder="Answer" value={a.answer} onChange={(e) => updateList<AnswerBankEntry>("answerBank", i, { answer: e.target.value })} />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeAt("answerBank", i)} aria-label="Remove answer">
                <Trash2 />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background/95 py-3 backdrop-blur">
        <Button variant="outline" onClick={() => save(false)} disabled={!!busy}>
          {busy === "save" && <Loader2 className="animate-spin" />}Save draft
        </Button>
        <Button onClick={() => save(true)} disabled={!!busy || p.uncertainFields.length > 0}>
          {busy === "verify" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Verify profile
        </Button>
        {msg && (
          <span role="status" className={`text-sm ${msg.tone === "success" ? "text-success" : "text-destructive"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
