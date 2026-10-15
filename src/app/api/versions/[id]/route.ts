import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getFile, keyBelongsTo } from "@/lib/storage";
import { HttpError, withUser } from "@/lib/api";

export const GET = withUser<{ params: Promise<{ id: string }> }>(async (req, user, { params }) => {
  const v = await db.resumeVersion.findFirst({ where: { id: (await params).id, userId: user.id }, include: { job: { select: { company: true } } } });
  if (!v) throw new HttpError(404, "Not found");
  const format = new URL(req.url).searchParams.get("format") === "docx" ? "docx" : "pdf";
  const key = format === "pdf" ? v.pdfKey : v.docxKey;
  if (!key || !keyBelongsTo(key, user.id)) throw new HttpError(404, "File not found");
  const name = `Resume_${(v.job?.company ?? "tailored").replace(/[^A-Za-z0-9]+/g, "_")}.${format}`;
  return new NextResponse(new Uint8Array(await getFile(key)), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `${format === "pdf" ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
