const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const RESUME_PATH = path.join(__dirname, "assets", "rodrigue_compaore_public_resume.pdf");

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

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function hashIp(ip) {
  const salt = process.env.DOWNLOAD_IP_HASH_SALT || process.env.UPSTASH_REDIS_REST_TOKEN || "portfolio-download";
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

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    return json(res, 405, { error: "Method not allowed" });
  }

  const redis = getRedisConfig();
  if (!redis) {
    return json(res, 503, {
      error: "Resume download tracking is unavailable right now. Please view the public resume page instead."
    });
  }

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  const day = todayKey();
  const ipLimit = Number(process.env.DOWNLOAD_DAILY_IP_LIMIT || 20);
  const siteLimit = Number(process.env.DOWNLOAD_DAILY_SITE_LIMIT || 1000);

  try {
    const ipCount = await incrementWithTtl(redis, `download:resume:ip:${ipHash}:day:${day}`, 26 * 60 * 60);
    if (ipCount > ipLimit) {
      return json(res, 429, {
        error: "Resume downloads are temporarily limited from your network. Please try again later or view the public resume page."
      });
    }

    const siteCount = await incrementWithTtl(redis, `download:resume:site:day:${day}`, 26 * 60 * 60);
    if (siteCount > siteLimit) {
      return json(res, 429, {
        error: "Resume downloads are temporarily limited for the site. Please try again later or view the public resume page."
      });
    }

    await redisPipeline(redis, [
      ["LPUSH", "download:resume:events", JSON.stringify({ at: new Date().toISOString(), ipHash })],
      ["LTRIM", "download:resume:events", 0, 999],
      ["EXPIRE", "download:resume:events", 90 * 24 * 60 * 60]
    ]);

    const file = fs.readFileSync(RESUME_PATH);
    res.statusCode = 200;
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", "attachment; filename=\"rodrigue_compaore_public_resume.pdf\"");
    res.setHeader("cache-control", "private, no-store");
    return res.end(file);
  } catch {
    return json(res, 500, {
      error: "Resume download is unavailable right now. Please view the public resume page instead."
    });
  }
};
