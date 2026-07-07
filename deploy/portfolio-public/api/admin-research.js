const { isAuthenticated } = require("./_admin-auth");

const MAX_TEXT_LENGTH = 30000;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
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
      temperature: 0.2
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
  if (!isAuthenticated(req)) return json(res, 401, { error: "Admin login required." });

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
  const sourceNotes = String(body.sourceNotes || "").slice(0, MAX_TEXT_LENGTH);
  const existingNotes = String(body.existingNotes || "").slice(0, MAX_TEXT_LENGTH);

  if (!company && !role && !jobDescription && !sourceNotes) {
    return json(res, 400, { error: "Save a job or paste research notes before generating research." });
  }

  try {
    const research = await callOpenAi([
      {
        role: "system",
        content:
          "You are a private company and interview research assistant. Use only the supplied job description and user-provided notes. Do not claim to have browsed the web. Do not present interview questions as recent, reported, or confirmed unless they appear in the supplied notes. When source notes are absent, provide likely practice areas and mark them as inferred."
      },
      {
        role: "user",
        content: `Company: ${company || "Unknown"}\nRole: ${role || "Unknown"}\n\nJob description:\n${jobDescription || "Not provided"}\n\nUser-provided research notes, interview reports, coding challenge notes, or links pasted by the admin:\n${sourceNotes || "None provided"}\n\nExisting application notes:\n${existingNotes || "None"}\n\nCreate concise Markdown with these sections:\n1. Company Snapshot\n2. What The Role Likely Owns\n3. Business / Product Context To Understand\n4. Interview Loop Hypothesis\n5. Reported Interview Questions From Provided Notes\n6. Inferred Practice Questions\n7. Coding / System Design Challenge Practice\n8. Architecture and Leadership Talking Points\n9. Questions To Ask Them\n10. Follow-up Research Checklist\n\nRules:\n- If no provided notes include reported questions, write \"No reported questions were provided\" in section 5.\n- Separate confirmed-from-notes items from inferred prep.\n- Keep it practical for recruiter screens, hiring manager rounds, architecture discussions, and coding screens.
- Do not invent company facts beyond what the job description or notes support.`
      }
    ]);

    return json(res, 200, { research });
  } catch {
    return json(res, 500, { error: "Company and interview research failed. Check configuration and try again." });
  }
};
