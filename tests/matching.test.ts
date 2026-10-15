import { describe, expect, it } from "vitest";
import { jobSkillSets, matchJob } from "@/lib/matching/match";
import { extractSkills } from "@/lib/taxonomy/skills";
import { countriesInText } from "@/lib/taxonomy/countries";
import { job, prefs, profile } from "./helpers/fixtures";

describe("eligibility rules (hard)", () => {
  it("a well-matched job in a declared country is eligible and auto-apply eligible", () => {
    const r = matchJob(job(), profile(), prefs());
    expect(r.eligible).toBe(true);
    expect(r.autoApplyEligible).toBe(true);
    expect(r.reasons.included.join(" ")).toMatch(/work authorization in India/);
  });

  it("excludes titles outside selected categories", () => {
    const r = matchJob(job({ title: "Account Executive" }), profile(), prefs());
    expect(r.eligible).toBe(false);
    expect(r.reasons.excluded[0]).toMatch(/outside your selected categories/);
  });

  it("excludes countries the user did not select", () => {
    const r = matchJob(job({ countries: ["US"] }), profile(), prefs());
    expect(r.eligible).toBe(false);
  });

  it("excludes when the employer won't sponsor and the user needs sponsorship", () => {
    const r = matchJob(job({ countries: ["GB"], description: job().description + "\nWe are unable to offer visa sponsorship." }), profile(), prefs());
    expect(r.eligible).toBe(false);
    expect(r.reasons.excluded.join()).toMatch(/does not sponsor/);
  });

  it("blocks auto-apply (but keeps eligible) when sponsorship policy is unknown", () => {
    const r = matchJob(job({ countries: ["GB"] }), profile(), prefs());
    expect(r.eligible).toBe(true);
    expect(r.autoApplyEligible).toBe(false);
    expect(r.blockers.join()).toMatch(/require sponsorship/);
  });

  it("blocks auto-apply when work authorization for the country is undeclared", () => {
    const r = matchJob(job(), profile({ workAuthorizations: [] }), prefs());
    expect(r.autoApplyEligible).toBe(false);
    expect(r.blockers.join()).toMatch(/not declared/);
  });

  it("blocks auto-apply when critical info (posting date, location) is missing", () => {
    expect(matchJob(job({ postedAt: null }), profile(), prefs()).blockers.join()).toMatch(/Publication date not provided/);
    expect(matchJob(job({ countries: [] }), profile(), prefs()).blockers.join()).toMatch(/location is not provided/);
  });

  it("excludes clearly unmet mandatory experience", () => {
    const r = matchJob(job({ description: "Requirements\n10+ years of experience with React" }), profile({ yearsExperience: 3 }), prefs());
    expect(r.eligible).toBe(false);
    expect(r.reasons.excluded.join()).toMatch(/10\+ years/);
  });

  it("applies excluded companies, keywords, industries, posting age, employment type and salary", () => {
    expect(matchJob(job(), profile(), prefs({ excludedCompanies: ["globex"] })).eligible).toBe(false);
    expect(matchJob(job(), profile(), prefs({ excludedKeywords: ["Redux"] })).eligible).toBe(false);
    expect(matchJob(job({ tags: ["Gambling"] }), profile(), prefs({ excludedIndustries: ["gambling"] })).eligible).toBe(false);
    expect(matchJob(job({ postedAt: new Date(Date.now() - 90 * 86400_000) }), profile(), prefs()).eligible).toBe(false);
    expect(matchJob(job({ employmentType: "CONTRACT" }), profile(), prefs()).eligible).toBe(false);
    expect(matchJob(job({ salaryMax: 900000, salaryCurrency: "INR", salaryPeriod: "YEAR" }), profile(), prefs({ salaryMin: 1500000, salaryCurrency: "INR" })).eligible).toBe(false);
  });

  it("remote roles restricted to other regions are excluded; worldwide remote is accepted", () => {
    expect(matchJob(job({ isRemote: true, workArrangement: "REMOTE", countries: ["US"], remoteRegions: [] }), profile(), prefs()).eligible).toBe(false);
    expect(matchJob(job({ isRemote: true, workArrangement: "REMOTE", countries: [], remoteRegions: ["WORLDWIDE"] }), profile(), prefs()).eligible).toBe(true);
    expect(matchJob(job({ isRemote: true, workArrangement: "REMOTE", countries: [], remoteRegions: ["APAC"] }), profile(), prefs()).eligible).toBe(true);
  });

  it("never auto-applies with an unverified profile", () => {
    expect(matchJob(job(), profile({ verified: false }), prefs()).autoApplyEligible).toBe(false);
  });
});

describe("match scoring", () => {
  it("is explainable: factors sum to the score and weights total 100", () => {
    const r = matchJob(job(), profile(), prefs());
    expect(r.breakdown.reduce((a, b) => a + b.weight, 0)).toBe(100);
    expect(r.breakdown.reduce((a, b) => a + b.points, 0)).toBe(r.score);
  });

  it("separates required from preferred skills and lists missing ones", () => {
    const sets = jobSkillSets(job().description);
    expect(sets.required).toEqual(expect.arrayContaining(["React", "TypeScript", "Redux", "Jest"]));
    expect(sets.preferred).toEqual(expect.arrayContaining(["GraphQL", "Next.js"]));
    const r = matchJob(job({ description: "Requirements\nReact, Kubernetes, Go" }), profile(), prefs());
    expect(r.missingSkills).toEqual(expect.arrayContaining(["Kubernetes"]));
  });

  it("scores a strong match higher than a weak one", () => {
    const strong = matchJob(job(), profile(), prefs()).score;
    const weak = matchJob(job({ description: "Requirements\nAngular, Java, Spring, Kubernetes, Terraform" }), profile(), prefs()).score;
    expect(strong).toBeGreaterThan(weak + 15);
  });

  it("below-threshold scores block auto-apply with a stated reason", () => {
    const r = matchJob(job(), profile(), prefs({ minMatchScore: 99 }));
    expect(r.autoApplyEligible).toBe(false);
    expect(r.reasons.excluded.join()).toMatch(/below your minimum/);
  });
});

describe("taxonomy", () => {
  it("does not treat English words as skills", () => {
    expect(extractSkills("We go the extra mile and rest well")).toEqual([]);
    expect(extractSkills("Backend in Go and Rust; REST APIs")).toEqual(expect.arrayContaining(["Go", "Rust", "REST APIs"]));
  });
  it("resolves countries from cities, names and US state suffixes", () => {
    expect(countriesInText("Bengaluru, Karnataka")).toEqual(["IN"]);
    expect(countriesInText("Austin, TX")).toEqual(["US"]);
    expect(countriesInText("Remote - US or Canada")).toEqual(expect.arrayContaining(["US", "CA"]));
    expect(countriesInText("Business focus")).toEqual([]);
  });
});
