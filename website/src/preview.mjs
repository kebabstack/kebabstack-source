import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};
const config = await readFile(path.join(root, "_headers"), "utf8");
const headers = Object.fromEntries(
  config
    .split("\n")
    .filter((line) => line.startsWith("  ") && !line.includes("Content-Type:"))
    .map((line) => {
      const split = line.indexOf(":");
      return [line.slice(0, split).trim(), line.slice(split + 1).trim()];
    }),
);
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://127.0.0.1").pathname,
    );
    if (
      pathname
        .split("/")
        .some((part) => part.startsWith(".") && part !== ".well-known") ||
      /\/(?:_headers|_redirects)$/.test(pathname)
    ) {
      res.writeHead(404, headers).end();
      return;
    }
    const candidate = path.resolve(root, "." + pathname);
    if (candidate !== root && !candidate.startsWith(root + path.sep)) {
      res.writeHead(403, headers).end();
      return;
    }
    let file = candidate;
    try {
      if ((await stat(file)).isDirectory())
        file = path.join(file, "index.html");
    } catch {
      file = path.join(root, "404.html");
    }
    const data = await readFile(file);
    res.writeHead(file === path.join(root, "404.html") ? 404 : 200, {
      ...headers,
      "Content-Type": types[path.extname(file)] || "text/plain; charset=utf-8",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(400, headers).end("Bad request");
  }
});
const port = Number(process.env.PORT || 4177);
server.listen(port, "127.0.0.1", () =>
  console.log(`kebabstack preview: http://127.0.0.1:${port}`),
);
