const { createSessionCookie } = require("./_admin-auth");
const { registerInvitedUser } = require("./_admin-users");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
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
    const user = await registerInvitedUser({
      email: body.email,
      password: body.password,
      inviteToken: body.inviteToken
    });
    res.setHeader("set-cookie", createSessionCookie(user));
    return json(res, 200, { ok: true, user });
  } catch (error) {
    if (error.code === "DATABASE_NOT_CONFIGURED") {
      return json(res, 503, { error: "Account database is not configured. Set Redis environment variables." });
    }
    if (error.code === "INVALID_INVITE" || error.code === "INVALID_ACCOUNT") {
      return json(res, 400, { error: error.message });
    }
    return json(res, 500, { error: "Registration failed. Check configuration and try again." });
  }
};
