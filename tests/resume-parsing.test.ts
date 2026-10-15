import { describe, expect, it } from "vitest";
import { Document, Packer, Paragraph } from "docx";
import { parseResumeHeuristic, guardAgainstFabrication, splitSections } from "@/lib/resume/parse";
import { detectResumeType, extractResumeText } from "@/lib/resume/extract-text";
import { computeYearsExperience } from "@/lib/profile/schema";
import { renderLetterPdf } from "@/lib/documents/render";
import { RESUME_TEXT } from "./helpers/fixtures";

describe("resume parsing (rule-based)", () => {
  const parsed = parseResumeHeuristic(RESUME_TEXT);

  it("extracts contact details", () => {
    expect(parsed.fullName).toBe("Priya Sharma");
    expect(parsed.email).toBe("priya.sharma@example.com");
    expect(parsed.phone).toContain("98765");
    expect(parsed.links.map((l) => l.label)).toEqual(expect.arrayContaining(["LinkedIn", "GitHub"]));
  });

  it("splits sections and extracts skills", () => {
    expect(Object.keys(splitSections(RESUME_TEXT))).toEqual(expect.arrayContaining(["summary", "experience", "education", "skills", "projects", "certifications"]));
    expect(parsed.skills).toEqual(expect.arrayContaining(["React", "TypeScript", "Redux", "Figma"]));
  });

  it("extracts dated experience with bullets", () => {
    expect(parsed.experience).toHaveLength(2);
    expect(parsed.experience[0]).toMatchObject({ title: "Frontend Engineer", company: "Acme Fintech", startDate: "Jan 2021", current: true });
    expect(parsed.experience[0].bullets[1]).toContain("40%");
    expect(parsed.experience[1].company).toBe("Bright Agency");
  });

  it("marks structured sections as uncertain for user verification", () => {
    expect(parsed.uncertainFields).toEqual(expect.arrayContaining(["experience", "education"]));
  });

  it("computes years of experience from dated roles (merging overlaps)", () => {
    const y = computeYearsExperience(parsed.experience, new Date("2026-01-01"));
    expect(y).toBeGreaterThan(6);
    expect(y).toBeLessThan(7);
  });

  it("guard drops skills not present in the resume and flags invented employers", () => {
    const guarded = guardAgainstFabrication(
      { ...parsed, skills: [...parsed.skills, "Kubernetes"], experience: [{ ...parsed.experience[0], company: "Google" }] },
      RESUME_TEXT,
    );
    expect(guarded.skills).not.toContain("Kubernetes");
    expect(guarded.uncertainFields).toContain("experience.0.company");
  });
});

describe("resume file extraction", () => {
  it("detects file types by magic bytes, not extension", async () => {
    expect(detectResumeType(Buffer.from("%PDF-1.7 ..."))).toBe("pdf");
    expect(detectResumeType(Buffer.from("hello"))).toBeNull();
  });

  it("extracts text from a real PDF", async () => {
    const pdf = await renderLetterPdf("Priya Sharma\nReact developer", "t");
    expect(await extractResumeText(pdf)).toContain("Priya Sharma");
  });

  it("extracts text from a real DOCX", async () => {
    const doc = new Document({ sections: [{ children: [new Paragraph("Priya Sharma"), new Paragraph("SKILLS"), new Paragraph("React, TypeScript")] }] });
    const buf = await Packer.toBuffer(doc);
    expect(detectResumeType(buf)).toBe("docx");
    const text = await extractResumeText(buf);
    expect(text).toContain("React, TypeScript");
  });
});
