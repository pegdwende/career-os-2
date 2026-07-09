const { getSession } = require("../../api/_admin-auth");
const { createInvite } = require("../../api/_admin-users");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  const session = getSession(req);
  if (!session) return json(res, 401, { error: "Admin login required." });
  if (session.role !== "owner") return json(res, 403, { error: "Owner access required." });

  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const invite = await createInvite(session.userId);
    const origin = req.headers["x-forwarded-host"]
      ? `https://${req.headers["x-forwarded-host"]}`
      : "";
    return json(res, 200, {
      inviteToken: invite.token,
      inviteUrl: `${origin}/admin.html?invite=${encodeURIComponent(invite.token)}`,
      expiresInSeconds: invite.expiresInSeconds
    });
  } catch (error) {
    if (error.code === "DATABASE_NOT_CONFIGURED") {
      return json(res, 503, { error: "Invite database is not configured. Set Redis environment variables." });
    }
    return json(res, 500, { error: "Invite creation failed. Check configuration and try again." });
  }
};
