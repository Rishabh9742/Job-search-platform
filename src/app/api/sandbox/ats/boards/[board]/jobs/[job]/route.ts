import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sandboxApiKey } from "@/lib/apply/adapters/sandbox";
import { SANDBOX_DEFAULT_FORM } from "@/lib/apply/adapters/sandbox";

type Ctx = { params: Promise<{ board: string; job: string }> };

function authorized(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const expected = `Basic ${Buffer.from(`${sandboxApiKey()}:`).toString("base64")}`;
  return h.length === expected.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(expected));
}

/** Sandbox job form in Greenhouse format (public, like the real API). */
export async function GET() {
  return NextResponse.json({
    questions: SANDBOX_DEFAULT_FORM.map((f) => ({ label: f.label, required: f.required, description: null, fields: [{ name: f.key, type: f.type === "file" ? "input_file" : f.type === "textarea" ? "textarea" : "input_text", values: [] }] })),
  });
}

/**
 * Test ATS endpoint implementing the Greenhouse application contract:
 * Basic auth with the board key, multipart form, required-field validation,
 * file checks. Adds Idempotency-Key support and returns a confirmation id.
 */
export async function POST(req: Request, { params }: Ctx) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized — invalid API key" }, { status: 401 });
  const { board, job } = await params;
  const idem = req.headers.get("idempotency-key");
  if (!idem) return NextResponse.json({ error: "Idempotency-Key header required" }, { status: 400 });

  const existing = await db.sandboxSubmission.findUnique({ where: { idempotencyKey: idem } });
  if (existing) return NextResponse.json({ success: "Candidate saved successfully", confirmation_id: existing.confirmationId, replayed: true });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const required = (req.headers.get("x-sandbox-required") ?? "").split(",").filter(Boolean);
  const missing = required.filter((k) => !form.get(k) && !form.getAll(`${k}[]`).length);
  for (const k of ["first_name", "last_name", "email"]) if (!form.get(k) && !missing.includes(k)) missing.push(k);
  if (missing.length) return NextResponse.json({ error: `Missing required fields: ${missing.join(", ")}` }, { status: 422 });

  const email = String(form.get("email"));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Invalid email" }, { status: 422 });

  const files: { field: string; name: string; size: number; type: string; sha256: string; validPdf: boolean }[] = [];
  const payload: Record<string, string | string[]> = {};
  for (const [k, v] of form.entries()) {
    if (v instanceof File) {
      const buf = Buffer.from(await v.arrayBuffer());
      files.push({ field: k, name: v.name, size: buf.length, type: v.type, sha256: crypto.createHash("sha256").update(buf).digest("hex"), validPdf: buf.subarray(0, 5).toString("latin1") === "%PDF-" });
    } else if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      payload[key] = [...((payload[key] as string[]) ?? []), v];
    } else payload[k] = v;
  }
  const resume = files.find((f) => f.field === "resume");
  if (!resume && !payload.resume_text) return NextResponse.json({ error: "Resume is required" }, { status: 422 });
  if (resume && (!resume.validPdf || resume.size < 500)) return NextResponse.json({ error: "Resume file is not a valid PDF" }, { status: 422 });

  const confirmationId = `SBX-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  try {
    await db.sandboxSubmission.create({ data: { confirmationId, idempotencyKey: idem, boardToken: board, jobRef: job, payload: payload as Prisma.InputJsonValue, files: files as unknown as Prisma.InputJsonValue } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const again = await db.sandboxSubmission.findUnique({ where: { idempotencyKey: idem } });
      return NextResponse.json({ success: "Candidate saved successfully", confirmation_id: again?.confirmationId, replayed: true });
    }
    throw err;
  }
  return NextResponse.json({ success: "Candidate saved successfully", confirmation_id: confirmationId });
}
