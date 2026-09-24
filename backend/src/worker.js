/* M4L V105.2 - Program timetable building alongside existing Reboot and Global Course paths.
   The Cloudflare runtime entrypoint exports this fetch handler and the coordinator.
*/
import { corsResponse, json } from "./lib/http.js";
import { routeRequest } from "./router.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === "OPTIONS") {
        return corsResponse();
      }

      if (url.pathname === "/") {
        return json({
          success: true,
          service: "rebootworker",
          version: "105.3.1"
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
