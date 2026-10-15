"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { api } from "@/components/client";
import { Button, Input, Label, Select } from "@/components/ui";
import { CATEGORIES } from "@/lib/taxonomy/categories";
import { COUNTRIES } from "@/lib/taxonomy/countries";
import type { DEFAULT_PREFERENCES } from "@/lib/preferences";

type Prefs = typeof DEFAULT_PREFERENCES;

function Chips({ options, value, onChange, label }: { options: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <button
              type="button"
              key={o.id}
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** Search preferences ("search") or autonomous-agent rules ("rules"). Saves only its own fields. */
export function PreferencesForm({ initial, section }: { initial: Prefs; section: "search" | "rules" }) {
  const router = useRouter();
  const [p, setP] = React.useState<Prefs>(initial);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setP((x) => ({ ...x, [k]: v }));

  const SEARCH_KEYS: (keyof Prefs)[] = ["categories", "customRoles", "keywords", "excludedKeywords", "countries", "includeWorldwideRemote", "workArrangements", "employmentTypes", "experienceLevels", "salaryMin", "salaryCurrency", "maxPostingAgeDays"];
  const RULE_KEYS: (keyof Prefs)[] = ["autoApplyEnabled", "submissionMode", "minMatchScore", "maxApplicationsPerDay", "maxApplicationsPerEmployer", "excludedCompanies", "excludedIndustries", "requireCoverLetter", "discoveryIntervalMinutes"];

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const keys = section === "search" ? SEARCH_KEYS : RULE_KEYS;
      await api("/api/preferences", { method: "PUT", json: Object.fromEntries(keys.map((k) => [k, p[k]])) });
      setMsg({ ok: true, text: "Saved" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {section === "search" ? (
        <>
          <Chips label="Job categories" options={CATEGORIES.map((c) => ({ id: c.id, label: c.label }))} value={p.categories} onChange={(v) => set("categories", v)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="customRoles">Other roles (comma-separated)</Label>
              <Input id="customRoles" placeholder="e.g. Salesforce Developer, Solutions Engineer" defaultValue={p.customRoles.join(", ")} onBlur={(e) => set("customRoles", csv(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="keywords">Title keywords (comma-separated)</Label>
              <Input id="keywords" placeholder="e.g. TypeScript, fintech" defaultValue={p.keywords.join(", ")} onBlur={(e) => set("keywords", csv(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="excludedKeywords">Exclude listings mentioning</Label>
              <Input id="excludedKeywords" placeholder="e.g. clearance, unpaid" defaultValue={p.excludedKeywords.join(", ")} onBlur={(e) => set("excludedKeywords", csv(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="age">Max posting age (days)</Label>
              <Input id="age" type="number" min={1} max={365} value={p.maxPostingAgeDays ?? ""} onChange={(e) => set("maxPostingAgeDays", e.target.value ? Number(e.target.value) : null)} />
            </div>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Countries (on-site/hybrid, and country-restricted remote)</legend>
            <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto rounded-md border p-3 sm:grid-cols-3 lg:grid-cols-4">
              {COUNTRIES.map((c) => (
                <label key={c.code} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={p.countries.includes(c.code)} onChange={(e) => set("countries", e.target.checked ? [...p.countries, c.code] : p.countries.filter((x) => x !== c.code))} />
                  {c.name}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Leave empty to accept any country. Locations come from the job source — never guessed.</p>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={p.includeWorldwideRemote} onChange={(e) => set("includeWorldwideRemote", e.target.checked)} />
            Include worldwide-remote roles
          </label>
          <Chips label="Work arrangement" options={[{ id: "REMOTE", label: "Remote" }, { id: "HYBRID", label: "Hybrid" }, { id: "ONSITE", label: "On-site" }]} value={p.workArrangements} onChange={(v) => set("workArrangements", v)} />
          <Chips
            label="Employment type"
            options={[
              { id: "FULL_TIME", label: "Full-time" },
              { id: "PART_TIME", label: "Part-time" },
              { id: "CONTRACT", label: "Contract" },
              { id: "INTERNSHIP", label: "Internship" },
              { id: "GRADUATE", label: "Graduate" },
            ]}
            value={p.employmentTypes}
            onChange={(v) => set("employmentTypes", v)}
          />
          <Chips
            label="Experience level (empty = any)"
            options={[
              { id: "ENTRY", label: "Entry" },
              { id: "JUNIOR", label: "Junior" },
              { id: "MID", label: "Mid" },
              { id: "SENIOR", label: "Senior" },
              { id: "LEAD", label: "Lead" },
            ]}
            value={p.experienceLevels}
            onChange={(v) => set("experienceLevels", v)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="salaryMin">Minimum annual salary</Label>
              <Input id="salaryMin" type="number" min={0} value={p.salaryMin ?? ""} onChange={(e) => set("salaryMin", e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="salaryCurrency">Currency</Label>
              <Select id="salaryCurrency" value={p.salaryCurrency ?? ""} onChange={(e) => set("salaryCurrency", e.target.value || null)}>
                <option value="">Any</option>
                {[...new Set(COUNTRIES.map((c) => c.currency))].sort().map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">Only compared against listings that state a salary in the same currency.</p>
            </div>
          </div>
        </>
      ) : (
        <>
          <label className="flex items-start gap-3 rounded-md border p-3">
            <input type="checkbox" className="mt-1" checked={p.autoApplyEnabled} onChange={(e) => set("autoApplyEnabled", e.target.checked)} />
            <span>
              <span className="font-medium">Enable automatic applications</span>
              <span className="block text-sm text-muted-foreground">When the agent is running, eligible jobs are prepared and submitted without per-job approval — only through supported integrations, within these limits.</span>
            </span>
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Submission mode</legend>
            {(
              [
                ["SANDBOX", "Sandbox (test)", "Real listings, but submissions go to the built-in test ATS. Nothing reaches employers."],
                ["LIVE", "Live", "Submit to employers through authorized integrations (requires employer API credentials). Unsupported jobs become manual tasks."],
              ] as const
            ).map(([v, label, hint]) => (
              <label key={v} className="flex items-start gap-3 rounded-md border p-3">
                <input type="radio" name="mode" className="mt-1" checked={p.submissionMode === v} onChange={() => set("submissionMode", v)} />
                <span>
                  <span className="font-medium">{label}</span>
                  <span className="block text-sm text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="minScore">Minimum match score</Label>
              <Input id="minScore" type="number" min={0} max={100} value={p.minMatchScore} onChange={(e) => set("minMatchScore", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="perDay">Max applications / day</Label>
              <Input id="perDay" type="number" min={0} max={200} value={p.maxApplicationsPerDay} onChange={(e) => set("maxApplicationsPerDay", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="perEmployer">Max per employer</Label>
              <Input id="perEmployer" type="number" min={1} max={50} value={p.maxApplicationsPerEmployer} onChange={(e) => set("maxApplicationsPerEmployer", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="interval">Search every (minutes)</Label>
              <Input id="interval" type="number" min={30} max={10080} value={p.discoveryIntervalMinutes} onChange={(e) => set("discoveryIntervalMinutes", Number(e.target.value))} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exCompanies">Excluded companies (comma-separated)</Label>
              <Input id="exCompanies" defaultValue={p.excludedCompanies.join(", ")} onBlur={(e) => set("excludedCompanies", csv(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exIndustries">Excluded industries (comma-separated)</Label>
              <Input id="exIndustries" placeholder="e.g. gambling, defense" defaultValue={p.excludedIndustries.join(", ")} onBlur={(e) => set("excludedIndustries", csv(e.target.value))} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={p.requireCoverLetter} onChange={(e) => set("requireCoverLetter", e.target.checked)} />
            Always include a cover letter
          </label>
        </>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Save />}Save
        </Button>
        {msg && (
          <span role="status" className={`text-sm ${msg.ok ? "text-success" : "text-destructive"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </form>
  );
}
