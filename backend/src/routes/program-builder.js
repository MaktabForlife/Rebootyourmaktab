/* M4L V105.1 - Platform-only Program setup endpoints. */
import { getAuthUser } from "../lib/auth.js";
import { json } from "../lib/http.js";
import { problem } from "../programs/model.js";
import { programService } from "../programs/service.js";
import { sheetsProgramRepository } from "../programs/sheets-repository.js";

export function programEndpoint(operation) {
  return async (request, env) => {
    if (request.method !== "POST") return json({ success: false, error: "Use POST for Program setup." }, 405);
    try {
      const user = await getAuthUser(request, env);
      if (!user) return json({ success: false, error: "Sign in through your personal Academy account link." }, 401);
      // getAuthUser revalidates central account authority on every request.
      // A local ADMIN token or scoped ADMIN membership is never sufficient.
      if (user.type !== "account" || user.role !== "GLOBAL_ADMIN") {
        return json({ success: false, error: "Program setup requires a platform GLOBAL_ADMIN account." }, 403);
      }
      const bytes = await readSmallBody(request);
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes) || "{}"); }
      catch { return json({ success: false, error: "Invalid JSON request." }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ success: false, error: "Invalid Program request." }, 400);
      const service = programService(sheetsProgramRepository(env));
      const result = operation === "list" ? await service.list()
        : operation === "create" ? await service.create(body, user)
        : operation === "save" ? await service.save(body, user)
        : await service.readiness(body.id, operation === "prepare");
      return json({ success: true, ...result });
    } catch (error) {
      return json({ success: false, error: error.publicMessage || "Program setup could not reach or validate its spreadsheets. Check backend sharing and Platform configuration, then retry." }, error.publicMessage ? error.status : 503);
    }
  };
}

async function readSmallBody(request) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 8192) { await reader.cancel(); throw problem("Program request is too large.", 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
