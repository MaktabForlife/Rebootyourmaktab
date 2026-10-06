import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { onRequestGet } from "../../functions/pdf-file/[encoded].js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function encodeUrl(value) {
  return Buffer.from(String(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function callProxy(targetUrl, { range = "" } = {}) {
  const encoded = encodeUrl(targetUrl);
  const headers = new Headers();
  if (range) headers.set("Range", range);
  const request = new Request(`https://developmentmaktab4life.pages.dev/pdf-file/${encoded}`, { headers });
  return onRequestGet({ request, params: { encoded } });
}

const originalFetch = globalThis.fetch;
let fetchCalls = [];
let responseStatus = 200;

globalThis.fetch = async (url, options = {}) => {
  fetchCalls.push({ url: String(url), options });
  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Length": "4",
    "Content-Range": "bytes 0-3/4",
    "Accept-Ranges": "bytes",
    "Set-Cookie": "upstream=1"
  });
  return new Response(new Uint8Array([1, 2, 3, 4]), {
    status: options.headers?.get?.("Range") ? 206 : responseStatus,
    headers
  });
};

try {
  const devUrl = "https://devrebootworker.maktab4life.workers.dev/api/library/drive/file/FILE_123?access=signed-token";
  const devResponse = await callProxy(devUrl, { range: "bytes=0-3" });
  assert.equal(devResponse.status, 206);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, devUrl);
  assert.equal(fetchCalls[0].options.headers.get("Range"), "bytes=0-3");
  assert.match(devResponse.headers.get("Cache-Control") || "", /private/i);
  assert.match(devResponse.headers.get("Cache-Control") || "", /no-store/i);
  assert.equal(devResponse.headers.get("Content-Type"), "application/pdf");
  assert.equal(devResponse.headers.get("Set-Cookie"), null);

  fetchCalls = [];
  const prodUrl = "https://api.rebootyourmaktab.maktabhelper.app/api/library/drive/file/FILE_456?access=signed-token";
  const prodResponse = await callProxy(prodUrl);
  assert.equal(prodResponse.status, 200);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, prodUrl);

  fetchCalls = [];
  const unsignedResponse = await callProxy(
    "https://devrebootworker.maktab4life.workers.dev/api/library/drive/file/FILE_123"
  );
  assert.equal(unsignedResponse.status, 403);
  assert.equal(fetchCalls.length, 0);

  fetchCalls = [];
  const unrelatedWorkerResponse = await callProxy(
    "https://other-worker.example.workers.dev/api/library/drive/file/FILE_123?access=signed-token"
  );
  assert.equal(unrelatedWorkerResponse.status, 403);
  assert.equal(fetchCalls.length, 0);

  fetchCalls = [];
  const duasUrl = "https://talimiboardkzn.org/wp-content/uploads/2018/10/essential_duas_for_muslims_gr_1-7.pdf";
  const duasResponse = await callProxy(duasUrl, { range: "bytes=0-3" });
  assert.equal(duasResponse.status, 206);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, duasUrl);
  assert.equal(fetchCalls[0].options.headers.get("Range"), "bytes=0-3");
  assert.equal(fetchCalls[0].options.redirect, "manual");
  assert.match(duasResponse.headers.get("Cache-Control") || "", /no-store/i);

  responseStatus = 302;
  assert.equal((await callProxy(duasUrl)).status, 502);
  responseStatus = 200;

  fetchCalls = [];
  for (const url of [
    "https://talimiboardkzn.org/wp-content/uploads/2018/10/another-book.pdf",
    "https://talimiboardkzn.org.evil.example/wp-content/uploads/2018/10/essential_duas_for_muslims_gr_1-7.pdf",
    `${duasUrl}?next=1`
  ]) {
    assert.equal((await callProxy(url)).status, 403);
  }
  assert.equal(fetchCalls.length, 0);

  const resourceSource = fs.readFileSync(path.join(repoRoot, "js/m4l-resources.js"), "utf8");
  assert.match(resourceSource, /return `\/pdf-file\/\$\{base64UrlEncode\(cleanLink\)\}`;/);
  assert.doesNotMatch(
    resourceSource,
    /isPrivateDriveResourceLink\(cleanLink\)[\s\S]{0,120}encodeURIComponent\(cleanLink\)/
  );

  console.log("pdf-private-drive-proxy.test.mjs: PASS");
} finally {
  globalThis.fetch = originalFetch;
}
