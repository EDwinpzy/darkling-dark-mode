// Serves tests/fixtures over http so content scripts run on it (file:// is excluded by design).
// Usage: node tests/harness/serve.js [port]
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "fixtures");
const port = Number(process.argv[2] || 8765);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript", ".png": "image/png" };

http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    // /blocked.css simulates a CDN stylesheet the extension cannot read: it is served only to the
    // browser's own <link> request (Sec-Fetch-Dest: style) and refused to the extension's fetch.
    if (pathname === "/blocked.css" && req.headers["sec-fetch-dest"] !== "style") {
        res.writeHead(403); res.end("forbidden"); return;
    }
    const file = path.join(root, pathname);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end("not found"); return;
    }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`fixtures at http://127.0.0.1:${port}/`));
