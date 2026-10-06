export async function onRequestGet(context) {
  const encoded = context.params.encoded;

  if (!encoded) {
    return new Response("Missing encoded URL", { status: 400 });
  }

  let targetUrlRaw;

  try {
    targetUrlRaw = base64UrlDecode(encoded);
  } catch (err) {
    return new Response("Invalid encoded URL", { status: 400 });
  }

  let targetUrl;

  try {
    targetUrl = new URL(targetUrlRaw);
  } catch (err) {
    return new Response("Invalid target URL", { status: 400 });
  }

  if (targetUrl.protocol !== "https:") {
    return new Response("Only https URLs are allowed", { status: 400 });
  }

  const hostname = targetUrl.hostname.toLowerCase();
  const isPrivateM4LDriveUrl = isAllowedPrivateM4LDriveUrl(targetUrl);
  const isTalimiboardDuas = isAllowedTalimiboardDuasUrl(targetUrl);

  const allowed =
    hostname.endsWith(".r2.dev") ||
    hostname === "drive.google.com" ||
    hostname === "docs.google.com" ||
    hostname === "lh3.googleusercontent.com" ||
    isPrivateM4LDriveUrl ||
    isTalimiboardDuas;

  if (!allowed) {
    return new Response("PDF host not allowed", { status: 403 });
  }

  targetUrl = normaliseGoogleDriveUrl(targetUrl);

  const upstreamHeaders = new Headers();

  const range = context.request.headers.get("Range");
  if (range) {
    upstreamHeaders.set("Range", range);
  }

  const upstreamResponse = await fetch(targetUrl.toString(), {
    method: "GET",
    headers: upstreamHeaders,
    redirect: isTalimiboardDuas ? "manual" : "follow"
  });

  if (isTalimiboardDuas && upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
    return new Response("The source PDF is unavailable", { status: 502 });
  }

  const responseHeaders = new Headers(upstreamResponse.headers);

  responseHeaders.delete("Set-Cookie");

  responseHeaders.set("Content-Type", "application/pdf");
  responseHeaders.set("Content-Disposition", "inline; filename=\"resource.pdf\"");
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set(
    "Cache-Control",
    isPrivateM4LDriveUrl || isTalimiboardDuas ? "private, no-store, max-age=0" : "public, max-age=3600"
  );
  responseHeaders.set("Accept-Ranges", "bytes");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders
  });
}

function base64UrlDecode(input) {
  let base64 = String(input || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (base64.length % 4) {
    base64 += "=";
  }

  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

const PRIVATE_M4L_DRIVE_HOSTS = new Set([
  "devrebootworker.maktab4life.workers.dev",
  "api.rebootyourmaktab.maktabhelper.app"
]);

function isAllowedTalimiboardDuasUrl(url) {
  return url.hostname.toLowerCase() === "talimiboardkzn.org" &&
    url.pathname === "/wp-content/uploads/2018/10/essential_duas_for_muslims_gr_1-7.pdf" &&
    !url.search && !url.hash;
}

function isAllowedPrivateM4LDriveUrl(url) {
  if (!url || !PRIVATE_M4L_DRIVE_HOSTS.has(url.hostname.toLowerCase())) {
    return false;
  }

  if (!/^\/api\/library\/drive\/file\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
    return false;
  }

  return !!url.searchParams.get("access");
}

function normaliseGoogleDriveUrl(url) {
  const hostname = url.hostname.toLowerCase();

  if (hostname !== "drive.google.com" && hostname !== "docs.google.com") {
    return url;
  }

  const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
  if (fileMatch && fileMatch[1]) {
    return new URL(`https://drive.google.com/uc?export=download&id=${fileMatch[1]}`);
  }

  const openId = url.searchParams.get("id");
  if (openId) {
    return new URL(`https://drive.google.com/uc?export=download&id=${openId}`);
  }

  return url;
}
