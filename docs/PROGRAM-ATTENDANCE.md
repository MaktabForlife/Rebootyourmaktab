# V105.4.3.2 — Program attendance registers

Program attendance uses the published timetable for each teaching date. Breaks and cancelled lessons have no register. The page starts with pills for the Programs where the signed-in account is a Teacher, Senior or Admin. Its Account link returns to the personal Academy page, and its Library link opens the selected Program Library.

Classes appear in adjacent columns. Each column has a class heading, a lesson selector with All lessons and that class's scheduled lessons, a Submit attendance button, and the learner list. A teacher sees classes where they are the class teacher or teach a scheduled lesson; Seniors and Admins see every active class. All lessons applies one learner choice to each selected class lesson. When existing lesson marks differ, Mixed keeps their individual values until the teacher chooses a new status. New registers start every enrolled learner as Present; Absent and Excused are the exceptions.

A learner needs both an active Student role in the Program and an active class assignment covering that date. Program Management saves multiple class selections together through Save all. Assign the intended classes before submitting attendance; a submitted register keeps its original learner roster.

Three Program spreadsheet tabs store attendance independently of the timetable and management snapshots:

- `ProgramAttendanceRegisters`: immutable submissions and edits per class lesson, with the published lesson snapshot, date and submitter. Editing appends a revision rather than replacing the original.
- `ProgramAttendanceMarks`: one Present, Absent or Excused result for each learner in the submitted roster.
- `ProgramAttendanceOperations`: retry receipts. A multi-lesson submission writes its registers, learner marks and receipt in one coordinated Sheets batch.

Unsubmitted lessons have no marks. An incomplete day shows Unknown learner summaries, even if another lesson was submitted. When all scheduled lessons are submitted, all Present yields Present, some but not all Present yields Partial, and no Present yields Absent, except that an all-Excused day is provisionally displayed as Excused. Attendance percentages are not yet calculated; their Excused denominator rule remains to be decided.

New submissions are accepted only for the current date in the Program timezone (Africa/Johannesburg). Teachers and above can edit a submitted register, including on an earlier date; the edit retains its saved learner roster and requires the latest register ID to prevent overwriting another editor's change. An unsubmitted historical lesson remains unknown and cannot be backfilled from today's class assignments. Published lesson labels and submitted rosters stay with the original register. Shared lessons submitted before V105.4.3.2 appear in a clearly labelled Combined earlier register column, preserving their actual roster instead of guessing how it divides across classes.

Reboot's historical `Attendance` records stay day-level. Its `SYSTEM1` row denotes a teaching day and is never a learner absence. There is no conversion that invents past lesson marks. During a parallel run, compare dates with completed Program registers against Reboot report dates once per date, then compare learner day statuses only where a verified account mapping and the same teaching-day scope exist. Incomplete Program days and all-Excused percentage cases must be excluded from parity percentages until policy is agreed.
