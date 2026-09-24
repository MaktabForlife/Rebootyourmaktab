/* M4L V105.2 - Program setup is a Worker-native service. */
export const BACKEND_APPS_SCRIPT = "apps-script";
export const BACKEND_GOOGLE_SHEETS = "google-sheets";
export const BACKEND_WORKER = "worker";

/*
 * V100.5 final backend ownership.
 *
 * The V98 migration switches are retired. Backend ownership is now fixed in
 * code so stale or accidentally re-created M4L_BACKEND_* selector variables
 * cannot change routing:
 * - application data routes -> Google Sheets
 * - Weekly Planner PNG-to-Drive bridge -> Apps Script
 * - Worker-native services -> Worker
 *
 * M4L_BACKEND_ROUTING_LOGS remains an optional diagnostics/logging toggle; it
 * is not a backend selector.
 */
const FEATURE_DEFINITIONS = Object.freeze({
  auth: defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "attendance-read": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "attendance-write": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  resources: defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "resource-management": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "drive-library": defineFixedFeature(BACKEND_WORKER),
  "timetable-read": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "timetable-write": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "timetable-builder": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "student-management-read": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "student-management-write": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "student-management-update": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "admin-management-read": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "admin-management-write": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "admin-management-update": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "curriculum-read": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "curriculum-write": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "curriculum-resources-read": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "curriculum-resources-write": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "task-assignment-read": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "task-assignment-write": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "progress-read": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "progress-write": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "system-settings": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "weekly-planner": defineFixedFeature(BACKEND_GOOGLE_SHEETS),
  "weekly-planner-drive": defineFixedFeature(BACKEND_APPS_SCRIPT),
  "platform-validation": defineFixedFeature(BACKEND_WORKER),
  "platform-account-migration": defineFixedFeature(BACKEND_WORKER),
  "platform-identity-link": defineFixedFeature(BACKEND_WORKER),
  "platform-global-management": defineFixedFeature(BACKEND_WORKER),
  "platform-global-timetable": defineFixedFeature(BACKEND_WORKER),
  "program-builder": defineFixedFeature(BACKEND_WORKER),
  "program-timetable": defineFixedFeature(BACKEND_WORKER),
  "account-auth": defineFixedFeature(BACKEND_WORKER),
  "academy-timetable": defineFixedFeature(BACKEND_WORKER),
  "academy-calendar": defineFixedFeature(BACKEND_WORKER),
  "account-library-catalogue": defineFixedFeature(BACKEND_WORKER),
  "account-library-access": defineFixedFeature(BACKEND_WORKER),
  routing: defineFixedFeature(BACKEND_WORKER)
});

export function getBackendSelection(_env = {}, feature) {
  const definition = FEATURE_DEFINITIONS[feature];

  if (!definition) {
    return {
      valid: false,
      feature,
      backend: "",
      requestedBackend: "",
      source: "unknown-feature",
      envVar: "",
      defaultBackend: "",
      availableBackends: [],
      error: `Unknown backend feature: ${feature}`
    };
  }

  return {
    valid: true,
    feature,
    backend: definition.backend,
    requestedBackend: definition.backend,
    source: "fixed",
    envVar: "",
    defaultBackend: definition.backend,
    availableBackends: [definition.backend]
  };
}

export function getBackendRoutingDiagnostics(env = {}) {
  const features = {};

  Object.keys(FEATURE_DEFINITIONS)
    .filter(feature => feature !== "routing")
    .forEach(feature => {
      const selection = getBackendSelection(env, feature);
      features[feature] = {
        valid: selection.valid,
        backend: selection.backend,
        source: selection.source,
        envVar: selection.envVar,
        defaultBackend: selection.defaultBackend,
        availableBackends: selection.availableBackends,
        ...(selection.error ? { error: selection.error } : {})
      };
    });

  return {
    features,
    routingLogsEnabled: shouldLogBackendRouting(env)
  };
}

export function shouldLogBackendRouting(env = {}) {
  const value = String(env?.M4L_BACKEND_ROUTING_LOGS || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

function defineFixedFeature(backend) {
  return Object.freeze({ backend });
}
