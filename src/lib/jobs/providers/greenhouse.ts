import { csv, env } from "@/lib/env";
import { fetchJson, fetchWithRetry } from "../http";
import { buildJob } from "../normalize";
import type { JobProvider, NormalizedJob } from "../types";

/** Publicly listed Greenhouse job boards used when no custom list is configured. */
export const DEFAULT_GREENHOUSE_BOARDS = ["stripe", "figma", "discord", "gitlab", "airbnb", "dropbox", "cloudflare", "databricks", "coinbase", "vercel"];

interface GhJob {
  id: number;
  title: string;
  company_name?: string;
  absolute_url: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string };
  offices?: { name?: string; location?: string | null }[];
  content?: string;
  metadata?: { name: string; value: unknown }[] | null;
}

export const GH_API = "https://boards-api.greenhouse.io/v1/boards";

export const greenhouseProvider: JobProvider = {
  key: "greenhouse",
  name: "Greenhouse job boards",
  coverage: "Employers that host public Greenhouse boards (configured board tokens). Global, employer-dependent.",
  credentialsRequired: [],
  termsNote: "Public Job Board API (read-only, no key). Application submission needs the employer's Job Board API key.",
  defaultEnabled: true,
  minIntervalMinutes: 60,
  isConfigured: () => true,
  async fetchJobs(_query, config) {
    const boards = config.boards?.length ? config.boards : [...DEFAULT_GREENHOUSE_BOARDS, ...csv(env().GREENHOUSE_BOARDS)];
    const out: NormalizedJob[] = [];
    for (const board of [...new Set(boards)]) {
      try {
        const data = await fetchJson<{ jobs: GhJob[] }>(`${GH_API}/${encodeURIComponent(board)}/jobs?content=true`, { provider: "greenhouse" });
        for (const j of data.jobs) out.push(mapGreenhouseJob(board, j));
      } catch (err) {
        console.warn(`[greenhouse] board ${board} failed: ${(err as Error).message}`);
      }
    }
    return out;
  },
  async checkAvailability(job) {
    if (!job.atsBoardToken || !job.atsJobId) return "UNKNOWN";
    const res = await fetchWithRetry(`${GH_API}/${encodeURIComponent(job.atsBoardToken)}/jobs/${encodeURIComponent(job.atsJobId)}`, { provider: "greenhouse" });
    if (res.status === 404) return "CLOSED";
    return res.ok ? "ACTIVE" : "UNKNOWN";
  },
};

export function mapGreenhouseJob(board: string, j: GhJob): NormalizedJob {
  const officeLocs = (j.offices ?? []).map((o) => o.location || o.name || "").filter(Boolean);
  const meta = (j.metadata ?? []).map((m) => `${m.name}: ${typeof m.value === "string" ? m.value : JSON.stringify(m.value)}`).join(" ");
  return buildJob({
    sourceKey: "greenhouse",
    externalId: `${board}:${j.id}`,
    title: j.title,
    company: j.company_name || board,
    descriptionHtml: j.content,
    locationText: j.location?.name ?? null,
    extraLocationTexts: officeLocs,
    arrangementHint: `${j.location?.name ?? ""} ${meta}`,
    employmentTypeRaw: /employment type: ([a-z -]+)/i.exec(meta)?.[1] ?? null,
    postedAt: j.first_published ? new Date(j.first_published) : j.updated_at ? new Date(j.updated_at) : null,
    jobUrl: j.absolute_url,
    applyUrl: j.absolute_url,
    applicationMethod: "GREENHOUSE",
    atsBoardToken: board,
    atsJobId: String(j.id),
  });
}
