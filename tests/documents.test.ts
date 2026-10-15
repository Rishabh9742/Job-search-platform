import { describe, expect, it } from "vitest";
import { applyAiTailoring, tailorDeterministic, tailorResume } from "@/lib/documents/tailor";
import { checkText } from "@/lib/documents/consistency";
import { coverLetterTemplate, generateCoverLetter } from "@/lib/documents/cover-letter";
import { renderResumeDocx, renderResumePdf } from "@/lib/documents/render";
import { extractResumeText } from "@/lib/resume/extract-text";
import { profile } from "./helpers/fixtures";

const REACT_JOB = { title: "React Developer", company: "Globex", description: "Requirements\nReact, TypeScript, Redux, Jest. Build accessible UI.", tags: [] };
const BA_JOB = { title: "Business Analyst", company: "Initech", description: "Requirements\nStakeholder management, requirements gathering, SQL, Jira, Figma wireframes.", tags: [] };

describe("resume factual consistency", () => {
  it("flags invented numbers and skills", () => {
    expect(checkText("Improved conversion by 75% using Kubernetes", "Improved conversion", ["React"])).toHaveLength(2);
    expect(checkText("Reduced bundle size by 40% with Vite", "Reduced bundle size by 40% with code splitting and Vite", ["React"])).toEqual([]);
  });

  it("reverts AI bullets that add metrics or skills, removes invented skills, and keeps employers/dates from the profile", () => {
    const p = profile();
    const base = tailorDeterministic(p, REACT_JOB);
    const res = applyAiTailoring(p, base, {
      summary: "Frontend engineer with 12 years of Kubernetes experience.",
      skillOrder: ["Redux", "React", "Kubernetes"],
      experience: [
        {
          index: 0,
          bullets: [
            { sourceBulletIndex: 0, text: "Built a React/TypeScript design system adopted by 6 product teams" },
            { sourceBulletIndex: 1, text: "Cut bundle size by 70% using Webpack" },
          ],
        },
      ],
      projectIndexes: [0],
    });
    expect(res.resume.summary).toBe(base.summary); // reverted
    expect(res.resume.skills).not.toContain("Kubernetes");
    expect(res.resume.skills.slice(0, 2)).toEqual(["Redux", "React"]);
    expect(res.resume.experience[0].bullets[0]).toBe("Built a React/TypeScript design system adopted by 6 product teams");
    expect(res.resume.experience[0].bullets[1]).toBe(p.experience[0].bullets[1]); // reverted to source
    expect(res.resume.experience[0]).toMatchObject({ company: "Acme Fintech", startDate: "Jan 2021" });
    expect(res.issues.map((i) => i.location)).toEqual(expect.arrayContaining(["summary", "skills", "experience.0.bullets.1"]));
  });

  it("produces different versions for a React vs a Business Analyst vacancy from the same master profile", async () => {
    const p = profile({ skills: [...profile().skills, "SQL", "Jira", "Stakeholder Management", "Requirements Gathering"] });
    const a = (await tailorResume(p, REACT_JOB)).resume;
    const b = (await tailorResume(p, BA_JOB)).resume;
    expect(a.skills[0]).not.toBe(b.skills[0]);
    expect(a.summary).not.toBe(b.summary);
    expect(a.keywordsMatched).toEqual(expect.arrayContaining(["React", "Redux"]));
    expect(b.keywordsMatched).toEqual(expect.arrayContaining(["SQL", "Jira"]));
    // never adds skills
    for (const s of [...a.skills, ...b.skills]) expect(p.skills).toContain(s);
  });

  it("cover letter (rule-based) only contains verified facts", async () => {
    const p = profile();
    const resume = tailorDeterministic(p, REACT_JOB);
    const letter = coverLetterTemplate(p, REACT_JOB, resume);
    expect(letter).toContain("Dear Globex Hiring Team");
    expect(checkText(letter, JSON.stringify(p) + REACT_JOB.title + REACT_JOB.company, p.skills)).toEqual([]);
    expect((await generateCoverLetter(p, REACT_JOB, resume)).generator).toBe("rule-based");
  });
});

describe("document generation", () => {
  it("renders an ATS-readable PDF whose text round-trips", async () => {
    const pdf = await renderResumePdf(tailorDeterministic(profile(), REACT_JOB));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const text = await extractResumeText(pdf);
    expect(text).toContain("Priya Sharma");
    expect(text).toContain("Acme Fintech");
    expect(text).toMatch(/EXPERIENCE/);
  });

  it("renders a valid DOCX", async () => {
    const docx = await renderResumeDocx(tailorDeterministic(profile(), REACT_JOB));
    expect(docx[0]).toBe(0x50);
    expect(await extractResumeText(docx)).toContain("Visvesvaraya Technological University");
  });
});
