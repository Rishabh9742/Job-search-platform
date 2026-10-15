import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getFile, keyBelongsTo } from "@/lib/storage";
import { HttpError, withUser } from "@/lib/api";

const TYPES: Record<string, string> = { PDF: "application/pdf", DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

/** Download an application document. Ownership is checked through the application. */
export const GET = withUser<{ params: Promise<{ id: string }> }>(async (_req, user, { params }) => {
  const doc = await db.applicationDocument.findFirst({ where: { id: (await params).id, application: { userId: user.id } }, include: { application: { include: { job: { select: { company: true } } } } } });
  if (!doc) throw new HttpError(404, "Not found");
  if (doc.format === "TEXT") return new NextResponse(doc.textContent ?? "", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
  if (!doc.storageKey || !keyBelongsTo(doc.storageKey, user.id)) throw new HttpError(404, "File missing");
  const name = `${doc.kind === "RESUME" ? "Resume" : "Cover_Letter"}_${doc.application.job.company.replace(/[^A-Za-z0-9]+/g, "_")}.${doc.format.toLowerCase()}`;
  return new NextResponse(new Uint8Array(await getFile(doc.storageKey)), {
    headers: { "Content-Type": TYPES[doc.format], "Content-Disposition": `${doc.format === "PDF" ? "inline" : "attachment"}; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
});
