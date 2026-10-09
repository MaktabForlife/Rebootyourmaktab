> Historical release note: the V105.4.3.14 changes below were rolled back in V105.4.3.15.

# Academy request efficiency · V105.4.3.14

## Immediate changes

- Initial browser `pageshow` no longer repeats the entrance load or saved-session validation. Returning from the browser's back/forward cache still refreshes them.
- Identical entrance calls with the same token and body share one in-flight request. Completed responses are not stored as a shared cache; later requests still read current data.
- Sheets quota failures return a clear service-busy message and a one-minute retry hint. Login keeps HTTP 503 with `SHEETS_RATE_LIMITED`; entrance failures return HTTP 429. Neither response includes credentials, upstream error details or a new session token.
- The Academy login and entrance clients pause their own retries for at least one minute after throttling. A partial timetable still displays available lessons and carries the same pause. A temporary saved-session validation failure retains the token for retry while hiding protected account controls.
- Backend Sheets reads stop after the first HTTP 429 instead of making up to three immediate attempts. Existing bounded retries for transient network failures and HTTP 5xx remain. Writes retain their existing single-attempt behaviour.

The client pause is local to each script in the current page. Reloading the page, another tab or a different client can still issue requests. Account validation and entrance loading are distinct requests; suppressing the initial browser event does not combine those endpoints. A session event received after an entrance request has completed can still refresh the entrance again. These changes reduce avoidable traffic without guaranteeing capacity for 100 simultaneous sign-ins.

## Request measurements

The Worker emits a structured `academy_request` log when `/api/account/check`, `/api/account/login`, `/api/account/session` or `/api/academy/entrance` completes or fails. Each record includes the route, HTTP status, total duration and request-local Sheets measurements:

| Field | Meaning |
| --- | --- |
| `readAttempts` | Actual Sheets GET attempts, including retries; one batch GET counts as one |
| `writeAttempts` | Actual Sheets write attempts |
| `failedAttempts` | Completed HTTP errors or failed network attempts |
| `rateLimitedAttempts` | Completed HTTP 429 attempts |
| `inFlight` | Attempts still pending when the route log is emitted |
| `fetchMs` | Sum of completed fetch timings; parallel fetch timings overlap |

OAuth token requests are excluded. Request-local cached reads do not increment these counts. Course environment wrappers share their parent request's metrics; different Worker requests do not share counters. Logs omit account IDs, PINs, tokens, request bodies, spreadsheet IDs and range names.

An early failure can leave concurrently started reads pending when the route returns; `inFlight` exposes that limitation, and their final outcomes are not included in that route snapshot. `fetchMs` is not the total page-load time and does not include response-body parsing.

## Verification and next measurements

All **106/106 regression test files passed**. Static checks also verified synchronized release markers, unique IDs and local assets across 13 pages, JavaScript syntax, preserved external links and unchanged historical release notes.

Regression checks exercise wrong-PIN responses, quota failures and recovery, preserved credentials without unverified access, initial versus back/forward page events, concurrent entrance calls, retry cooldown expiry, partial timetable failures, existing timetable room grouping and permission boundaries. Sheets client checks verify one attempt for HTTP 429 while retaining bounded 5xx/network retries. Metrics checks verify cache reuse, request isolation, course-wrapper inheritance and privacy.

The focused opening test changes one initial load plus an ordinary `pageshow` from two entrance calls to one. The Sheets quota test changes a rejected read from up to three immediate attempts to one. These are measured behaviours in regression fixtures, not a percentage reduction for a complete live sign-in or a capacity guarantee.

After deployment, collect successful and failed request counts and latency for visitor opening, saved-session opening, PIN login, Program opening and the active lesson refresh. Use those measurements to compare the Sheets implementation with the D1 migration and validate the complete flow at the observed 100-user lesson peak, with a 200-user test for headroom. No live peak-load test or migration is included in this release.
