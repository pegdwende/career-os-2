const crypto = require("crypto");

const COOKIE_NAME = "career_admin_session";
const MAX_AGE_SECONDS = 8 * 60 * 60;

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSCODE || "";
}

function sign(value) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("hex");
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function encodeSession(session) {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

function decodeSession(payload) {
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function createSessionCookie(session = {}) {
  const created = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = encodeSession({
    created,
    nonce,
    userId: session.userId || session.id || "owner",
    email: session.email || "owner",
    role: session.role || "owner"
  });
  const token = `${payload}.${sign(payload)}`;
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE_SECONDS}`;
}

function parseCookies(header) {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index), part.slice(index + 1)];
      })
  );
}

function getSession(req) {
  const secret = getSecret();
  if (!secret) return null;

  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length === 3) {
    const [created, nonce, signature] = parts;
    const value = `${created}.${nonce}`;
    const ageMs = Date.now() - Number(created);
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > MAX_AGE_SECONDS * 1000) return null;
    if (!timingSafeEqual(signature, sign(value))) return null;
    return { userId: "owner", email: "owner", role: "owner" };
  }

  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!timingSafeEqual(signature, sign(payload))) return null;

  let session;
  try {
    session = decodeSession(payload);
  } catch {
    return null;
  }

  const ageMs = Date.now() - Number(session.created);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > MAX_AGE_SECONDS * 1000) return null;

  return {
    userId: String(session.userId || "owner"),
    email: String(session.email || "owner"),
    role: session.role === "owner" ? "owner" : "member"
  };
}

function isAuthenticated(req) {
  return Boolean(getSession(req));
}

function passcodeMatches(passcode) {
  const configured = process.env.ADMIN_PASSCODE || "";
  if (!configured || !passcode) return false;
  return timingSafeEqual(passcode, configured);
}

module.exports = {
  createSessionCookie,
  getSession,
  isAuthenticated,
  passcodeMatches
};
