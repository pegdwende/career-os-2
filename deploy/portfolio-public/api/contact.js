const RETENTION_SECONDS = 90 * 24 * 60 * 60;

const CONTACT_UNAVAILABLE_MESSAGE =
  "Contact capture is unavailable right now. Please connect with Rodrigue on LinkedIn instead.";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function redisPipeline(config, commands) {
  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(commands)
  });

  if (!response.ok) throw new Error(`Redis command failed with ${response.status}`);
  const results = await response.json();
  if (results.some((item) => item?.error)) throw new Error("Redis command failed");
  return results;
}

async function incrementWithTtl(config, key, ttlSeconds) {
  const results = await redisPipeline(config, [
    ["INCR", key],
    ["EXPIRE", key, ttlSeconds]
  ]);
  return Number(results[0]?.result || 0);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = async function handler(req, res) {
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

  const consent = body.consent === true;
  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().slice(0, 180);
  const message = String(body.message || "").trim().slice(0, 1000);
  const companyWebsite = String(body.companyWebsite || "").trim();

  if (companyWebsite) return json(res, 200, { ok: true });

  const redis = getRedisConfig();
  if (!redis) return json(res, 503, { error: CONTACT_UNAVAILABLE_MESSAGE });

  if (!consent) {
    return json(res, 400, {
      error: "Please confirm consent before sharing recruiter contact details."
    });
  }
  if (!name || !validEmail(email)) {
    return json(res, 400, {
      error: "Please enter your name and a valid recruiter email address."
    });
  }

  const ip = getClientIp(req);
  const day = new Date().toISOString().slice(0, 10);
  const count = await incrementWithTtl(redis, `chat:contact:ip:${ip}:day:${day}`, 26 * 60 * 60);
  if (count > Number(process.env.CONTACT_DAILY_IP_LIMIT || 5)) {
    return json(res, 429, {
      error:
        "Thanks for reaching out. This contact form has reached its daily submission limit from your network. Please connect with Rodrigue on LinkedIn."
    });
  }

  const record = {
    at: new Date().toISOString(),
    name,
    email,
    message,
    source: "portfolio-ai-chat",
    ipHashHint: ip === "unknown" ? "unknown" : "ip-rate-limited"
  };

  try {
    await redisPipeline(redis, [
      ["LPUSH", "chat:contacts", JSON.stringify(record)],
      ["LTRIM", "chat:contacts", 0, 199],
      ["EXPIRE", "chat:contacts", RETENTION_SECONDS]
    ]);
    return json(res, 200, { ok: true });
  } catch {
    return json(res, 500, { error: CONTACT_UNAVAILABLE_MESSAGE });
  }
};
