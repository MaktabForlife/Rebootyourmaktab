/* M4L V105.1 - Program configuration service, independent of Sheets transport. */
import { PROGRAM_SCHEMA, CAPABILITIES, definition, spreadsheetId, programId, clean, key, problem, assertUnique } from "./model.js";
import { isActivePlatformValue } from "../lib/platform-schema.js";

export function programService(repository) {
  async function snapshot() {
    const [registry, definitions] = await Promise.all([repository.registry(), repository.definitions()]);
    assertUnique(registry, "CourseID", "Program registry");
    assertUnique(registry, "SpreadsheetID", "Program mappings");
    if (definitions) assertUnique(definitions, "CourseID", "Program definitions");
    for (const row of definitions || []) {
      if (!registry.some(item => key(item.CourseID) === key(row.CourseID) && item.SchemaVersion === PROGRAM_SCHEMA)) {
        throw problem("A Program definition has no matching registry entry. Resolve it before editing.", 409);
      }
    }
    return { registry, definitions };
  }
  function map(row, definitions) {
    const generic = row.SchemaVersion === PROGRAM_SCHEMA;
    if (!generic && String(row.SchemaVersion).includes("-program")) throw problem("This Program requires a different application schema version.", 409);
    const config = definitions?.find(item => key(item.CourseID) === key(row.CourseID));
    if (generic && (!config || isActivePlatformValue(row.Active))) {
      throw problem("A new Program has invalid configuration or was activated outside Program setup. Keep it inactive and repair its definition.", 409);
    }
    if (generic) {
      if (!["DRAFT", "ARCHIVED"].includes(config.Status)) throw problem("Program status is invalid.", 409);
      definition({ name: row.CourseName, durationYears: config.DurationYears, timezone: config.Timezone, status: config.Status });
      if (!clean(config.Revision)) throw problem("Program revision is missing.", 409);
    }
    return { id: row.CourseID, name: row.CourseName, spreadsheetId: row.SpreadsheetID,
      mode: generic ? "PROGRAM" : "LEGACY", active: isActivePlatformValue(row.Active),
      durationYears: config?.DurationYears ?? "", timezone: config?.Timezone || "",
      status: generic ? config.Status : (isActivePlatformValue(row.Active) ? "ACTIVE" : "INACTIVE"),
      revision: config?.Revision || "", capabilities: generic ? CAPABILITIES : null };
  }
  function select(data, id) {
    const row = data.registry.find(item => key(item.CourseID) === key(id));
    if (!row) throw problem("Program not found.", 404);
    const value = map(row, data.definitions);
    if (value.mode !== "PROGRAM") throw problem("Existing Programs remain in their current workspace until V106.", 409);
    return { row, value, config: data.definitions.find(item => key(item.CourseID) === key(id)) };
  }
  function assertTarget(target, id, allowEmpty) {
    if (target.identity.length === 1 && key(target.identity[0].CourseID) === key(id)
      && target.identity[0].SchemaVersion === PROGRAM_SCHEMA) return true;
    if (target.identity.length) throw problem("This spreadsheet belongs to a different Program or schema. No data was changed.", 409);
    if (target.titles.some(title => !["Setup", "Sheet1", "ProgramIdentity"].includes(title))) {
      throw problem("Use a separate empty Program spreadsheet. Existing operational tabs will not be changed.", 409);
    }
    if (!allowEmpty) throw problem("The Program spreadsheet needs preparation.", 409);
    return false;
  }
  const audit = (user, id, action, timestamp) => ({
    AuditID: `AUD-${crypto.randomUUID()}`, DateStamp: timestamp, AccountID: user.accountid,
    AccountName: user.username, Authority: "GLOBAL_ADMIN", CourseID: id, Action: action,
    RecordType: "PROGRAM", RecordID: id, ChangedFields: "CourseName,DurationYears,Timezone,Status"
  });
  return {
    async list() {
      const data = await snapshot();
      return { programs: data.registry.map(row => map(row, data.definitions)), platformPrepared: Boolean(data.definitions), capabilities: CAPABILITIES };
    },
    async create(input, user) {
      const config = definition(input);
      const id = programId(input.id);
      const sheet = spreadsheetId(input.spreadsheetId);
      if (repository.protectedIds.includes(sheet)) throw problem("The Platform and existing Reboot spreadsheets cannot be used for a new Program.", 409);
      const data = await snapshot();
      const existing = data.registry.find(row => key(row.CourseID) === key(id));
      if (existing) {
        const previous = map(existing, data.definitions);
        if (previous.spreadsheetId !== sheet || previous.name !== config.name || String(previous.durationYears) !== String(config.durationYears)
          || previous.timezone !== config.timezone || previous.status !== config.status) {
          throw problem("This draft was already saved with different values. Reload the Program list.", 409);
        }
        return { program: previous, replayed: true };
      }
      if (data.registry.some(row => row.SpreadsheetID === sheet)) throw problem("This spreadsheet is already registered to another Program.", 409);
      assertTarget(await repository.inspectTarget(sheet), id, true);
      await repository.preparePlatform();
      const timestamp = new Date().toISOString();
      const row = { CourseID: id, CourseName: config.name, SpreadsheetID: sheet, Active: false, SchemaVersion: PROGRAM_SCHEMA,
        CreatedDate: timestamp, CreatedByAccountID: user.accountid, CreatedByAccountName: user.username,
        ModifiedDate: timestamp, ModifiedByAccountID: user.accountid, ModifiedByAccountName: user.username };
      const record = { CourseID: id, DurationYears: config.durationYears, Timezone: config.timezone, Status: config.status,
        Revision: crypto.randomUUID(), ModifiedDate: timestamp, ModifiedByAccountID: user.accountid };
      await repository.commit(row, record, audit(user, id, "CREATE_PROGRAM", timestamp), true);
      return { program: map(row, [record]) };
    },
    async save(input, user) {
      const config = definition(input);
      const data = await snapshot();
      const current = select(data, input.id);
      if (input.spreadsheetId !== undefined && clean(input.spreadsheetId) !== current.value.spreadsheetId) {
        throw problem("Spreadsheet mappings are fixed. A migration must preserve all Program records; remapping is not supported here.", 409);
      }
      if (clean(input.revision) !== current.value.revision) throw problem("This Program changed since you opened it. Keep your edits, reload the latest values, then reapply them.", 409);
      const timestamp = new Date().toISOString();
      const row = { ...current.row, CourseName: config.name, ModifiedDate: timestamp, ModifiedByAccountID: user.accountid, ModifiedByAccountName: user.username };
      const record = { ...current.config, DurationYears: config.durationYears, Timezone: config.timezone, Status: config.status,
        Revision: crypto.randomUUID(), ModifiedDate: timestamp, ModifiedByAccountID: user.accountid };
      await repository.commit(row, record, audit(user, row.CourseID, "UPDATE_PROGRAM", timestamp), false);
      return { program: map(row, [record]) };
    },
    async readiness(id, prepare = false) {
      const current = select(await snapshot(), id);
      if (repository.protectedIds.includes(current.value.spreadsheetId)) throw problem("Invalid Program spreadsheet mapping.", 409);
      const target = await repository.inspectTarget(current.value.spreadsheetId);
      let prepared = assertTarget(target, current.value.id, true);
      if (prepare && !prepared) {
        await repository.prepareTarget(current.value.spreadsheetId, current.value.id, PROGRAM_SCHEMA);
        prepared = assertTarget(await repository.inspectTarget(current.value.spreadsheetId), current.value.id, false);
      }
      return { id: current.value.id, prepared, timezoneConfigured: Boolean(current.value.timezone), teachingEnabled: false,
        checks: [ { label: "Backend spreadsheet read access", ok: true }, { label: "Program schema", ok: prepared },
          { label: "Program timezone", ok: Boolean(current.value.timezone) } ],
        message: prepared ? "Spreadsheet prepared. Teaching remains disabled until later V105 stages." : "Spreadsheet accessible. Prepare it to complete V105.1 storage setup." };
    }
  };
}
