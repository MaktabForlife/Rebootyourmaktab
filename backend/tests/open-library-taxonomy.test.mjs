import assert from 'node:assert/strict';
import { buildOpenLibraryTaxonomy, resolveOpenLibraryTaxonomySelection } from '../src/lib/open-library-taxonomy.js';

const taxonomy = buildOpenLibraryTaxonomy({
  academy: [
    { SubjectID: 'AS-FIQH', SubjectName: 'Fiqh', Active: true },
    { SubjectID: 'AS-OLD', SubjectName: 'Old subject', Active: false }
  ],
  globalSubjects: [{ SubjectID: 'GS-Q', SubjectName: 'Quran', Active: true }],
  globalModules: [
    { ModuleID: 'GM-Q1', SubjectID: 'GS-Q', ModuleName: 'Recitation', Active: true },
    { ModuleID: 'GM-OLD', SubjectID: 'GS-Q', ModuleName: 'Old module', Active: false }
  ],
  reboot: [{ id: 'RB1', name: 'Reboot Your Maktab',
    subjectRows: [['SubjectID', 'SubjectName', 'Active'], ['RS-F', 'Fiqh', true]],
    moduleRows: [['ModuleID', 'SubjectID', 'ModuleName', 'Active'], ['RM-1', 'RS-F', 'Wudu', true]] }],
  programs: [{ id: 'P1', name: 'Academy Program',
    subjects: [{ ProgramSubjectID: 'PS-F', SubjectID: 'AS-FIQH', Active: true }],
    modules: [{ ProgramModuleID: 'PM-1', ProgramSubjectID: 'PS-F', Name: 'Salah', Active: true }] }]
});
assert.deepEqual(taxonomy.subjects.map(item => item.id), ['ACADEMY:AS-FIQH', 'REBOOT:RB1:RS-F', 'GLOBAL:GS-Q']);
assert.equal(taxonomy.modules.length, 3);
assert.deepEqual(taxonomy.learningAreas.map(item => item.id), ['PROGRAM:P1', 'GLOBAL:GS-Q', 'REBOOT:RB1']);
assert.deepEqual(resolveOpenLibraryTaxonomySelection({ learningAreaRefs: ['PROGRAM:P1', 'GLOBAL:GS-Q'], subjectRef: 'ACADEMY:AS-FIQH',
  moduleRef: 'PROGRAM:P1:PM-1' }, taxonomy), {
  learningAreaRefs: ['PROGRAM:P1', 'GLOBAL:GS-Q'], learningAreas: ['Academy Program', 'Quran'],
  subjectRef: 'ACADEMY:AS-FIQH', moduleRef: 'PROGRAM:P1:PM-1', subject: 'Fiqh', module: 'Salah'
});
assert.throws(() => resolveOpenLibraryTaxonomySelection({ subjectRef: 'ACADEMY:AS-FIQH',
  moduleRef: 'GLOBAL:GM-Q1' }, taxonomy), /belonging to the selected subject/);
assert.throws(() => resolveOpenLibraryTaxonomySelection({ subjectRef: 'ACADEMY:AS-OLD' }, taxonomy), /active subject/);
assert.deepEqual(resolveOpenLibraryTaxonomySelection({ learningAreaRefs: ['GLOBAL:GS-Q'],
  subjectRef: 'ACADEMY:AS-FIQH' }, taxonomy).learningAreas, ['Quran']);
assert.throws(() => resolveOpenLibraryTaxonomySelection({ learningAreaRefs: ['PROGRAM:OLD'] }, taxonomy), /active Programs/);
assert.throws(() => resolveOpenLibraryTaxonomySelection({ learningAreaRefs: ['PROGRAM:P1', 'PROGRAM:P1'] }, taxonomy), /different Programs/);
assert.throws(() => resolveOpenLibraryTaxonomySelection({ learningAreaRefs: ['PROGRAM:P1'],
  subjectRef: 'ACADEMY:AS-FIQH', moduleRef: 'REBOOT:RB1:RM-1' }, taxonomy), /belonging to the selected subject/);
assert.throws(() => resolveOpenLibraryTaxonomySelection({ learningAreaRefs: ['PROGRAM:P1'],
  subjectRef: 'ACADEMY:AS-FIQH', moduleRef: 'GLOBAL:GM-Q1' }, taxonomy), /belonging to the selected subject/);
assert.deepEqual(resolveOpenLibraryTaxonomySelection({ learningAreaRefs: ['PROGRAM:P1'] }, taxonomy), {
  learningAreaRefs: ['PROGRAM:P1'], learningAreas: ['Academy Program'],
  subjectRef: '', moduleRef: '', subject: '', module: ''
});
assert.throws(() => resolveOpenLibraryTaxonomySelection({ subject: 'Unlinked text' }, taxonomy), /Choose a subject and module/);
console.log('Open Library taxonomy uses active source records and validates subject/module relationships.');
