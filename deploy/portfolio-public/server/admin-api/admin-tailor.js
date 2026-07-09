const fs = require("fs");
const path = require("path");
const { getSession } = require("../../api/_admin-auth");
const { loadProfile } = require("../../api/_admin-store");

const MAX_JOB_DESCRIPTION_LENGTH = 24000;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function readIfExists(relativePath) {
  const file = path.join(__dirname, "../../api", relativePath);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function loadContext() {
  const files = [
    "private-data/profile.yaml",
    "private-data/roles.yaml",
    "private-data/skills.yaml",
    "private-data/metrics.yaml",
    "private-data/projects.yaml",
    "private-data/accomplishments.yaml",
    "private-prompts/tailor_resume.md",
    "private-templates/engineering_manager.md",
    "private-templates/staff_engineer.md",
    "private-templates/senior_engineer.md"
  ];

  return files
    .map((file) => {
      const content = readIfExists(file);
      return content ? `# ${file}\n${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

async function loadUserContext(session) {
  if (session.role === "owner") return loadContext();
  const profile = await loadProfile(session.userId);
  if (!profile) {
    const error = new Error("Save your resume profile before generating tailored materials.");
    error.code = "PROFILE_REQUIRED";
    throw error;
  }
  return `# encrypted-user-profile\n${JSON.stringify(profile, null, 2)}`;
}

function buildInput(context, body) {
  return [
    {
      role: "system",
      content:
        "You are a private resume-tailoring assistant for Rodrigue Compaore. Use only the supplied candidate facts, templates, and job description. Do not invent facts, metrics, employers, dates, certifications, direct reports, tools, or technologies. If a useful fact is missing, mark it as NEEDS_CONFIRMATION. Produce Markdown only. Keep recruiter-only sections clearly separated from the final resume so they can be removed before sending. The final resume section must not include target-role match scoring, recruiter messages, interview prep notes, or missing information checklists."
    },
    {
      role: "user",
      content: `Candidate context:\n${context}\n\nCompany: ${body.company || "Unknown"}\nRole: ${body.role || "Unknown"}\n\nJob description:\n${body.jobDescription}\n\nOutput Markdown with these sections:\n1. Match Analysis\n2. Final Resume - Recruiter Safe\n3. Cover Letter\n4. Recruiter Message\n5. Interview Prep Notes\n6. Missing Information Checklist\n\nRules:\n- Keep final resume recruiter-safe.\n- Use NEEDS_CONFIRMATION for gaps.\n- Do not include unsupported claims.\n- Mention analogous experience where appropriate.\n- Keep the final resume ATS-friendly.`
    }
  ];
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
      max_output_tokens: 4500,
      temperature: 0.25
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "OpenAI generation failed.");
  }

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
  if (!session) {
    return json(res, 401, { error: "Admin login required." });
  }

  if (req.method === "GET") return json(res, 200, { ok: true });

  if (req.method !== "POST") {
    res.setHeader("allow", "GET, POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
  } catch {
    return json(res, 400, { error: "Invalid JSON payload." });
  }

  const jobDescription = String(body.jobDescription || "").trim();
  if (!jobDescription || jobDescription.length > MAX_JOB_DESCRIPTION_LENGTH) {
    return json(res, 400, {
      error: `Paste a job description under ${MAX_JOB_DESCRIPTION_LENGTH} characters.`
    });
  }

  try {
    const context = await loadUserContext(session);
    if (!context) return json(res, 500, { error: "Private resume context is missing." });

    const markdown = await callOpenAi(
      buildInput(context, {
        company: String(body.company || "").slice(0, 120),
        role: String(body.role || "").slice(0, 160),
        jobDescription
      })
    );

    return json(res, 200, { markdown });
  } catch (error) {
    if (error.code === "PROFILE_REQUIRED") return json(res, 400, { error: error.message, code: error.code });
    if (error.code === "DATABASE_NOT_CONFIGURED") {
      return json(res, 503, { error: "Encrypted profile database is not configured.", code: error.code });
    }
    if (error.code === "ENCRYPTION_NOT_CONFIGURED") {
      return json(res, 503, { error: "ADMIN_DATA_ENCRYPTION_KEY is not configured.", code: error.code });
    }
    return json(res, 500, { error: "Tailoring failed. Check configuration and try again." });
  }
};
