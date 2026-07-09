const { getSession } = require("../../api/_admin-auth");

const MAX_MARKDOWN_LENGTH = 120000;

const DOC_SECTIONS = [
  { key: "resume", filename: "resume.docx", title: "Final Resume", patterns: [/final resume/i, /resume/i] },
  { key: "cover_letter", filename: "cover_letter.docx", title: "Cover Letter", patterns: [/cover letter/i] },
  { key: "recruiter_message", filename: "recruiter_message.docx", title: "Recruiter Message", patterns: [/recruiter message/i] },
  { key: "interview_prep", filename: "interview_prep.docx", title: "Interview Prep Notes", patterns: [/interview prep/i] },
  { key: "missing_info", filename: "missing_information_checklist.docx", title: "Missing Information Checklist", patterns: [/missing information/i, /checklist/i] }
];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function sanitizeFilename(value, fallback = "application") {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || fallback;
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function createZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const { dosDate, dosTime } = dosDateTime();

  files.forEach((file) => {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data), "utf8");
    const checksum = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data
    ]);

    chunks.push(local);
    central.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(dosTime),
        u16(dosDate),
        u32(checksum),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name
      ])
    );
    offset += local.length;
  });

  const centralDirectory = Buffer.concat(central);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0)
  ]);

  return Buffer.concat([...chunks, centralDirectory, end]);
}

function paragraphXml(text, style = "") {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function bulletXml(text) {
  return `<w:p><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function markdownToBodyXml(markdown, title) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const parts = [paragraphXml(title, "Title")];
  let paragraph = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    parts.push(paragraphXml(paragraph.join(" ").trim()));
    paragraph = [];
  }

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      return;
    }
    if (/^#{1,6}\s+/.test(trimmed)) {
      flushParagraph();
      const headingText = trimmed.replace(/^#{1,6}\s+/, "");
      parts.push(paragraphXml(headingText, "Heading1"));
      return;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      parts.push(bulletXml(trimmed.replace(/^[-*]\s+/, "")));
      return;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      parts.push(bulletXml(trimmed.replace(/^\d+\.\s+/, "")));
      return;
    }
    paragraph.push(trimmed.replace(/\*\*/g, ""));
  });

  flushParagraph();
  return parts.join("");
}

function createDocx(title, markdown) {
  const body = markdownToBodyXml(markdown, title);
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:after="240"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="260" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet">
    <w:name w:val="List Bullet"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
  </w:style>
</w:styles>`;

  return createZip([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    },
    {
      name: "word/_rels/document.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    { name: "word/document.xml", data: documentXml },
    { name: "word/styles.xml", data: stylesXml }
  ]);
}

function parseSections(markdown) {
  const normalized = String(markdown || "").replace(/\r\n/g, "\n");
  const matches = [...normalized.matchAll(/^#{1,2}\s+(.+)$/gm)];
  if (!matches.length) return [];

  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    return {
      heading: match[1].trim(),
      content: normalized.slice(start, end).trim()
    };
  });
}

function pickSection(sections, config) {
  const section = sections.find((item) => config.patterns.some((pattern) => pattern.test(item.heading)));
  if (!section) return "";
  return `# ${section.heading}\n\n${section.content}`.trim();
}

function buildDocFiles(markdown) {
  const sections = parseSections(markdown);
  const files = DOC_SECTIONS.map((config) => ({
    name: config.filename,
    data: pickSection(sections, config),
    title: config.title
  })).filter((file) => file.data);

  files.push({
    name: "full_generated_package.docx",
    title: "Full Generated Package",
    data: markdown
  });

  return files.map((file) => ({
    name: file.name,
    data: createDocx(file.title, file.data)
  }));
}

module.exports = async function handler(req, res) {
  const session = getSession(req);
  if (!session) return json(res, 401, { error: "Admin login required." });

  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
  } catch {
    return json(res, 400, { error: "Invalid JSON payload." });
  }

  const markdown = String(body.markdown || "").trim();
  if (!markdown || markdown.length > MAX_MARKDOWN_LENGTH) {
    return json(res, 400, { error: `Generated package must be under ${MAX_MARKDOWN_LENGTH} characters.` });
  }

  const prefix = sanitizeFilename(`${body.company || ""}_${body.role || ""}`, "tailored_resume_package");
  const zip = createZip(buildDocFiles(markdown).map((file) => ({
    name: `${prefix}/${file.name}`,
    data: file.data
  })));

  res.statusCode = 200;
  res.setHeader("content-type", "application/zip");
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-disposition", `attachment; filename="${prefix || "tailored_resume_package"}_word_docs.zip"`);
  res.end(zip);
};
