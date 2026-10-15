import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { putFile } from "@/lib/storage";
import { HttpError, withUser } from "@/lib/api";
import { DOCX_MIME, MAX_RESUME_BYTES, PDF_MIME, detectResumeType } from "@/lib/resume/extract-text";
import { enqueue, QUEUES } from "@/lib/queue/queues";

export const POST = withUser(async (req, user) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No file uploaded");
  if (file.size > MAX_RESUME_BYTES) throw new HttpError(413, "File too large (max 8 MB)");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = detectResumeType(buf);
  if (!type) throw new HttpError(415, "Only PDF and DOCX resumes are supported");
  const storageKey = await putFile(user.id, type, buf);
  await db.masterResume.updateMany({ where: { userId: user.id, isActive: true }, data: { isActive: false } });
  const resume = await db.masterResume.create({
    data: {
      userId: user.id,
      fileName: file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 200),
      mimeType: type === "pdf" ? PDF_MIME : DOCX_MIME,
      storageKey,
      sha256: sha256(buf),
      sizeBytes: buf.length,
    },
  });
  await enqueue(QUEUES.resumeParse, "parse-resume", { userId: user.id, resumeId: resume.id, manual: true });
  await audit(user.id, "resume.uploaded", { type: "MasterResume", id: resume.id }, { size: buf.length, type });
  return NextResponse.json({ id: resume.id });
});
