import type { WorkArrangement } from "@prisma/client";
import { countriesInText, regionsInText, countryByCode } from "@/lib/taxonomy/countries";
import { inferExperienceLevel, normalizeEmploymentType } from "@/lib/taxonomy/categories";
import type { NormalizedJob } from "./types";

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", bull: "•", middot: "·", euro: "€", pound: "£",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Convert (possibly entity-escaped) HTML to readable plain text. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let s = html;
  if (/&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s); // Greenhouse double-encodes
  s = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\/\s*li\s*>/gi, "")
    .replace(/<\/\s*(p|div|h[1-6]|ul|ol|tr|section)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l, i, arr) => l || (arr[i - 1] ?? "") !== "")
    .join("\n")
    .trim();
}

export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,.]/g, " ")
    .replace(/\b(inc|llc|ltd|limited|gmbh|ag|corp|corporation|co|plc|sa|bv|pvt|private|technologies|technology)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\((m|f|w|d|x|all genders?)[/|,]?.*?\)/g, " ") // (m/f/d)
    .replace(/\bsr\.?\b/g, "senior")
    .replace(/\bjr\.?\b/g, "junior")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

export function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|gh_src|source|ref|lever-source|src)/i.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase();
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

/**
 * Cross-source identity: same employer + same normalized title + same primary
 * location bucket ⇒ same vacancy.
 */
export function dedupeKey(job: Pick<NormalizedJob, "company" | "title" | "countries" | "isRemote">): string {
  const loc = job.isRemote ? "remote" : [...job.countries].sort().join(",") || "unknown";
  return `${normalizeCompany(job.company)}|${normalizeTitle(job.title)}|${loc}`;
}

export function detectWorkArrangement(...texts: (string | null | undefined)[]): WorkArrangement {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  if (/\bhybrid\b/.test(t)) return "HYBRID";
  if (/\b(remote|work from home|wfh|distributed|anywhere)\b/.test(t)) return "REMOTE";
  if (/\b(on[\s-]?site|in[\s-]office|office[\s-]based)\b/.test(t)) return "ONSITE";
  return "UNKNOWN";
}

const CURRENCY_SYMBOLS: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "₹": "INR" };

/**
 * Parse a salary range only when the text is unambiguous. Returns null fields
 * otherwise (the raw text is kept separately). Never guesses currency for "$"
 * unless the job is US-located or the text says USD.
 */
