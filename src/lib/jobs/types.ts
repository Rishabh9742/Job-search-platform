import type { ApplicationMethod, WorkArrangement } from "@prisma/client";

export interface NormalizedJob {
  sourceKey: string;
  externalId: string;
  title: string;
  company: string;
  /** Plain-text description. */
  description: string;
  locationText: string | null;
  countries: string[];
  remoteRegions: string[];
  isRemote: boolean;
  workArrangement: WorkArrangement;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  /** Salary exactly as the source stated it, when it was free text. */
  salaryText: string | null;
  employmentType: string | null;
  experienceLevel: string | null;
  tags: string[];
  /** null when the source does not provide a publication/update date. */
  postedAt: Date | null;
  jobUrl: string;
  applyUrl: string | null;
  applicationMethod: ApplicationMethod;
  atsBoardToken: string | null;
  atsJobId: string | null;
  isMock: boolean;
  raw?: unknown;
}

export interface DiscoveryQuery {
  /** Search keywords derived from the user's categories and custom roles. */
  searchTerms: string[];
  /** ISO alpha-2 codes; empty = no country restriction. */
  countries: string[];
  includeRemote: boolean;
  maxPostingAgeDays: number | null;
}

export interface ProviderCapabilities {
  jobDiscovery: boolean;
  availabilityCheck: boolean;
  applicationFormRetrieval: boolean;
  documentUpload: boolean;
  applicationSubmission: boolean;
  confirmationRetrieval: boolean;
  statusUpdates: boolean;
}

export interface JobProvider {
  key: string;
  name: string;
  /** Who/what the source covers. Shown in settings — never assume global coverage. */
  coverage: string;
  credentialsRequired: string[];
  termsNote: string;
  defaultEnabled: boolean;
  minIntervalMinutes: number;
  isMock?: boolean;
  isConfigured(): boolean;
  fetchJobs(query: DiscoveryQuery, config: ProviderConfig): Promise<NormalizedJob[]>;
  /** Returns ACTIVE/CLOSED, or UNKNOWN when the source cannot tell. */
  checkAvailability?(job: { externalId: string; atsBoardToken: string | null; atsJobId: string | null; jobUrl: string }): Promise<"ACTIVE" | "CLOSED" | "UNKNOWN">;
}

export interface ProviderConfig {
  boards?: string[];
}
