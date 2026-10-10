/* M4L V105.2 - Program timetable building alongside existing Reboot and Global Course paths.
   The Cloudflare runtime entrypoint exports this fetch handler and the coordinator.
*/
import { corsResponse, json } from "./lib/http.js";
import { routeRequest } from "./router.js";
import academyD1Worker from "./academy/d1/worker.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // The complete request stays in one store. Rehearsal and reviewed activation
    // use this entrypoint; unmigrated operations must never reach Sheets.
    if (["REHEARSAL", "ACTIVE"].includes(env.ACADEMY_D1_MODE)) {
      return academyD1Worker.fetch(request, env);
    }
    if (env.ACADEMY_D1_MODE === "PAUSED") {
      const response=json({ success: false, error: "Academy is temporarily paused for maintenance. Please try again shortly.",
        code: "ACADEMY_STORAGE_PAUSED", retryable: true }, 503);
      response.headers.set('Retry-After','60');return response;
    }
    if (env.ACADEMY_D1_MODE && env.ACADEMY_D1_MODE !== "OFF") {
      return json({ success: false, error: "Academy storage configuration is unavailable.",
        code: "ACADEMY_STORAGE_MODE_INVALID", retryable: false }, 503);
    }

    try {
      if (request.method === "OPTIONS") {
        return corsResponse();
      }

      if (url.pathname === "/") {
        return json({
          success: true,
          service: "rebootworker",
          version: "106.3"
        });
      }

      // Await the route inside this try block. Returning its promise directly
      // would let an asynchronous route rejection bypass the JSON/CORS error
      // response below and surface as an opaque Cloudflare 500 in browsers.
      const routedResponse = await routeRequest(request, env, url.pathname);

      if (routedResponse) {
        return routedResponse;
      }

      return json({ success: false, error: "Not found" }, 404);
    } catch (err) {
      // Deliberately return no exception detail. Authentication requests may contain
      // sensitive values, so request bodies, PINs and hashes are never echoed or logged.
      return json({
        success: false,
        error: "Worker error"
      }, 500);
    }
  }
};
