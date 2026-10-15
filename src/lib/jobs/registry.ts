import { db } from "@/lib/db";
import type { JobProvider, ProviderConfig } from "./types";
import { greenhouseProvider } from "./providers/greenhouse";
import { leverProvider } from "./providers/lever";
import { ashbyProvider } from "./providers/ashby";
import { remotiveProvider } from "./providers/remotive";
import { arbeitnowProvider } from "./providers/arbeitnow";
import { adzunaProvider } from "./providers/adzuna";
import { usajobsProvider } from "./providers/usajobs";
import { mockProvider } from "./providers/mock";

export const PROVIDERS: JobProvider[] = [greenhouseProvider, leverProvider, ashbyProvider, arbeitnowProvider, adzunaProvider, usajobsProvider, remotiveProvider, mockProvider];

export const providerByKey = (key: string) => PROVIDERS.find((p) => p.key === key);

/** Ensure a JobSource row exists for every provider (enabled flag defaults from the adapter). */
export async function syncJobSources() {
  for (const p of PROVIDERS) {
    await db.jobSource.upsert({
      where: { key: p.key },
      create: { key: p.key, name: p.name, enabled: p.defaultEnabled, minIntervalMinutes: p.minIntervalMinutes },
      update: { name: p.name },
    });
  }
}

export interface ProviderStatus {
  key: string;
  name: string;
  coverage: string;
  termsNote: string;
  credentialsRequired: string[];
  configured: boolean;
  enabled: boolean;
  isMock: boolean;
  config: ProviderConfig;
  lastFetchedAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  lastJobCount: number | null;
}

export async function providerStatuses(): Promise<ProviderStatus[]> {
  await syncJobSources();
  const rows = await db.jobSource.findMany();
  return PROVIDERS.map((p) => {
    const row = rows.find((r) => r.key === p.key)!;
    return {
      key: p.key,
      name: p.name,
      coverage: p.coverage,
      termsNote: p.termsNote,
      credentialsRequired: p.credentialsRequired,
      configured: p.isConfigured(),
      enabled: row.enabled,
      isMock: !!p.isMock,
      config: (row.config ?? {}) as ProviderConfig,
      lastFetchedAt: row.lastFetchedAt,
      lastStatus: row.lastStatus,
      lastError: row.lastError,
      lastJobCount: row.lastJobCount,
    };
  });
}
