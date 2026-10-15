import PDFDocument from "pdfkit";
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { TailoredResume } from "./tailor";

const dateRange = (s: string | null | undefined, e: string | null | undefined) => [s, e].filter(Boolean).join(" – ");

/** ATS-friendly: single column, standard font, real text, conventional headings. */
export function renderResumePdf(r: TailoredResume): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 48, bottom: 48, left: 54, right: 54 }, info: { Title: `${r.name} — Resume`, Author: r.name } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const heading = (t: string) => {
      doc.moveDown(0.6).font("Helvetica-Bold").fontSize(11.5).fillColor("#111").text(t.toUpperCase());
      doc.moveTo(doc.page.margins.left, doc.y + 1).lineTo(doc.page.width - doc.page.margins.right, doc.y + 1).lineWidth(0.5).strokeColor("#999").stroke();
      doc.moveDown(0.3);
    };
    const bullets = (items: string[]) => {
      doc.font("Helvetica").fontSize(10).fillColor("#222");
      for (const b of items) doc.text(`•  ${b}`, { indent: 8, paragraphGap: 2 });
    };

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#000").text(r.name || "Candidate");
    if (r.headline) doc.font("Helvetica").fontSize(11).fillColor("#333").text(r.headline);
    const contact = [r.contact.email, r.contact.phone, r.contact.location, ...r.contact.links.map((l) => l.url)].filter(Boolean).join("  |  ");
    if (contact) doc.font("Helvetica").fontSize(9.5).fillColor("#333").text(contact);

    heading("Summary");
    doc.font("Helvetica").fontSize(10).fillColor("#222").text(r.summary);

    if (r.skills.length) {
      heading("Skills");
      doc.font("Helvetica").fontSize(10).text(r.skills.join(", "));
    }
    if (r.experience.length) {
      heading("Experience");
      for (const e of r.experience) {
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#111").text(`${e.title} — ${e.company}`, { continued: false });
        const meta = [dateRange(e.startDate, e.endDate), e.location].filter(Boolean).join("  |  ");
        if (meta) doc.font("Helvetica-Oblique").fontSize(9.5).fillColor("#444").text(meta);
        bullets(e.bullets);
        doc.moveDown(0.4);
      }
    }
    if (r.projects.length) {
      heading("Projects");
      for (const p of r.projects) {
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#111").text(p.name + (p.technologies.length ? ` (${p.technologies.join(", ")})` : ""));
        if (p.url) doc.font("Helvetica").fontSize(9.5).fillColor("#444").text(p.url);
        bullets(p.bullets);
        doc.moveDown(0.3);
      }
    }
    if (r.education.length) {
      heading("Education");
      for (const e of r.education) {
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#111").text([e.degree, e.field].filter(Boolean).join(", ") || e.institution);
        doc.font("Helvetica").fontSize(10).fillColor("#333").text([e.degree ? e.institution : null, dateRange(e.startDate, e.endDate), e.grade].filter(Boolean).join("  |  "));
      }
    }
    if (r.certifications.length) {
      heading("Certifications");
      bullets(r.certifications.map((c) => [c.name, c.issuer, c.date].filter(Boolean).join(" — ")));
    }
    if (r.achievements.length) {
      heading("Achievements");
      bullets(r.achievements);
    }
    if (r.languages.length) {
      heading("Languages");
      doc.font("Helvetica").fontSize(10).text(r.languages.join(", "));
    }
    doc.end();
  });
}

export async function renderResumeDocx(r: TailoredResume): Promise<Buffer> {
  const children: Paragraph[] = [];
  const h = (t: string) => children.push(new Paragraph({ text: t.toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 } }));
  const p = (t: string, opts: { bold?: boolean; italics?: boolean } = {}) => children.push(new Paragraph({ children: [new TextRun({ text: t, ...opts })] }));
  const b = (t: string) => children.push(new Paragraph({ text: t, bullet: { level: 0 } }));

  children.push(new Paragraph({ children: [new TextRun({ text: r.name || "Candidate", bold: true, size: 36 })] }));
  if (r.headline) p(r.headline);
  const contact = [r.contact.email, r.contact.phone, r.contact.location, ...r.contact.links.map((l) => l.url)].filter(Boolean).join(" | ");
  if (contact) p(contact);
  h("Summary");
  p(r.summary);
  if (r.skills.length) {
    h("Skills");
    p(r.skills.join(", "));
  }
  if (r.experience.length) {
    h("Experience");
    for (const e of r.experience) {
      p(`${e.title} — ${e.company}`, { bold: true });
      const meta = [dateRange(e.startDate, e.endDate), e.location].filter(Boolean).join(" | ");
      if (meta) p(meta, { italics: true });
      e.bullets.forEach(b);
    }
  }
  if (r.projects.length) {
    h("Projects");
    for (const x of r.projects) {
      p(x.name + (x.technologies.length ? ` (${x.technologies.join(", ")})` : ""), { bold: true });
      if (x.url) p(x.url);
      x.bullets.forEach(b);
    }
  }
  if (r.education.length) {
    h("Education");
    for (const e of r.education) {
      p([e.degree, e.field].filter(Boolean).join(", ") || e.institution, { bold: true });
      p([e.degree ? e.institution : null, dateRange(e.startDate, e.endDate), e.grade].filter(Boolean).join(" | "));
    }
  }
  if (r.certifications.length) {
    h("Certifications");
    r.certifications.forEach((c) => b([c.name, c.issuer, c.date].filter(Boolean).join(" — ")));
  }
  if (r.achievements.length) {
    h("Achievements");
    r.achievements.forEach(b);
  }
  if (r.languages.length) {
    h("Languages");
    p(r.languages.join(", "));
  }
  const doc = new Document({ creator: "JobPilot AI", title: `${r.name} — Resume`, styles: { default: { document: { run: { font: "Calibri", size: 21 } } } }, sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export function renderLetterPdf(text: string, title: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 64, bottom: 64, left: 64, right: 64 }, info: { Title: title } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.font("Helvetica").fontSize(11).fillColor("#111").text(text, { paragraphGap: 4, lineGap: 2 });
    doc.end();
  });
}

export async function renderLetterDocx(text: string, title: string): Promise<Buffer> {
  const doc = new Document({
    title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children: text.split("\n").map((l) => new Paragraph({ children: [new TextRun(l)], alignment: AlignmentType.LEFT, spacing: { after: 60 } })) }],
  });
  return Packer.toBuffer(doc);
}