export function parseSalaryText(text: string | null | undefined, countries: string[] = []): { min: number | null; max: number | null; currency: string | null; period: string | null } {
  const none = { min: null, max: null, currency: null, period: null };
  if (!text) return none;
  const t = text.replace(/\s+/g, " ");
  const num = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|K)?`;
  const re = new RegExp(String.raw`(USD|EUR|GBP|INR|CAD|AUD|SGD|NZD|\$|€|£|₹)\s?${num}\s*(?:-|–|to)\s*(?:USD|EUR|GBP|INR|CAD|AUD|SGD|NZD|\$|€|£|₹)?\s?${num}`);
  const m = t.match(re);
  if (!m) return none;
  const toNum = (v: string, k?: string) => {
    const n = Number(v.replace(/,/g, ""));
    return k ? n * 1000 : n;
  };
  const min = toNum(m[2], m[3]);
  const max = toNum(m[4], m[5]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return none;
  let currency: string | null = CURRENCY_SYMBOLS[m[1]] ?? m[1];
  if (m[1] === "$" && !(countries.length === 1 && countries[0] === "US") && !/usd/i.test(t)) currency = null;
  const period = /\b(per hour|\/hr|hourly|\/hour)\b/i.test(t) ? "HOUR" : /\b(per month|\/month|monthly)\b/i.test(t) ? "MONTH" : max > 1000 ? "YEAR" : null;
  return { min, max, currency, period };
}

export interface BuildJobInput {
  sourceKey: string;
  externalId: string;
  title: string;
  company: string;
  descriptionHtml?: string | null;
  descriptionText?: string | null;
  locationText?: string | null;
  extraLocationTexts?: string[];
  explicitCountries?: string[];
  remoteHint?: boolean | null;
  arrangementHint?: string | null;
  salary?: { min?: number | null; max?: number | null; currency?: string | null; period?: string | null; text?: string | null };
  employmentTypeRaw?: string | null;
  tags?: string[];
  postedAt?: Date | null;
  jobUrl: string;
  applyUrl?: string | null;
  applicationMethod?: NormalizedJob["applicationMethod"];
  atsBoardToken?: string | null;
  atsJobId?: string | null;
  isMock?: boolean;
  raw?: unknown;
}

export function buildJob(i: BuildJobInput): NormalizedJob {
  const description = i.descriptionText?.trim() || htmlToText(i.descriptionHtml);
  const locTexts = [i.locationText, ...(i.extraLocationTexts ?? [])].filter(Boolean) as string[];
  const allLoc = locTexts.join(" | ");
  const countries = new Set<string>((i.explicitCountries ?? []).filter((c) => countryByCode(c)).map((c) => c.toUpperCase()));
  for (const c of countriesInText(allLoc)) countries.add(c);
  const remoteRegions = regionsInText(allLoc);
  let arrangement = detectWorkArrangement(i.arrangementHint, allLoc);
  if (arrangement === "UNKNOWN" && i.remoteHint === true) arrangement = "REMOTE";
  if (arrangement === "UNKNOWN" && i.remoteHint === false) arrangement = "ONSITE";
  const isRemote = arrangement === "REMOTE";
  if (isRemote && remoteRegions.length === 0 && countries.size === 0 && /\b(worldwide|anywhere)\b/i.test(allLoc)) remoteRegions.push("WORLDWIDE");

  const salaryFromText = i.salary?.text && i.salary.min == null ? parseSalaryText(i.salary.text, [...countries]) : null;
  return {
    sourceKey: i.sourceKey,
    externalId: String(i.externalId),
    title: i.title.trim(),
    company: i.company.trim(),
    description,
    locationText: allLoc || null,
    countries: [...countries],
    remoteRegions,
    isRemote,
    workArrangement: arrangement,
    salaryMin: i.salary?.min ?? salaryFromText?.min ?? null,
    salaryMax: i.salary?.max ?? salaryFromText?.max ?? null,
    salaryCurrency: i.salary?.currency ?? salaryFromText?.currency ?? null,
    salaryPeriod: i.salary?.period ?? salaryFromText?.period ?? null,
    salaryText: i.salary?.text?.trim() || null,
    employmentType: normalizeEmploymentType(i.employmentTypeRaw),
    experienceLevel: inferExperienceLevel(i.title, description),
    tags: (i.tags ?? []).slice(0, 30),
    postedAt: i.postedAt && !Number.isNaN(i.postedAt.getTime()) ? i.postedAt : null,
    jobUrl: i.jobUrl,
    applyUrl: i.applyUrl ?? null,
    applicationMethod: i.applicationMethod ?? "EXTERNAL_URL",
    atsBoardToken: i.atsBoardToken ?? null,
    atsJobId: i.atsJobId ?? null,
    isMock: i.isMock ?? false,
    raw: i.raw,
  };
}

/** Drop in-batch duplicates (same source id, canonical URL, or dedupe key). Keeps the richest record. */
export function dedupeBatch(jobs: NormalizedJob[]): NormalizedJob[] {
  const score = (j: NormalizedJob) => j.description.length + (j.salaryMin ? 500 : 0) + (j.postedAt ? 200 : 0) + (j.applicationMethod === "GREENHOUSE" || j.applicationMethod === "LEVER" ? 1000 : 0);
  const byKey = new Map<string, NormalizedJob>();
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  for (const j of jobs) {
    const idKey = `${j.sourceKey}:${j.externalId}`;
    const url = canonicalizeUrl(j.jobUrl);
    if (seenIds.has(idKey) || seenUrls.has(url)) continue;
    seenIds.add(idKey);
    seenUrls.add(url);
    const k = dedupeKey(j);
    const existing = byKey.get(k);
    if (!existing || score(j) > score(existing)) byKey.set(k, j);
  }
  return [...byKey.values()];
}
