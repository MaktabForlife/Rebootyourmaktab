import { profileUser } from '../routes/user-profiles.js';
import { profileService } from '../profiles/service.js';
import { profileRepository } from '../profiles/repository.js';
import { academySubjectRepository, academySubjectService } from './academy-subjects.js';
import { DurableObject } from 'cloudflare:workers';
import { createRequestEnvironment } from '../lib/request-context.js';
import { timetableCoordinator } from './timetable-coordination.js';
import { timetableUser, timetableProgram, programLibraryUser } from './timetable-context.js';
import { timetableService } from './timetable-service.js';
import { timetableRepository } from './timetable-repository.js';
import { programFailure } from './errors.js';
import { openLibraryMetadataUser } from '../routes/open-library-metadata.js';
import { validateOpenLibraryMetadata, publicOpenLibraryMetadata, isAcademyLinkId } from '../lib/open-library-metadata.js';
import { loadOpenLibraryTaxonomy, resolveOpenLibraryTaxonomySelection } from '../lib/open-library-taxonomy.js';
import { problem } from './model.js';
export class ProgramTimetableCoordinator extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    const sql=ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS open_library_metadata (id TEXT PRIMARY KEY, metadata TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS pending (id INTEGER PRIMARY KEY CHECK(id=1), intent TEXT NOT NULL)');
    const journal={
      get:async()=>{const row=sql.exec('SELECT intent FROM pending WHERE id=1').toArray()[0];return row?JSON.parse(row.intent):null;},
      set:async value=>{sql.exec('INSERT OR REPLACE INTO pending(id,intent) VALUES(1,?)',JSON.stringify(value));},
      clear:async()=>{sql.exec('DELETE FROM pending WHERE id=1');}
    };
    sql.exec('CREATE TABLE IF NOT EXISTS catalogue_pending (id INTEGER PRIMARY KEY CHECK(id=1), intent TEXT NOT NULL)');
    const catalogueJournal={
      get:async()=>{const row=sql.exec('SELECT intent FROM catalogue_pending WHERE id=1').toArray()[0];return row?JSON.parse(row.intent):null;},
      set:async value=>{sql.exec('INSERT OR REPLACE INTO catalogue_pending(id,intent) VALUES(1,?)',JSON.stringify(value));},
      clear:async()=>{sql.exec('DELETE FROM catalogue_pending WHERE id=1');}
    };
    sql.exec('CREATE TABLE IF NOT EXISTS profiles_pending (id INTEGER PRIMARY KEY CHECK(id=1), intent TEXT NOT NULL)');
    const profilesJournal={
      get:async()=>{const row=sql.exec('SELECT intent FROM profiles_pending WHERE id=1').toArray()[0];return row?JSON.parse(row.intent):null;},
      set:async value=>{sql.exec('INSERT OR REPLACE INTO profiles_pending(id,intent) VALUES(1,?)',JSON.stringify(value));},
      clear:async()=>{sql.exec('DELETE FROM profiles_pending WHERE id=1');}
    };
    this.profiles=timetableCoordinator(profilesJournal,async(_id,authorization)=>{
      const fresh=createRequestEnvironment(env);
      const user=await profileUser(new Request('https://internal.invalid/profiles',{headers:{Authorization:authorization}}),fresh);
      return {user,service:profileService(profileRepository(fresh))};
    });
    this.catalogue=timetableCoordinator(catalogueJournal,async(_id,authorization)=>{
      const fresh=createRequestEnvironment(env);
      const user=await timetableUser(new Request('https://internal.invalid/catalogue',{headers:{Authorization:authorization}}),fresh);
      return {user,service:academySubjectService(academySubjectRepository(fresh))};
    });
    this.coordinator=timetableCoordinator(journal,async(id,authorization,action,input)=>{
      const fresh=createRequestEnvironment(env);
      const request=new Request('https://internal.invalid/timetable',{headers:{Authorization:authorization}});
      const resourceChange=(action==='manage-save'||action==='recover')&&input.kind==='resources';
      const user=resourceChange?await programLibraryUser(request,fresh,id):await timetableUser(request,fresh);
      const program=await timetableProgram(fresh,id);
      return {user,service:timetableService(timetableRepository(fresh,program),program)};
    });
  }
  async profilesRun(action,input,authorization){
    try{return {success:true,...await this.profiles.run(action,input,authorization)};}
    catch(error){return programFailure(error,action,'profile-coordinator');}
  }
  openLibraryMetadataList() {
    return this.ctx.storage.sql.exec('SELECT metadata, revision FROM open_library_metadata ORDER BY id').toArray().map(publicOpenLibraryMetadata);
  }
  openLibraryMetadataCoverKey(id) {
    const row = this.ctx.storage.sql.exec('SELECT metadata FROM open_library_metadata WHERE id = ?', id).toArray()[0];
    const record = row ? JSON.parse(row.metadata) : null;
    return record?.kind === 'LINK' && record.active === false ? '' : record?.coverKey || '';
  }
  async openLibraryMetadataSave(input, authorization, uploadedCoverKey = '') {
    const user = await openLibraryMetadataUser(new Request('https://internal.invalid/open-library-metadata', {
      headers: { Authorization: authorization }
    }), createRequestEnvironment(this.env));
    const taxonomy = await loadOpenLibraryTaxonomy(createRequestEnvironment(this.env));
    const creatingLink = input?.kind === 'LINK' && !input.id;
    const id = creatingLink ? `EXTERNAL:ACADEMY_LINK:${crypto.randomUUID()}` : input?.id;
    const record = validateOpenLibraryMetadata({ ...input, id,
      ...resolveOpenLibraryTaxonomySelection(input, taxonomy) });
    const expected = Number(input?.baseRevision);
    if (!Number.isInteger(expected) || expected < 0) throw problem('Refresh the book details before saving.', 409);
    const sql = this.ctx.storage.sql;
    const current = sql.exec('SELECT metadata, revision FROM open_library_metadata WHERE id = ?', record.id).toArray()[0];
    const revision = Number(current?.revision || 0);
    if (isAcademyLinkId(record.id) && !creatingLink && !current) throw problem('This Library link no longer exists.', 404);
    if (creatingLink && expected !== 0) throw problem('Refresh the Library editor before adding a link.', 409);
    if (revision !== expected) throw problem('This book changed elsewhere. Refresh its details before saving.', 409);
    const previous = current ? JSON.parse(current.metadata) : {};
    if (current && Boolean(previous.kind === 'LINK') !== Boolean(record.kind === 'LINK')) {
      throw problem('The resource type cannot be changed after creation.');
    }
    record.coverKey = uploadedCoverKey || (record.coverUrl || input.removeCover === true ? '' : previous.coverKey || '');
    const next = revision + 1;
    const changed = sql.exec(`INSERT INTO open_library_metadata (id, metadata, revision, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET metadata = excluded.metadata, revision = excluded.revision,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by
      WHERE open_library_metadata.revision = ?`,
      record.id, JSON.stringify(record), next, new Date().toISOString(), user.accountid, expected);
    if (!changed.rowsWritten) throw problem('This book changed elsewhere. Refresh its details before saving.', 409);
    return { ...record, revision: next, previousCoverKey: previous.coverKey && previous.coverKey !== record.coverKey ? previous.coverKey : '' };
  }
  async catalogRun(action,input,authorization) {
    try{return {success:true,...await this.catalogue.run(action,input,authorization)};}
    catch(error){return programFailure(error,action,'catalogue-coordinator');}
  }
  async run(action,input,authorization) {
    try {return {success:true,...await this.coordinator.run(action,input,authorization)};}
    catch(error) {return programFailure(error,action,'program-coordinator');}
  }
}
