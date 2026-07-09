const fs = require("fs");
const path = require("path");
const { getSession } = require("../../api/_admin-auth");
const { redisCommand } = require("../../api/_admin-store");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function envStatus(name, required = true) {
  return { name, required, ok: Boolean(process.env[name]) };
}

function fileStatus(relativePath) {
  const fullPath = path.join(__dirname, "../..", relativePath);
  return { path: relativePath, ok: fs.existsSync(fullPath) };
}

module.exports = async function handler(req, res) {
  const session = getSession(req);
  if (!session) return json(res, 401, { error: "Admin login required." });
  if (session.role !== "owner") return json(res, 403, { error: "Owner access required." });

  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    return json(res, 405, { error: "Method not allowed" });
  }

  const checks = {
    env: [
      envStatus("OPENAI_API_KEY"),
      envStatus("OPENAI_MODEL", false),
      envStatus("ADMIN_OPENAI_MODEL", false),
      envStatus("ADMIN_PASSCODE"),
      envStatus("ADMIN_SESSION_SECRET"),
      envStatus("ADMIN_DATA_ENCRYPTION_KEY"),
      envStatus("UPSTASH_REDIS_REST_URL"),
      envStatus("UPSTASH_REDIS_REST_TOKEN"),
      envStatus("TAVILY_API_KEY", false),
      envStatus("BRAVE_SEARCH_API_KEY", false)
    ],
    files: [
      fileStatus("knowledge/public-profile.json"),
      fileStatus("api/private-data/profile.yaml"),
      fileStatus("api/private-prompts/tailor_resume.md"),
      fileStatus("api/assets/rodrigue_compaore_public_resume.pdf")
    ],
    services: []
  };

  try {
    await redisCommand(["PING"]);
    checks.services.push({ name: "redis", ok: true });
  } catch (error) {
    checks.services.push({ name: "redis", ok: false, detail: error.code || error.message });
  }

  checks.services.push({ name: "openai_config", ok: Boolean(process.env.OPENAI_API_KEY) });
  checks.services.push({
    name: "web_research_config",
    ok: Boolean(process.env.TAVILY_API_KEY || process.env.BRAVE_SEARCH_API_KEY)
  });

  const ok = [
    ...checks.env.filter((item) => item.required),
    ...checks.files,
    ...checks.services.filter((item) => item.name !== "web_research_config")
  ].every((item) => item.ok);

  return json(res, ok ? 200 : 503, { ok, checks, checkedAt: new Date().toISOString() });
};
