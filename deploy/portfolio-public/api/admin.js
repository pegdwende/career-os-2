const handlers = {
  health: require("../server/admin-api/admin-health"),
  invites: require("../server/admin-api/admin-invites"),
  jobs: require("../server/admin-api/admin-jobs"),
  login: require("../server/admin-api/admin-login"),
  me: require("../server/admin-api/admin-me"),
  prep: require("../server/admin-api/admin-prep"),
  profile: require("../server/admin-api/admin-profile"),
  register: require("../server/admin-api/admin-register"),
  research: require("../server/admin-api/admin-research"),
  tailor: require("../server/admin-api/admin-tailor"),
  "web-research": require("../server/admin-api/admin-web-research")
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url || "/api/admin", `http://${req.headers.host || "localhost"}`);
  const action = url.searchParams.get("action") || "";
  const target = handlers[action];

  if (!target) {
    return json(res, 404, { error: "Admin action not found." });
  }

  return target(req, res);
};
