import { describe, expect, it } from "vitest";
import { greenhouseQuestionsToFields, buildGreenhouseForm } from "@/lib/apply/adapters/greenhouse";
import { mapFormFields, unresolved } from "@/lib/apply/form";
import { chooseAdapter } from "@/lib/apply/registry";
import { profile } from "./helpers/fixtures";

// Real question shapes from boards-api.greenhouse.io (?questions=true).
const QUESTIONS = [
  { label: "First Name", required: true, fields: [{ name: "first_name", type: "input_text", values: [] }] },
  { label: "Last Name", required: true, fields: [{ name: "last_name", type: "input_text", values: [] }] },
  { label: "Email", required: true, fields: [{ name: "email", type: "input_text", values: [] }] },
  { label: "Phone", required: true, fields: [{ name: "phone", type: "input_text", values: [] }] },
  { label: "Resume/CV", required: false, fields: [{ name: "resume", type: "input_file", values: [] }, { name: "resume_text", type: "textarea", values: [] }] },
  { label: "LinkedIn Profile", required: false, fields: [{ name: "question_1", type: "input_text", values: [] }] },
  { label: "Are you currently based in any of these countries?", required: true, fields: [{ name: "question_2", type: "multi_value_single_select", values: [{ label: "United States", value: 11 }, { label: "India", value: 12 }, { label: "Other", value: 13 }] }] },
  { label: "Will you require Visa Sponsorship now, or in the future?", required: true, fields: [{ name: "question_3", type: "multi_value_single_select", values: [{ label: "Yes", value: 1 }, { label: "No", value: 0 }] }] },
  { label: "What is your gender?", required: false, fields: [{ name: "question_4", type: "multi_value_single_select", values: [{ label: "Female", value: 1 }] }] },
  { label: "Are you able to work from our London office 3 days a week?", required: true, fields: [{ name: "question_5", type: "multi_value_single_select", values: [{ label: "Yes", value: 1 }, { label: "No", value: 0 }] }] },
  { label: "I certify that the information provided is true and complete", required: true, fields: [{ name: "question_6", type: "multi_value_single_select", values: [{ label: "Yes", value: 1 }] }] },
];

const ctx = (jobCountries: string[], extra: Partial<Parameters<typeof mapFormFields>[1]> = {}) => ({
  profile: profile(),
  jobCountries,
  jobTitle: "Frontend Engineer",
  company: "Vercel",
  hasResume: true,
  hasCoverLetter: true,
  userAnswers: {},
  ...extra,
});

describe("application form mapping", () => {
  const fields = greenhouseQuestionsToFields(QUESTIONS);

  it("converts Greenhouse questions to neutral fields", () => {
    expect(fields.find((f) => f.key === "resume")).toMatchObject({ type: "file", alternatives: ["resume_text"] });
    expect(fields.find((f) => f.key === "question_3")?.options).toEqual([{ label: "Yes", value: "1" }, { label: "No", value: "0" }]);
  });

  it("fills identity fields and declared answers from the verified profile", () => {
    const a = mapFormFields(fields, ctx(["IN"]));
    const v = (k: string) => a.find((x) => x.key === k)!;
    expect(v("first_name").value).toBe("Priya");
    expect(v("last_name").value).toBe("Sharma");
    expect(v("question_1").value).toBe("https://linkedin.com/in/priyasharma");
    expect(v("question_2")).toMatchObject({ value: "12", source: "PROFILE" }); // India option
    expect(v("question_3")).toMatchObject({ value: "0", source: "PROFILE", sensitive: true }); // no sponsorship in IN
  });

  it("never answers demographic questions; optional ones are left blank", () => {
    const g = mapFormFields(fields, ctx(["IN"])).find((x) => x.key === "question_4")!;
    expect(g).toMatchObject({ value: null, sensitive: true, requiresUserInput: false });
  });

  it("pauses for legal declarations and unconfigured questions", () => {
    const pending = unresolved(mapFormFields(fields, ctx(["IN"]))).map((x) => x.key);
    expect(pending).toEqual(expect.arrayContaining(["question_5", "question_6"]));
  });

  it("pauses when sponsorship is undeclared for the job's country", () => {
    const s = mapFormFields(fields, ctx(["US"])).find((x) => x.key === "question_3")!;
    expect(s).toMatchObject({ value: null, requiresUserInput: true, sensitive: true });
  });

  it("uses user-provided answers and the answer bank", () => {
    const withUser = mapFormFields(fields, ctx(["IN"], { userAnswers: { question_5: "1", question_6: "1" } }));
    expect(unresolved(withUser)).toHaveLength(0);
    const bank = mapFormFields(fields, ctx(["IN"], { profile: profile({ answerBank: [{ key: "a", question: "Able to work from the London office 3 days a week?", answer: "Yes" }] }) }));
    expect(bank.find((x) => x.key === "question_5")).toMatchObject({ value: "1", source: "ANSWER_BANK" });
  });

  it("builds the Greenhouse multipart body with files and skips blank/document placeholders", async () => {
    const answers = mapFormFields(fields, ctx(["IN"], { userAnswers: { question_5: "1", question_6: "1" } }));
    const fd = buildGreenhouseForm({
      job: { id: "j", title: "t", company: "c", jobUrl: "", applyUrl: null, applicationMethod: "GREENHOUSE", atsBoardToken: "b", atsJobId: "1", isMock: false, sourceKey: "greenhouse" },
      answers,
      resume: { filename: "r.pdf", data: Buffer.from("%PDF-1.4 test"), text: "" },
      coverLetter: null,
      idempotencyKey: "k",
      ctx: { userId: "u", profile: profile(), credential: "x" },
    });
    expect(fd.get("first_name")).toBe("Priya");
    expect(fd.get("question_4")).toBeNull();
    expect((fd.get("resume") as File).name).toBe("r.pdf");
    expect(fd.get("resume_text")).toBeNull();
  });
});

describe("adapter selection (capability-aware)", () => {
  const gh = { id: "j", title: "t", company: "c", jobUrl: "", applyUrl: null, applicationMethod: "GREENHOUSE", atsBoardToken: "acme", atsJobId: "1", isMock: false, sourceKey: "greenhouse" };
  it("sandbox mode always routes to the test ATS", () => expect(chooseAdapter(gh, "SANDBOX", false).adapter?.key).toBe("sandbox"));
  it("live Greenhouse needs an employer key; otherwise a manual task", () => {
    expect(chooseAdapter(gh, "LIVE", true).adapter?.key).toBe("greenhouse-api");
    const manual = chooseAdapter(gh, "LIVE", false);
    expect(manual.adapter).toBeNull();
    expect(manual.reason).toMatch(/CAPTCHA/);
  });
  it("mock jobs never go live", () => expect(chooseAdapter({ ...gh, isMock: true }, "LIVE", true).adapter?.key).toBe("sandbox"));
  it("aggregator listings are manual in live mode", () => expect(chooseAdapter({ ...gh, applicationMethod: "EXTERNAL_URL", sourceKey: "adzuna" }, "LIVE", false).adapter).toBeNull());
});
