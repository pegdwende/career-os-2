const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const root = path.join(__dirname, "..");
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveStatic(req, res, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(root, relativePath));
  if (!filePath.startsWith(root)) {
    return send(res, 403, { "content-type": "text/plain; charset=utf-8" }, "Forbidden");
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return send(res, 404, { "content-type": "text/plain; charset=utf-8" }, "Not found");
  }
  const extension = path.extname(filePath);
  return send(res, 200, { "content-type": contentTypes[extension] || "application/octet-stream" }, fs.readFileSync(filePath));
}

async function serveApi(req, res, pathname) {
  const requestedName = pathname.replace(/^\/api\//, "");
  const apiName = requestedName.endsWith(".js") ? requestedName : `${requestedName}.js`;
  if (!/^[a-zA-Z0-9_-]+\.js$/.test(apiName)) {
    return send(res, 404, { "content-type": "application/json; charset=utf-8" }, JSON.stringify({ error: "Not found" }));
  }

  const handlerPath = path.join(root, "api", apiName);
  if (!fs.existsSync(handlerPath)) {
    return send(res, 404, { "content-type": "application/json; charset=utf-8" }, JSON.stringify({ error: "Not found" }));
  }

  const bodyText = await readBody(req);
  if (bodyText) {
    try {
      req.body = JSON.parse(bodyText);
    } catch {
      req.body = bodyText;
    }
  }

  delete require.cache[require.resolve(handlerPath)];
  const handler = require(handlerPath);
  return handler(req, res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    serveApi(req, res, url.pathname).catch((error) => {
      console.error(error);
      send(res, 500, { "content-type": "application/json; charset=utf-8" }, JSON.stringify({ error: "Local API error" }));
    });
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(port, () => {
  console.log(`Local portfolio server listening on http://localhost:${port}`);
});
