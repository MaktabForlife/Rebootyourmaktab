# V105.4.3.0 — Program attendance registers

Program attendance uses the published timetable for each teaching date. A cancelled lesson has no register. A teacher sees lessons where they are the primary or an additional teacher; Program administrators and global administrators see all lessons. A register opens with every currently enrolled learner set to Present. The teacher changes only Absent or Excused exceptions and submits one lesson or all assigned lessons for the current Program day.

Three Program spreadsheet tabs store attendance independently of the timetable and management snapshots:

- `ProgramAttendanceRegisters`: one immutable submission per scheduled lesson, with its published lesson snapshot, date and submitter.
- `ProgramAttendanceMarks`: one Present, Absent or Excused result for each learner in the submitted roster.
- `ProgramAttendanceOperations`: retry receipts. A multi-lesson submission writes its registers, learner marks and receipt in one coordinated Sheets batch.

Unsubmitted lessons have no marks. An incomplete day shows Unknown learner summaries, even if another lesson was submitted. When all scheduled lessons are submitted, all Present yields Present, some but not all Present yields Partial, and no Present yields Absent, except that an all-Excused day is provisionally displayed as Excused. Attendance percentages are not yet calculated; their Excused denominator rule remains to be decided.

The current submission flow accepts only the current date in the Program timezone (Africa/Johannesburg). Submitted registers are read only. This prevents today's class assignments from being projected backwards onto older dates. Published lesson labels and the submitted roster are saved with each register, so later timetable and enrollment edits cannot rewrite a submitted result.

Reboot's historical `Attendance` records stay day-level. Its `SYSTEM1` row denotes a teaching day and is never a learner absence. There is no conversion that invents past lesson marks. During a parallel run, compare dates with completed Program registers against Reboot report dates once per date, then compare learner day statuses only where a verified account mapping and the same teaching-day scope exist. Incomplete Program days and all-Excused percentage cases must be excluded from parity percentages until policy is agreed.
