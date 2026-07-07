const { getSession } = require("./_admin-auth");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    return json(res, 405, { error: "Method not allowed" });
  }

  const session = getSession(req);
  if (!session) return json(res, 401, { error: "Admin login required." });
  return json(res, 200, { user: session });
};
