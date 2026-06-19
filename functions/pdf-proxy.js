export async function onRequestGet(context) {
  const request = context.request;
  const requestUrl = new URL(request.url);
  const targetUrlRaw = requestUrl.searchParams.get("url");

  if (!targetUrlRaw) {
    return new Response("Missing url parameter", { status: 400 });
  }

  let targetUrl;

  try {
    targetUrl = new URL(targetUrlRaw);
  } catch (err) {
    return new Response("Invalid URL", { status: 400 });
  }

  if (!["https:", "http:"].includes(targetUrl.protocol)) {
    return new Response("Only http and https URLs are allowed", { status: 400 });
  }

  const hostname = targetUrl.hostname.toLowerCase();

  const allowed =
    hostname.endsWith(".r2.dev") ||
    hostname === "drive.google.com" ||
    hostname === "docs.google.com" ||
    hostname === "lh3.googleusercontent.com";

  if (!allowed) {
    return new Response("PDF host not allowed", { status: 403 });
  }

  // Convert common Google Drive share links to a direct-download style URL.
  targetUrl = normaliseGoogleDriveUrl(targetUrl);

  const fetchHeaders = new Headers();

  // Important for PDF.js page-by-page loading.
  const range = request.headers.get("Range");
  if (range) {
    fetchHeaders.set("Range", range);
  }

  const upstreamResponse = await fetch(targetUrl.toString(), {
    method: "GET",
    headers: fetchHeaders
  });

  if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
    return new Response(
      `Could not fetch PDF. Upstream status: ${upstreamResponse.status}`,
      { status: upstreamResponse.status }
    );
  }

  const responseHeaders = new Headers();

  responseHeaders.set(
    "Content-Type",
    upstreamResponse.headers.get("Content-Type") || "application/pdf"
  );

  responseHeaders.set("Cache-Control", "public, max-age=3600");
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Accept-Ranges", "bytes");

  copyHeader(upstreamResponse.headers, responseHeaders, "Content-Length");
  copyHeader(upstreamResponse.headers, responseHeaders, "Content-Range");
  copyHeader(upstreamResponse.headers, responseHeaders, "Last-Modified");
  copyHeader(upstreamResponse.headers, responseHeaders, "ETag");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders
  });
}

function copyHeader(fromHeaders, toHeaders, name) {
  const value = fromHeaders.get(name);
  if (value) {
    toHeaders.set(name, value);
  }
}

function normaliseGoogleDriveUrl(url) {
  const hostname = url.hostname.toLowerCase();

  if (hostname !== "drive.google.com" && hostname !== "docs.google.com") {
    return url;
  }

  // Handles: https://drive.google.com/file/d/FILE_ID/view
  const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
  if (fileMatch && fileMatch[1]) {
    return new URL(`https://drive.google.com/uc?export=download&id=${fileMatch[1]}`);
  }

  // Handles: https://drive.google.com/open?id=FILE_ID
  const openId = url.searchParams.get("id");
  if (openId) {
    return new URL(`https://drive.google.com/uc?export=download&id=${openId}`);
  }

  return url;
}