const crypto = require("crypto");

const MAX_JOBS = 500;
const MAX_JOBS_BYTES = 2_000_000;
const MAX_PROFILE_BYTES = 250_000;

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function redisCommand(command) {
  const config = getRedisConfig();
  if (!config) {
    const error = new Error("Encrypted job database is not configured.");
    error.code = "DATABASE_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify([command])
  });

  if (!response.ok) throw new Error(`Redis command failed with ${response.status}`);
  const [result] = await response.json();
  if (result?.error) throw new Error("Redis command failed");
  return result?.result;
}

function jobsKey(userId = "owner") {
  return `admin:jobs:${String(userId || "owner").replace(/[^a-zA-Z0-9_-]/g, "_")}:v1`;
}

function profileKey(userId = "owner") {
  return `admin:profile:${String(userId || "owner").replace(/[^a-zA-Z0-9_-]/g, "_")}:v1`;
}

function getEncryptionSecret() {
  return process.env.ADMIN_DATA_ENCRYPTION_KEY || "";
}

function getEncryptionKey() {
  const secret = getEncryptionSecret();
  if (!secret) {
    const error = new Error("ADMIN_DATA_ENCRYPTION_KEY is not configured.");
    error.code = "ENCRYPTION_NOT_CONFIGURED";
    throw error;
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptJson(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptJson(payload) {
  if (!payload) return [];
  const [version, ivText, tagText, encryptedText] = String(payload).split(".");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    throw new Error("Encrypted payload is invalid.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivText, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

function validateJobs(jobs) {
  if (!Array.isArray(jobs)) {
    const error = new Error("Jobs payload must be an array.");
    error.code = "INVALID_JOBS";
    throw error;
  }
  if (jobs.length > MAX_JOBS) {
    const error = new Error(`Keep the tracker under ${MAX_JOBS} jobs.`);
    error.code = "INVALID_JOBS";
    throw error;
  }

  const serialized = JSON.stringify(jobs);
  if (Buffer.byteLength(serialized, "utf8") > MAX_JOBS_BYTES) {
    const error = new Error("Jobs payload is too large.");
    error.code = "INVALID_JOBS";
    throw error;
  }
  return jobs;
}

function validateProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    const error = new Error("Profile payload must be an object.");
    error.code = "INVALID_PROFILE";
    throw error;
  }

  const normalized = {
    headline: String(profile.headline || "").slice(0, 240),
    summary: String(profile.summary || "").slice(0, 8000),
    skills: String(profile.skills || "").slice(0, 12000),
    experience: String(profile.experience || "").slice(0, 40000),
    projects: String(profile.projects || "").slice(0, 30000),
    metrics: String(profile.metrics || "").slice(0, 12000),
    constraints: String(profile.constraints || "").slice(0, 12000),
    updatedAt: new Date().toISOString()
  };

  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > MAX_PROFILE_BYTES) {
    const error = new Error("Profile payload is too large.");
    error.code = "INVALID_PROFILE";
    throw error;
  }
  return normalized;
}

async function loadJobs(userId = "owner") {
  const encrypted = await redisCommand(["GET", jobsKey(userId)]);
  return validateJobs(decryptJson(encrypted));
}

async function saveJobs(userId = "owner", jobs) {
  const validated = validateJobs(jobs);
  await redisCommand(["SET", jobsKey(userId), encryptJson(validated)]);
}

async function loadProfile(userId = "owner") {
  const encrypted = await redisCommand(["GET", profileKey(userId)]);
  if (!encrypted) return null;
  return validateProfile(decryptJson(encrypted));
}

async function saveProfile(userId = "owner", profile) {
  const validated = validateProfile(profile);
  await redisCommand(["SET", profileKey(userId), encryptJson(validated)]);
  return validated;
}

module.exports = {
  decryptJson,
  encryptJson,
  loadJobs,
  loadProfile,
  redisCommand,
  saveJobs,
  saveProfile,
  validateJobs
};
