import { afterEach, describe, expect, it, vi } from "vitest";
import { greenhouseProvider, mapGreenhouseJob } from "@/lib/jobs/providers/greenhouse";
import { mapLeverPosting } from "@/lib/jobs/providers/lever";
import { mapAshbyJob } from "@/lib/jobs/providers/ashby";
import { mapRemotiveJob } from "@/lib/jobs/providers/remotive";
import { mapArbeitnowJob } from "@/lib/jobs/providers/arbeitnow";
import { mapAdzunaJob } from "@/lib/jobs/providers/adzuna";
import { mapUsaJob } from "@/lib/jobs/providers/usajobs";
import { RateLimitError } from "@/lib/jobs/http";
import { htmlToText, parseSalaryText } from "@/lib/jobs/normalize";

// Shapes captured from the live APIs (trimmed).
const GH = {
  id: 6136160004,
  title: "Senior Frontend Engineer",
  company_name: "Vercel",
  absolute_url: "https://job-boards.greenhouse.io/vercel/jobs/6136160004",
  first_published: "2026-08-06T12:50:10-04:00",
  updated_at: "2026-09-24T13:34:54-04:00",
  location: { name: "Hybrid - London" },
  offices: [{ name: "Office - London", location: "London, England, United Kingdom" }],
  content: "&lt;p&gt;We use &lt;strong&gt;React&lt;/strong&gt; &amp;amp; TypeScript.&lt;/p&gt;",
};

