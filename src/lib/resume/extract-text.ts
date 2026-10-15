export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MAX_RESUME_BYTES = 8 * 1024 * 1024;

/** Validate by magic bytes, not just the client-provided MIME type. */
export function detectResumeType(buf: Buffer): "pdf" | "docx" | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf.includes(Buffer.from("word/"))) return "docx";
  return null;
}

export async function extractResumeText(buf: Buffer): Promise<string> {
  const type = detectResumeType(buf);
  if (type === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text.join("\n") : text).replace(/\r/g, "").trim();
  }
  if (type === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value.replace(/\r/g, "").trim();
  }
  throw new Error("Unsupported file type. Upload a PDF or DOCX resume.");
}
