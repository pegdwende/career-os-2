const { getSession } = require("./_admin-auth");
const { loadJobs, saveJobs } = require("./_admin-store");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function errorResponse(res, error) {
  if (error.code === "DATABASE_NOT_CONFIGURED") {
    return json(res, 503, {
      error: "Encrypted job database is not configured. Set Redis and ADMIN_DATA_ENCRYPTION_KEY."
    });
  }
  if (error.code === "ENCRYPTION_NOT_CONFIGURED") {
    return json(res, 503, { error: "ADMIN_DATA_ENCRYPTION_KEY is not configured." });
  }
  if (error.code === "INVALID_JOBS") {
    return json(res, 400, { error: error.message });
  }
  return json(res, 500, { error: "Encrypted job database is temporarily unavailable." });
}

module.exports = async function handler(req, res) {
  const session = getSession(req);
  if (!session) return json(res, 401, { error: "Admin login required." });

  if (req.method === "GET") {
    try {
      const jobs = await loadJobs(session.userId);
      return json(res, 200, { jobs, encrypted: true });
    } catch (error) {
      return errorResponse(res, error);
    }
  }

  if (req.method === "PUT") {
    let body;
    try {
      body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    } catch {
      return json(res, 400, { error: "Invalid JSON payload." });
    }

    try {
      await saveJobs(session.userId, body.jobs);
      return json(res, 200, { ok: true, encrypted: true });
    } catch (error) {
      return errorResponse(res, error);
    }
  }

  res.setHeader("allow", "GET, PUT");
  return json(res, 405, { error: "Method not allowed" });
};
