import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const clientRoot = path.resolve(root, "dist", "client");
const serverEntry = path.resolve(root, "dist", "server", "index.js");
const args = process.argv.slice(2);

function argument(...names) {
  for (let index = 0; index < args.length; index += 1) {
    if (names.includes(args[index])) return args[index + 1];
  }
  return undefined;
}

const port = Number(argument("--port", "-p") ?? process.env.PORT ?? 3000);
const hostname = argument("--hostname", "--host", "-H") ?? process.env.HOST ?? "0.0.0.0";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
};

function safeFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const candidate = path.resolve(clientRoot, `.${decoded}`);
  return candidate === clientRoot || candidate.startsWith(`${clientRoot}${path.sep}`) ? candidate : null;
}

async function existingFile(pathname) {
  const candidate = safeFile(pathname);
  if (!candidate) return null;
  try {
    const details = await stat(candidate);
    return details.isFile() ? { candidate, details } : null;
  } catch {
    return null;
  }
}

function fileHeaders(filename, size) {
  const extension = path.extname(filename).toLowerCase();
  return {
    "content-type": contentTypes[extension] ?? "application/octet-stream",
    "content-length": String(size),
    "cache-control": filename.includes(`${path.sep}assets${path.sep}`)
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600",
  };
}

function writeNodeResponse(nodeResponse, status, headers, body) {
  nodeResponse.writeHead(status, Object.fromEntries(headers));
  if (body === null) {
    nodeResponse.end();
    return;
  }
  nodeResponse.end(body);
}

await access(serverEntry);
const { default: worker } = await import(`${pathToFileURL(serverEntry).href}?started=${Date.now()}`);

const assets = {
  async fetch(request) {
    const url = new URL(request.url);
    const file = await existingFile(url.pathname);
    if (!file) return new Response("Not found", { status: 404 });
    const bytes = await import("node:fs/promises").then(({ readFile }) => readFile(file.candidate));
    return new Response(bytes, { status: 200, headers: fileHeaders(file.candidate, file.details.size) });
  },
};

const server = createServer(async (request, response) => {
  try {
    const origin = `http://${request.headers.host ?? `${hostname}:${port}`}`;
    const url = new URL(request.url ?? "/", origin);
    const staticFile = url.pathname === "/" ? null : await existingFile(url.pathname);
    if (staticFile) {
      response.writeHead(200, fileHeaders(staticFile.candidate, staticFile.details.size));
      if (request.method === "HEAD") response.end();
      else createReadStream(staticFile.candidate).pipe(response);
      return;
    }
    const method = request.method ?? "GET";
    const webRequest = new Request(url, {
      method,
      headers: request.headers,
      body: method === "GET" || method === "HEAD" ? undefined : request,
      ...(method === "GET" || method === "HEAD" ? {} : { duplex: "half" }),
    });
    const webResponse = await worker.fetch(
      webRequest,
      { ASSETS: assets },
      { waitUntil() {}, passThroughOnException() {} },
    );
    const body =
      method === "HEAD" || webResponse.body === null
        ? null
        : Buffer.from(await webResponse.arrayBuffer());
    writeNodeResponse(response, webResponse.status, webResponse.headers.entries(), body);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.stack ?? error.message : String(error));
  }
});

server.listen(port, hostname, () => {
  console.log(`Trailer Stability standalone server: http://${hostname}:${port}`);
});
