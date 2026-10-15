"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { api } from "@/components/client";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";

export interface PendingQuestion {
  key: string;
  label: string;
  type: string;
  required: boolean;
  sensitive: boolean;
  options: { label: string; value: string }[] | null;
  reason?: string | null;
}

export function PendingAnswersForm({ applicationId, questions }: { applicationId: string; questions: PendingQuestion[] }) {
  const router = useRouter();
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [save, setSave] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api(`/api/applications/${applicationId}/answers`, { method: "POST", json: { answers: values, saveToBank: save } });
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {questions.map((q) => (
        <div key={q.key} className="space-y-1.5 rounded-md border p-3">
          <Label htmlFor={q.key}>
            {q.label} {q.required && <span className="text-destructive">*</span>}
          </Label>
          {q.sensitive && <p className="text-xs text-warning">Legal / sensitive question — answer exactly as you would yourself. The agent never answers these for you.</p>}
          {q.options?.length ? (
            q.type === "multiselect" ? (
              <div className="space-y-1">
                {q.options.map((o) => {
                  const cur = (values[q.key] ?? "").split("|").filter(Boolean);
                  return (
                    <label key={o.value} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={cur.includes(o.value)} onChange={(e) => setValues((v) => ({ ...v, [q.key]: (e.target.checked ? [...cur, o.value] : cur.filter((x) => x !== o.value)).join("|") }))} />
                      {o.label}
                    </label>
                  );
                })}
              </div>
            ) : (
              <Select id={q.key} required={q.required} value={values[q.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))}>
                <option value="">Select…</option>
                {q.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )
          ) : q.type === "textarea" ? (
            <Textarea id={q.key} required={q.required} value={values[q.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))} />
          ) : (
            <Input id={q.key} required={q.required} value={values[q.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))} />
          )}
          {!q.sensitive && !q.options?.length && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={save.includes(q.key)} onChange={(e) => setSave((s) => (e.target.checked ? [...s, q.key] : s.filter((k) => k !== q.key)))} />
              Save to my answer bank for similar questions
            </label>
          )}
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Send />}Save answers & continue
      </Button>
    </form>
  );
}

export function OutcomeSelect({ applicationId, value }: { applicationId: string; value: string }) {
  const router = useRouter();
  return (
    <Select
      aria-label="Outcome"
      defaultValue={value}
      onChange={async (e) => {
        await api(`/api/applications/${applicationId}/outcome`, { method: "POST", json: { outcome: e.target.value } });
        router.refresh();
      }}
    >
      <option value="NONE">No update</option>
      <option value="INTERVIEW">Interview invitation</option>
      <option value="OFFER">Offer</option>
      <option value="REJECTED">Rejected</option>
      <option value="WITHDRAWN">Withdrawn</option>
    </Select>
  );
}
