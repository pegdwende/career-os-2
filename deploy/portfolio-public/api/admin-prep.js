const fs = require("fs");
const path = require("path");
const { getSession } = require("./_admin-auth");

const MAX_TEXT_LENGTH = 30000;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function readIfExists(relativePath) {
  const file = path.join(__dirname, relativePath);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function loadContext() {
  const files = [
    "private-data/profile.yaml",
    "private-data/roles.yaml",
    "private-data/skills.yaml",
    "private-data/metrics.yaml",
    "private-data/projects.yaml",
    "private-data/accomplishments.yaml"
  ];

  return files
    .map((file) => {
      const content = readIfExists(file);
      return content ? `# ${file}\n${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

async function callOpenAi(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.ADMIN_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input,
      max_output_tokens: 3500,
      temperature: 0.25
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "OpenAI generation failed.");

  return (
    payload.output_text ||
    payload.output
      ?.flatMap((item) => item.content || [])
      ?.map((item) => item.text || "")
      ?.join("\n")
      ?.trim() ||
    ""
  );
}

module.exports = async function handler(req, res) {
  const session = getSession(req);
  if (!session) return json(res, 401, { error: "Admin login required." });
  if (session.role !== "owner") {
    return json(res, 403, { error: "Owner access required for private resume interview prep." });
  }

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

  const company = String(body.company || "").slice(0, 120);
  const role = String(body.role || "").slice(0, 160);
  const jobDescription = String(body.jobDescription || "").slice(0, MAX_TEXT_LENGTH);
  const notes = String(body.notes || "").slice(0, MAX_TEXT_LENGTH);
  const generatedPackage = String(body.generatedPackage || "").slice(0, MAX_TEXT_LENGTH);

  if (!company && !role && !jobDescription) {
    return json(res, 400, { error: "Select or save a job before generating interview prep." });
  }

  try {
    const context = loadContext();
    const prep = await callOpenAi([
      {
        role: "system",
        content:
          "You are a private interview preparation assistant for Rodrigue Compaore. Use only the supplied candidate facts, job description, generated package, and user notes. Do not invent facts. Mark missing facts as NEEDS_CONFIRMATION. Produce concise Markdown that helps prepare for recruiter screens, phone screens, technical screens, hiring manager interviews, and follow-up."
      },
      {
        role: "user",
        content: `Candidate context:\n${context}\n\nCompany: ${company || "Unknown"}\nRole: ${role || "Unknown"}\n\nJob description:\n${jobDescription || "Not provided"}\n\nGenerated resume package:\n${generatedPackage || "Not provided"}\n\nApplication/interview notes:\n${notes || "None"}\n\nCreate Markdown with these sections:\n1. Company and Role Snapshot\n2. Why This Role\n3. Phone Screen Talking Points\n4. Likely Recruiter Questions and Answers\n5. Technical / Leadership Talking Points\n6. STAR Stories To Prepare\n7. Gaps, Risks, and NEEDS_CONFIRMATION\n8. Questions To Ask Them\n9. Follow-up Email Draft`
      }
    ]);

    return json(res, 200, { prep });
  } catch {
    return json(res, 500, { error: "Interview prep generation failed. Check configuration and try again." });
  }
};
