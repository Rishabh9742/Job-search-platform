"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { Loader2, Moon, Sun } from "lucide-react";
import { Button, type ButtonProps } from "./ui";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      {mounted && resolvedTheme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

export async function api<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error([body.error, ...(body.issues ?? [])].filter(Boolean).join(" — ") || `Request failed (${res.status})`);
  return body as T;
}

/** Button that calls an API endpoint, shows a spinner, surfaces errors, and refreshes server data. */
export function ActionButton({
  url,
  method = "POST",
  json,
  confirmText,
  onDone,
  children,
  ...props
}: ButtonProps & { url: string; method?: string; json?: unknown; confirmText?: string; onDone?: (data: unknown) => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const run = async () => {
    if (confirmText && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      const data = await api(url, { method, json });
      onDone?.(data);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-2">
        <Button {...props} onClick={run} disabled={busy || props.disabled}>
          {busy && <Loader2 className="animate-spin" />}
          {confirming ? "Click again to confirm" : children}
        </Button>
        {confirming && (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        )}
      </span>
      {confirming && confirmText && <span className="text-xs text-muted-foreground">{confirmText}</span>}
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}

/** Re-renders server components on an interval (live progress without websockets). */
export function AutoRefresh({ ms = 5000 }: { ms?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, ms);
    return () => clearInterval(t);
  }, [ms, router]);
  return null;
}