describe("job provider adapters", () => {
  afterEach(() => vi.restoreAllMocks());

  it("Greenhouse: decodes double-escaped HTML, resolves location, keeps ATS ids", () => {
    const j = mapGreenhouseJob("vercel", GH);
    expect(j.description).toBe("We use React & TypeScript.");
    expect(j.countries).toEqual(["GB"]);
    expect(j.workArrangement).toBe("HYBRID");
    expect(j.applicationMethod).toBe("GREENHOUSE");
    expect(j).toMatchObject({ atsBoardToken: "vercel", atsJobId: "6136160004", externalId: "vercel:6136160004" });
    expect(j.postedAt?.toISOString()).toBe("2026-08-06T16:50:10.000Z");
    expect(j.experienceLevel).toBe("SENIOR");
  });

  it("Greenhouse: fetchJobs calls the public boards API per board and survives a failing board", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/broken/")) return new Response("nope", { status: 404 });
      return new Response(JSON.stringify({ jobs: [GH] }), { status: 200 });
    });
    const jobs = await greenhouseProvider.fetchJobs({ searchTerms: [], countries: [], includeRemote: true, maxPostingAgeDays: null }, { boards: ["vercel", "broken"] });
    expect(jobs).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://boards-api.greenhouse.io/v1/boards/vercel/jobs?content=true");
  });

  it("Greenhouse: availability check maps 404 to CLOSED", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    expect(await greenhouseProvider.checkAvailability!({ externalId: "x", atsBoardToken: "vercel", atsJobId: "1", jobUrl: "" })).toBe("CLOSED");
  });

  it("surfaces 429 as a typed rate-limit error with retry-after", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 429, headers: { "retry-after": "120" } }));
    const { fetchJson } = await import("@/lib/jobs/http");
    await expect(fetchJson("https://api.example.com/x", { provider: "x" })).rejects.toMatchObject({ retryAfterSeconds: 120 });
    await expect(fetchJson("https://api.example.com/x", { provider: "x" })).rejects.toBeInstanceOf(RateLimitError);
  });

  it("Lever: uses explicit country code, workplace type and commitment", () => {
    const j = mapLeverPosting("spotify", {
      id: "223f",
      text: "Frontend Engineer",
      hostedUrl: "https://jobs.lever.co/spotify/223f",
      applyUrl: "https://jobs.lever.co/spotify/223f/apply",
      createdAt: 1791566108174,
      country: "MX",
      workplaceType: "hybrid",
      categories: { commitment: "Permanent", location: "Mexico City", allLocations: ["Mexico City"] },
      descriptionPlain: "Build things with React.",
    });
    expect(j).toMatchObject({ countries: ["MX"], workArrangement: "HYBRID", employmentType: "FULL_TIME", applicationMethod: "LEVER", atsJobId: "223f" });
  });

  it("Ashby: maps remote + region and keeps compensation as stated text", () => {
    const j = mapAshbyJob("linear", {
      id: "d3bc",
      title: "Senior Fullstack Engineer",
      location: "Europe",
      isRemote: true,
      workplaceType: "Remote",
      employmentType: "FullTime",
      publishedAt: "2026-09-27T20:13:45.158+00:00",
      jobUrl: "https://jobs.ashbyhq.com/linear/d3bc",
      descriptionPlain: "TypeScript",
      address: { postalAddress: { addressCountry: "European Union" } },
      compensation: { compensationTierSummary: "€90K – €130K" },
    });
    expect(j.isRemote).toBe(true);
    expect(j.remoteRegions).toEqual(expect.arrayContaining(["EU", "EUROPE"]));
    expect(j.salaryText).toBe("€90K – €130K");
    expect(j.applicationMethod).toBe("ASHBY");
  });

  it("Remotive: worldwide remote; ambiguous salary text kept verbatim, not parsed", () => {
    const j = mapRemotiveJob({ id: 1, url: "https://remotive.com/remote-jobs/x-1", title: "React Developer", company_name: "Coalition", job_type: "full_time", publication_date: "2026-10-11T20:17:27", candidate_required_location: "Worldwide", salary: "$35,3k- $52k", description: "<p>React</p>" });
    expect(j.remoteRegions).toContain("WORLDWIDE");
    expect(j.salaryText).toBe("$35,3k- $52k");
    expect(j.salaryMin).toBeNull();
    expect(j.postedAt?.toISOString()).toBe("2026-10-11T20:17:27.000Z");
  });

  it("Arbeitnow: bare German city resolves to DE", () => {
    const j = mapArbeitnowJob({ slug: "s", company_name: "Stackfuel", title: "Frontend Dev (m/f/d)", description: "<p>x</p>", remote: false, url: "https://www.arbeitnow.com/jobs/s", tags: [], job_types: ["Full Time"], location: "Berlin", created_at: 1792032021 });
    expect(j.countries).toEqual(["DE"]);
    expect(j.workArrangement).toBe("ONSITE");
  });

  it("Adzuna: discards salaries Adzuna marks as predicted", () => {
    const base = { id: "1", title: "React Developer", description: "React", created: "2026-10-01T00:00:00Z", redirect_url: "https://adzuna.example/1", company: { display_name: "Acme" }, location: { display_name: "London" }, salary_min: 50000, salary_max: 60000 };
    expect(mapAdzunaJob("gb", { ...base, salary_is_predicted: "1" }).salaryMin).toBeNull();
    expect(mapAdzunaJob("gb", { ...base, salary_is_predicted: "0" })).toMatchObject({ salaryMin: 50000, salaryCurrency: "GBP", countries: ["GB"] });
  });

  it("USAJOBS: annual pay range in USD, US only", () => {
    const j = mapUsaJob({ MatchedObjectId: "9", MatchedObjectDescriptor: { PositionID: "X", PositionTitle: "IT Specialist", PositionURI: "https://www.usajobs.gov/job/9", PositionRemuneration: [{ MinimumRange: "80000", MaximumRange: "100000", RateIntervalCode: "PA" }], PublicationStartDate: "2026-10-01" } });
    expect(j).toMatchObject({ countries: ["US"], salaryMin: 80000, salaryMax: 100000, salaryCurrency: "USD", salaryPeriod: "YEAR" });
  });
});

describe("normalization helpers", () => {
  it("parses only unambiguous salary ranges and never guesses $ currency outside the US", () => {
    expect(parseSalaryText("£50,000 - £60,000 per year", ["GB"])).toMatchObject({ min: 50000, max: 60000, currency: "GBP" });
    expect(parseSalaryText("$120k-$150k", ["US"])).toMatchObject({ min: 120000, max: 150000, currency: "USD" });
    expect(parseSalaryText("$120k-$150k", [])).toMatchObject({ min: 120000, currency: null });
    expect(parseSalaryText("competitive", [])).toMatchObject({ min: null });
  });
  it("converts HTML lists to readable text", () => {
    expect(htmlToText("<ul><li>React</li><li>Node</li></ul>")).toBe("• React\n• Node");
  });
});
