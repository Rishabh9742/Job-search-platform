"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ActionButton, api } from "@/components/client";

export function DeleteAccountButton() {
  return (
    <ActionButton url="/api/account" method="DELETE" variant="destructive" confirmText="This cannot be undone." onDone={() => (window.location.href = "/")}>
      Delete everything
    </ActionButton>
  );
}
import { Button, Input, Label, Select } from "@/components/ui";

export function SourceToggle({ sourceKey, enabled, disabled }: { sourceKey: string; enabled: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={enabled}
        disabled={busy || disabled}
        onChange={async (e) => {
          setBusy(true);
          await api(`/api/sources/${sourceKey}`, { method: "PATCH", json: { enabled: e.target.checked } }).catch(() => undefined);
          setBusy(false);
          router.refresh();
        }}
      />
      {enabled ? "Enabled" : "Disabled"}
    </label>
  );
}

export function BoardsEditor({ sourceKey, boards, defaults }: { sourceKey: string; boards: string[]; defaults: string[] }) {
  const router = useRouter();
  const [value, setValue] = React.useState(boards.join(", "));
  const [state, setState] = React.useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Input aria-label={`${sourceKey} board tokens`} placeholder={`Default: ${defaults.join(", ")}`} value={value} onChange={(e) => setValue(e.target.value)} className="h-8 text-xs" />
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            setState("saving");
            try {
              await api(`/api/sources/${sourceKey}`, { method: "PATCH", json: { boards: value.split(",").map((s) => s.trim()).filter(Boolean) } });
              setState("Saved");
              router.refresh();
            } catch (e) {
              setState((e as Error).message);
            }
          }}
        >
          Save
        </Button>
      </div>
      {state && state !== "saving" && <span className="text-xs text-muted-foreground">{state}</span>}
    </div>
  );
}

export function CredentialForm() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  return (
    <form
      className="grid gap-3 sm:grid-cols-[140px_1fr_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        setMsg(null);
        try {
          await api("/api/credentials", { method: "POST", json: Object.fromEntries(new FormData(form)) });
          form.reset();
          setMsg("Saved (encrypted).");
          router.refresh();
        } catch (err) {
          setMsg((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="provider">ATS</Label>
        <Select id="provider" name="provider">
          <option value="GREENHOUSE">Greenhouse</option>
          <option value="LEVER">Lever</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="boardToken">Board token / site</Label>
        <Input id="boardToken" name="boardToken" required placeholder="e.g. acme" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="secret">Employer-issued API key</Label>
        <Input id="secret" name="secret" type="password" required autoComplete="off" />
      </div>
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}Save
      </Button>
      {msg && <p className="text-xs text-muted-foreground sm:col-span-4">{msg}</p>}
    </form>
  );
}
