import { z } from "zod";
import { CATEGORIES, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, WORK_ARRANGEMENTS } from "@/lib/taxonomy/categories";
import { COUNTRIES } from "@/lib/taxonomy/countries";

const list = (max = 50) => z.array(z.string().trim().min(1).max(120)).max(max);

export const PreferencesSchema = z
  .object({
    categories: z.array(z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]])),
    customRoles: list(20),
    keywords: list(30),
    excludedKeywords: list(50),
    countries: z.array(z.enum(COUNTRIES.map((c) => c.code) as [string, ...string[]])),
    includeWorldwideRemote: z.boolean(),
    workArrangements: z.array(z.enum(WORK_ARRANGEMENTS)),
    employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)),
    experienceLevels: z.array(z.enum(EXPERIENCE_LEVELS)),
    salaryMin: z.number().int().min(0).nullable(),
    salaryCurrency: z.string().length(3).nullable(),
    minMatchScore: z.number().int().min(0).max(100),
    maxApplicationsPerDay: z.number().int().min(0).max(200),
    maxApplicationsPerEmployer: z.number().int().min(1).max(50),
    excludedCompanies: list(200),
    excludedIndustries: list(50),
    requireCoverLetter: z.boolean(),
    maxPostingAgeDays: z.number().int().min(1).max(365).nullable(),
    autoApplyEnabled: z.boolean(),
    submissionMode: z.enum(["SANDBOX", "LIVE"]),
    discoveryIntervalMinutes: z.number().int().min(30).max(10080),
  })
  .partial();

export type PreferencesInput = z.infer<typeof PreferencesSchema>;

export const DEFAULT_PREFERENCES = {
  categories: [] as string[],
  customRoles: [] as string[],
  keywords: [] as string[],
  excludedKeywords: [] as string[],
  countries: [] as string[],
  includeWorldwideRemote: true,
  workArrangements: ["REMOTE", "HYBRID", "ONSITE"],
  employmentTypes: ["FULL_TIME"],
  experienceLevels: [] as string[],
  salaryMin: null as number | null,
  salaryCurrency: null as string | null,
  minMatchScore: 60,
  maxApplicationsPerDay: 10,
  maxApplicationsPerEmployer: 2,
  excludedCompanies: [] as string[],
  excludedIndustries: [] as string[],
  requireCoverLetter: true,
  maxPostingAgeDays: 30 as number | null,
  autoApplyEnabled: false,
  submissionMode: "SANDBOX" as "SANDBOX" | "LIVE",
  discoveryIntervalMinutes: 360,
};
