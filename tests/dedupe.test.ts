import { describe, expect, it } from "vitest";
import { buildJob, canonicalizeUrl, dedupeBatch, dedupeKey } from "@/lib/jobs/normalize";

const make = (o: Partial<Parameters<typeof buildJob>[0]>) =>
  buildJob({ sourceKey: "greenhouse", externalId: "1", title: "Senior Frontend Engineer", company: "Acme Inc.", descriptionText: "React", locationText: "London, United Kingdom", jobUrl: "https://acme.com/jobs/1", ...o });

describe("deduplication", () => {
  it("canonicalizes URLs by dropping tracking params, fragments and trailing slashes", () => {
    expect(canonicalizeUrl("https://Jobs.Example.com/x/?utm_source=a&gh_src=b&id=3#apply")).toBe("https://jobs.example.com/x/?id=3");
  });

  it("same employer + normalized title + location ⇒ same key across sources", () => {
    const a = make({});
    const b = make({ sourceKey: "adzuna", externalId: "zz", title: "Sr. Frontend Engineer (m/f/d)", company: "ACME Ltd", jobUrl: "https://adzuna.example/zz" });
    expect(dedupeKey(a)).toBe(dedupeKey(b));
  });

  it("different locations are different vacancies", () => {
    expect(dedupeKey(make({}))).not.toBe(dedupeKey(make({ locationText: "Berlin, Germany" })));
  });

  it("dedupeBatch removes repeats by id, URL and identity, keeping the richest record", () => {
    const rich = make({ descriptionText: "React ".repeat(200) });
    const poorDup = make({ sourceKey: "adzuna", externalId: "zz", jobUrl: "https://adzuna.example/zz", descriptionText: "React" });
    const sameId = make({});
    const sameUrl = make({ sourceKey: "lever", externalId: "q", jobUrl: "https://acme.com/jobs/1/?utm_source=x" });
    const other = make({ title: "Backend Engineer", externalId: "2", jobUrl: "https://acme.com/jobs/2" });
    const out = dedupeBatch([poorDup, rich, sameId, sameUrl, other]);
    expect(out).toHaveLength(2);
    expect(out.find((j) => j.title.includes("Frontend"))!.description.length).toBeGreaterThan(500);
  });
});
