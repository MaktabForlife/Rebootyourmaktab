/* M4L V104.3 - Per-request identity + Google Sheets read context.
   The WeakMap is internal to the Worker isolate and cannot be populated by a
   request header, URL parameter or submitted CourseID. Google Sheets read
   state is attached only to a request-local environment wrapper so concurrent
   Worker requests never share Sheet data. */

const requestAuthUsers = new WeakMap();
const REQUEST_SHEETS_READ_CONTEXT = Symbol("m4l-request-sheets-read-context");
const REQUEST_SHEETS_METRICS = Symbol("m4l-request-sheets-metrics");

export function createRequestEnvironment(env) {
  const requestEnv = Object.create(env || null);
  Object.defineProperty(requestEnv, REQUEST_SHEETS_READ_CONTEXT, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: new Map()
  });
  Object.defineProperty(requestEnv, REQUEST_SHEETS_METRICS, {
    value: { readAttempts: 0, writeAttempts: 0, failedAttempts: 0,
      rateLimitedAttempts: 0, inFlight: 0, fetchMs: 0 }
  });
  return requestEnv;
}

// Count actual HTTP attempts, including retries; never retain URLs, ranges or credentials.
export function beginSheetsRequest(env, method) {
  const metrics = env?.[REQUEST_SHEETS_METRICS];
  if (!metrics) return () => {};
  metrics[method === 'GET' ? 'readAttempts' : 'writeAttempts']++;
  metrics.inFlight++;
  const started = Date.now();
  return status => {
    metrics.inFlight--;
    metrics.fetchMs += Math.max(0, Date.now() - started);
    if (!status || status >= 400) metrics.failedAttempts++;
    if (status === 429) metrics.rateLimitedAttempts++;
  };
}

export function sheetsRequestMetrics(env) {
  const metrics = env?.[REQUEST_SHEETS_METRICS];
  return metrics ? { ...metrics } : null;
}

export function getRequestSheetsReadContext(env) {
  if (!env || typeof env !== "object") return null;
  const context = env[REQUEST_SHEETS_READ_CONTEXT];
  return context instanceof Map ? context : null;
}

export function setRequestAuthUser(request, user) {
  if (request && typeof request === "object" && user && typeof user === "object") {
    requestAuthUsers.set(request, Object.freeze({ ...user }));
  }
}

export function getRequestAuthUser(request) {
  return request && typeof request === "object"
    ? requestAuthUsers.get(request) || null
    : null;
}
