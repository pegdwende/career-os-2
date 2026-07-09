const { createSessionCookie, passcodeMatches } = require("../../api/_admin-auth");
const { authenticateUser } = require("../../api/_admin-users");
const crypto = require("crypto");

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

function hashIp(ip) {
  const salt = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSCODE || "admin-login";
  return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 24);
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

async function enforceLoginLimit(req) {
  const redis = getRedisConfig();
  if (!redis) return { limited: false };

  const ipHash = hashIp(getClientIp(req));
  const windowCount = await incrementWithTtl(redis, `admin:login:ip:${ipHash}:15m`, 15 * 60);
  if (windowCount > Number(process.env.ADMIN_LOGIN_15M_LIMIT || 8)) {
    return { limited: true };
  }

  return { limited: false };
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

  try {
    const limit = await enforceLoginLimit(req);
    if (limit.limited) {
      return json(res, 429, { error: "Too many admin login attempts. Try again later." });
    }
  } catch {
    return json(res, 503, { error: "Admin login is temporarily unavailable." });
  }

  const email = String(body.email || "").trim();
  const password = String(body.password || "");
  if (email || password) {
    try {
      const user = await authenticateUser(email, password);
      if (!user) return json(res, 401, { error: "Invalid email or password." });
      res.setHeader("set-cookie", createSessionCookie(user));
      return json(res, 200, { ok: true, user });
    } catch (error) {
      if (error.code === "DATABASE_NOT_CONFIGURED") {
        return json(res, 503, { error: "Account database is not configured. Set Redis environment variables." });
      }
      return json(res, 500, { error: "Admin login is temporarily unavailable." });
    }
  }

  if (!passcodeMatches(String(body.passcode || ""))) {
    return json(res, 401, { error: "Invalid admin passcode or account credentials." });
  }

  const owner = { userId: "owner", email: "owner", role: "owner" };
  res.setHeader("set-cookie", createSessionCookie(owner));
  return json(res, 200, { ok: true, user: owner });
};
