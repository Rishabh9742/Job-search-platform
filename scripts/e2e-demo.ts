/**
 * End-to-end demonstration against a running app + worker (npm run start, npm run worker).
 *
 *   npm run e2e
 *
 * Acts as a user over HTTP: register → upload a real DOCX resume → wait for
 * parsing → verify profile → set preferences (SANDBOX mode) → live discovery
 * → apply to a REAL listing → submission to the built-in sandbox ATS →
 * confirmation → duplicate check → autonomous agent run → pause/stop.
 *
 * No application is sent to any employer: SANDBOX mode routes every submission
 * to /api/sandbox/ats. Observations are read from the database.
 */
import { Document, Packer, Paragraph } from "docx";
import { db } from "../src/lib/db";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
let cookie = "";

async function call<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<{ status: number; body: T }> {
  const { json, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}

const log = (...a: unknown[]) => console.log(`[e2e ${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(label: string, fn: () => Promise<T | null | undefined | false>, timeoutMs = 180_000, every = 2000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v as T;
    await sleep(every);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

const TERMINAL = ["SUBMITTED_CONFIRMED", "SUBMISSION_UNCONFIRMED", "MANUAL_ACTION_REQUIRED", "FAILED", "CANCELLED", "RETRY_ELIGIBLE"];

async function resumeDocx(): Promise<Buffer> {
  const lines = [
    "Alex Rivera",
    "London, United Kingdom | alex.rivera.demo@example.com | +44 20 7946 0000",
    "github.com/alexrivera-demo",
    "",
    "SUMMARY",
    "Full-stack engineer focused on React, TypeScript and Node.js products.",
    "",
    "EXPERIENCE",
    "Senior Software Engineer | Northwind Payments",
    "Mar 2021 - Present",
    "• Led the migration of the merchant dashboard to React, TypeScript and Next.js",
    "• Built Node.js and PostgreSQL services handling 2 million API requests per day",
    "• Introduced Jest and Playwright test suites and GitHub Actions CI/CD",
    "Software Engineer, Contoso Labs",
    "Jul 2017 - Feb 2021",
    "• Developed REST APIs with Node.js and Express on AWS",
    "• Built internal tools with React and Redux",
    "",
    "EDUCATION",
    "BSc Computer Science",
    "University of Manchester",
    "2014 - 2017",
    "",
    "SKILLS",
    "JavaScript, TypeScript, React, Next.js, Redux, Node.js, Express, PostgreSQL, AWS, Docker, Jest, Playwright, Git, GraphQL, CI/CD",
    "",
    "PROJECTS",
    "Open Ledger | React, Node.js",
    "• Open-source double-entry bookkeeping app",
  ];
  return Packer.toBuffer(new Document({ sections: [{ children: lines.map((l) => new Paragraph(l)) }] }));
}

async function main() {
  const email = `e2e-${Date.now()}@example.com`;
  log("1. Register", email);
  if ((await call("/api/auth/register", { method: "POST", json: { email, password: "correct-horse-battery", name: "E2E Demo" } })).status !== 200) throw new Error("register failed");
  const user = await db.user.findUniqueOrThrow({ where: { email } });

  log("2. Upload a DOCX resume (multipart)");
  const fd = new FormData();
  fd.set("file", new Blob([new Uint8Array(await resumeDocx())], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "alex-rivera-resume.docx");
  const up = await call("/api/resume", { method: "POST", body: fd });
  if (up.status !== 200) throw new Error(`upload failed: ${JSON.stringify(up.body)}`);

  const parsed = await waitFor("resume parsed", async () => {
    const r = await db.masterResume.findUnique({ where: { id: up.body.id } });
    if (r?.parseStatus === "FAILED") throw new Error(`parse failed: ${r.parseError}`);
    return r?.parseStatus === "PARSED" ? r : null;
  });
  const prof = (await call("/api/profile")).body;
  log(`3. Parsed with ${parsed.parser} parser:`, { name: prof.fullName, email: prof.email, skills: prof.skills.length, roles: prof.experience.length, years: prof.yearsExperience, uncertain: prof.uncertainFields });

  log("4. Verify profile (the demo user reviews extracted data and declares work authorization)");
  const verify = await call("/api/profile", {
    method: "PUT",
    json: {
      ...prof,
      countryCode: prof.countryCode ?? "GB",
      yearsExperience: prof.yearsExperience ?? 8,
      workAuthorizations: ["GB", "US", "IE", "DE", "NL", "CA", "IN"].map((c) => ({ countryCode: c, authorized: true, requiresSponsorship: false })),
      salaryExpectation: "Negotiable",
      availability: "4 weeks notice",
      answerBank: [],
      uncertainFields: [],
      markVerified: true,
    },
  });
  if (verify.status !== 200) throw new Error(`verify failed: ${JSON.stringify(verify.body)}`);

  log("5. Preferences: categories, any country, SANDBOX submissions, limits");
  await call("/api/preferences", {
    method: "PUT",
    json: {
      categories: ["frontend", "react", "fullstack", "software", "backend"],
      countries: [],
      includeWorldwideRemote: true,
      workArrangements: ["REMOTE", "HYBRID", "ONSITE"],
      employmentTypes: [],
      experienceLevels: [],
      maxPostingAgeDays: 120,
      minMatchScore: 45,
      maxApplicationsPerDay: 3,
      maxApplicationsPerEmployer: 1,
      autoApplyEnabled: true,
      submissionMode: "SANDBOX",
      requireCoverLetter: true,
      discoveryIntervalMinutes: 360,
    },
  });

  log("6. Live job discovery (background worker)");
  const t0 = new Date();
  await call("/api/jobs/search", { method: "POST" });
  await waitFor(
    "discovery + matching",
    async () => (await db.backgroundTask.findFirst({ where: { userId: user.id, queue: "matching", status: { in: ["COMPLETED", "FAILED"] }, createdAt: { gte: t0 } } })) ?? null,
    600_000,
    3000,
  );
  const disc = await db.backgroundTask.findFirst({ where: { userId: user.id, queue: "job-discovery" }, orderBy: { createdAt: "desc" } });
  log("   discovery report:", JSON.stringify((disc?.result as any)?.providers));
  const [total, eligible, auto] = await Promise.all([
    db.jobMatch.count({ where: { userId: user.id } }),
    db.jobMatch.count({ where: { userId: user.id, eligible: true } }),
    db.jobMatch.count({ where: { userId: user.id, autoApplyEligible: true } }),
  ]);
  log(`   evaluated ${total} real listings · ${eligible} eligible · ${auto} auto-apply eligible`);

  const top = await db.jobMatch.findFirst({ where: { userId: user.id, eligible: true, job: { sourceKey: "greenhouse", isMock: false } }, include: { job: true }, orderBy: { score: "desc" } });
  if (!top) throw new Error("No eligible Greenhouse listing found to demonstrate with");
  log(`7. Apply to REAL listing: "${top.job.title}" at ${top.job.company} (score ${top.score})\n   ${top.job.jobUrl}`);
  const apply = await call(`/api/jobs/${top.jobId}/apply`, { method: "POST" });
  if (apply.status !== 200) throw new Error(`apply failed: ${JSON.stringify(apply.body)}`);
  const appId = apply.body.applicationId as string;

  let app = await waitFor("application processed", async () => {
    const a = await db.application.findUnique({ where: { id: appId } });
    return a && TERMINAL.includes(a.status) ? a : null;
  });
  if (app.status === "MANUAL_ACTION_REQUIRED") {
    const pending = await db.applicationAnswer.findMany({ where: { applicationId: appId, requiresUserInput: true, answer: null } });
    log(`   paused for ${pending.length} question(s) the agent may not answer itself:`);
    const answers: Record<string, string> = {};
    for (const q of pending) {
      const opts = (q.options as { label: string; value: string }[] | null) ?? [];
      const yes = opts.find((o) => /^yes/i.test(o.label));
      const decline = opts.find((o) => /decline|prefer not|don.t wish/i.test(o.label));
      answers[q.questionKey] = (q.sensitive && decline ? decline.value : yes?.value) ?? opts[0]?.value ?? "Yes";
      log(`     - "${q.questionLabel.slice(0, 90)}" → demo user answers: ${opts.find((o) => o.value === answers[q.questionKey])?.label ?? answers[q.questionKey]}`);
    }
    await call(`/api/applications/${appId}/answers`, { method: "POST", json: { answers } });
    await sleep(1500);
    app = await waitFor("application submitted", async () => {
      const a = await db.application.findUnique({ where: { id: appId } });
      return a && TERMINAL.includes(a.status) && a.status !== "MANUAL_ACTION_REQUIRED" ? a : null;
    });
  }
  const full = await db.application.findUniqueOrThrow({ where: { id: appId }, include: { confirmation: true, attempts: true, documents: true, answers: true } });
  log(`8. Result: ${full.status}${full.isTest ? " (TEST — sandbox ATS)" : ""}`, full.confirmation ? { confirmationId: full.confirmation.confirmationId, method: full.confirmation.method } : full.error ?? full.manualReason);
  log(`   documents: ${full.documents.map((d) => `${d.kind}/${d.format}`).join(", ")} · answers mapped: ${full.answers.filter((a) => a.answer).length}/${full.answers.length}`);
  if (full.confirmation?.confirmationId) {
    const sbx = await db.sandboxSubmission.findUnique({ where: { confirmationId: full.confirmation.confirmationId } });
    log("   sandbox ATS received:", { board: sbx?.boardToken, job: sbx?.jobRef, fields: Object.keys((sbx?.payload as object) ?? {}).length, files: sbx?.files });
  }

  log("9. Duplicate prevention: apply to the same job again");
  const dup = await call(`/api/jobs/${top.jobId}/apply`, { method: "POST" });
  log(`   → HTTP ${dup.status}: ${dup.body.error}`);

  log("10. Start the autonomous agent (limit 3/day, SANDBOX)");
  const start = await call("/api/agent", { method: "POST", json: { action: "start" } });
  log(`   → HTTP ${start.status}`, start.body.status ?? start.body.error);
  await waitFor(
    "agent created applications",
    async () => {
      const n = await db.application.count({ where: { userId: user.id, id: { not: appId } } });
      return n > 0 ? n : null;
    },
    600_000,
    3000,
  ).catch(() => log("   agent created no additional applications (no further auto-eligible matches)"));
  await waitFor(
    "agent applications settled",
    async () => (await db.application.count({ where: { userId: user.id, status: { notIn: TERMINAL as any } } })) === 0,
    600_000,
    3000,
  );
  const agentApps = await db.application.findMany({ where: { userId: user.id }, include: { job: true, confirmation: true } });
  for (const a of agentApps) log(`   - ${a.status.padEnd(24)} ${a.job.title} @ ${a.job.company} [${a.job.sourceKey}] ${a.confirmation?.confirmationId ?? a.manualReason?.slice(0, 80) ?? ""}`);

  log("11. Pause → resume → stop");
  log("   pause:", (await call("/api/agent", { method: "POST", json: { action: "pause" } })).body.status);
  log("   resume:", (await call("/api/agent", { method: "POST", json: { action: "resume" } })).body.status);
  log("   stop:", (await call("/api/agent", { method: "POST", json: { action: "stop" } })).body.status);

  const csv = await fetch(`${BASE}/api/applications/export`, { headers: { Cookie: cookie } });
  log(`12. CSV export: HTTP ${csv.status}, ${(await csv.text()).split("\n").length - 1} row(s)`);
  log("DONE. Sign in as", email, "/ correct-horse-battery to inspect in the UI.");
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("[e2e] FAILED:", err);
  await db.$disconnect();
  process.exit(1);
});
