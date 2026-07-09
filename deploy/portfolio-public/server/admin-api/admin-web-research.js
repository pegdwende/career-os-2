const { isAuthenticated } = require("../../api/_admin-auth");

const MAX_QUERY_LENGTH = 220;
const MAX_RESULTS = 6;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function normalizeResult(result) {
  return {
    title: String(result.title || result.name || "").slice(0, 180),
    url: String(result.url || result.link || "").slice(0, 500),
    snippet: String(result.content || result.snippet || result.description || "").slice(0, 1000)
  };
}

async function searchTavily(query) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: "basic",
      max_results: MAX_RESULTS,
      include_answer: false
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Tavily search failed.");
  return (payload.results || []).map(normalizeResult).filter((item) => item.url);
}

async function searchBrave(query) {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(MAX_RESULTS));
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "x-subscription-token": process.env.BRAVE_SEARCH_API_KEY
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.detail || "Brave search failed.");
  return (payload.web?.results || []).map(normalizeResult).filter((item) => item.url);
}

async function webSearch(query) {
  if (process.env.TAVILY_API_KEY) return { provider: "tavily", results: await searchTavily(query) };
  if (process.env.BRAVE_SEARCH_API_KEY) return { provider: "brave", results: await searchBrave(query) };
  const error = new Error("Configure TAVILY_API_KEY or BRAVE_SEARCH_API_KEY to use web research.");
  error.code = "WEB_SEARCH_NOT_CONFIGURED";
  throw error;
}

function buildMarkdown({ company, role, query, provider, results }) {
  const sourceLines = results
    .map((item, index) => `${index + 1}. [${item.title || item.url}](${item.url})\n   ${item.snippet || "No snippet provided."}`)
    .join("\n\n");

  return `## Web Research Sources

Company: ${company || "Unknown"}
Role: ${role || "Unknown"}
Query: ${query}
Provider: ${provider}
Researched: ${new Date().toISOString()}

${sourceLines || "No sources returned."}

## Notes

Use these sources as leads. Verify important interview reports manually before treating them as confirmed.`;
}

module.exports = async function handler(req, res) {
  if (!isAuthenticated(req)) return json(res, 401, { error: "Admin login required." });

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

  const company = String(body.company || "").slice(0, 120);
  const role = String(body.role || "").slice(0, 160);
  const query = String(body.query || `${company} ${role} interview questions engineering`).trim().slice(0, MAX_QUERY_LENGTH);
  if (!query) return json(res, 400, { error: "Enter a web research query." });

  try {
    const { provider, results } = await webSearch(query);
    return json(res, 200, {
      provider,
      query,
      results,
      markdown: buildMarkdown({ company, role, query, provider, results })
    });
  } catch (error) {
    if (error.code === "WEB_SEARCH_NOT_CONFIGURED") return json(res, 503, { error: error.message });
    return json(res, 500, { error: "Web research failed. Check search provider configuration and try again." });
  }
};
