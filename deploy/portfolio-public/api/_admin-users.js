const crypto = require("crypto");
const { redisCommand } = require("./_admin-store");

const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MIN_PASSWORD_LENGTH = 12;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function sha(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function userIdForEmail(email) {
  return `user_${sha(normalizeEmail(email)).slice(0, 24)}`;
}

function emailKey(email) {
  return `admin:user-email:${sha(normalizeEmail(email))}`;
}

function userKey(userId) {
  return `admin:user:${userId}`;
}

function inviteKey(token) {
  return `admin:invite:${sha(token)}`;
}

function validateEmail(email) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    const error = new Error("Enter a valid email address.");
    error.code = "INVALID_ACCOUNT";
    throw error;
  }
  return normalized;
}

function validatePassword(password) {
  const value = String(password || "");
  if (value.length < MIN_PASSWORD_LENGTH) {
    const error = new Error(`Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`);
    error.code = "INVALID_ACCOUNT";
    throw error;
  }
  return value;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256").toString("base64url");
  return `pbkdf2_sha256$310000$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [algorithm, iterationsText, salt, expected] = String(stored || "").split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterationsText || !salt || !expected) return false;
  const actual = crypto
    .pbkdf2Sync(String(password || ""), salt, Number(iterationsText), 32, "sha256")
    .toString("base64url");
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

async function createInvite(createdBy) {
  const token = crypto.randomBytes(24).toString("base64url");
  const now = new Date().toISOString();
  const invite = {
    tokenHash: sha(token),
    createdAt: now,
    createdBy: createdBy || "owner"
  };
  await redisCommand(["SET", inviteKey(token), JSON.stringify(invite), "EX", INVITE_TTL_SECONDS]);
  return {
    token,
    expiresInSeconds: INVITE_TTL_SECONDS,
    createdAt: now
  };
}

async function registerInvitedUser({ email, password, inviteToken }) {
  const normalizedEmail = validateEmail(email);
  const validPassword = validatePassword(password);
  const token = String(inviteToken || "").trim();
  if (!token) {
    const error = new Error("Invite code is required.");
    error.code = "INVALID_INVITE";
    throw error;
  }

  const invite = await redisCommand(["GET", inviteKey(token)]);
  if (!invite) {
    const error = new Error("Invite code is invalid or expired.");
    error.code = "INVALID_INVITE";
    throw error;
  }

  const existing = await redisCommand(["GET", emailKey(normalizedEmail)]);
  if (existing) {
    const error = new Error("An account already exists for this email.");
    error.code = "INVALID_ACCOUNT";
    throw error;
  }

  const user = {
    id: userIdForEmail(normalizedEmail),
    email: normalizedEmail,
    role: "member",
    passwordHash: hashPassword(validPassword),
    createdAt: new Date().toISOString()
  };

  await redisCommand(["SET", userKey(user.id), JSON.stringify(user)]);
  await redisCommand(["SET", emailKey(normalizedEmail), user.id]);
  await redisCommand(["DEL", inviteKey(token)]);
  return publicUser(user);
}

async function authenticateUser(email, password) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) return null;
  const userId = await redisCommand(["GET", emailKey(normalizedEmail)]);
  if (!userId) return null;
  const rawUser = await redisCommand(["GET", userKey(userId)]);
  if (!rawUser) return null;
  const user = JSON.parse(rawUser);
  if (!verifyPassword(password, user.passwordHash)) return null;
  return publicUser(user);
}

module.exports = {
  authenticateUser,
  createInvite,
  registerInvitedUser
};
