# Academy terminology

The project owner clarified these meanings during the D1 migration on 10 October 2026.

| Term | Meaning |
| --- | --- |
| Academy | The whole organisation, including all Programs and Courses |
| Course / Continuing Education | A short course, workshop or bootcamp; the older name is Global Subject |
| Course Scheduling | Scheduling Courses; the older name is Global Curriculum |
| Academy subject | A shared subject in the Program curriculum catalogue |
| Global Admin | Administration across the entire Academy: all Programs and all Courses |
| Program Admin | Administration within assigned Programs |
| Teacher | Teaching access within assigned areas; former Seniors become Teachers |

**Courses are current offerings. Only the term Global Subject is outdated.** Active Courses remain included in the migration. Exclude inactive or archived source records and the separately identified old Reboot workspace; do not exclude a Course because its source table or identifier uses Global Subject.

The code still uses compatibility names such as GlobalSubjectList, GlobalResources, /api/admin/platform/global/, GLOBAL_REFERENCE and js/m4l-global-curriculum.js. These names do not classify the corresponding Courses as legacy data, nor limit a Global Admin to Courses. Some existing routes and that script also contain Course catalogue, content and resource administration. Use the product meanings above when describing their behaviour.

Keep stored identifiers and route contracts stable during the storage migration. D1 already represents these offerings with activity kind COURSE. A consistent internal/display naming cleanup can be reviewed separately after migration verification. Historical release descriptions retain the names used at the time.
