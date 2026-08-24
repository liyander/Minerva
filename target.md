# Product Development Targets

This file is the implementation tracker for the next platform features.

## Tracking rules

- An unfinished feature uses `- [ ]`.
- A feature may be marked complete only after its frontend, backend, database changes, authorization, error handling, and relevant tests have been implemented and verified.
- When complete, change the item to `- [x]` and strike out its title, for example: `- [x] ~~Feature name~~`.
- Partially implemented or backend-only features remain unfinished; add progress notes beneath them instead of striking them out.

## Assessments and assignments

- [x] ~~**Assignment and subjective grading**~~
  - Support essay/text, code, link, and file-upload submissions.
  - Let trainers create reusable rubric criteria with configurable scores.
  - Provide a grading queue with rubric scoring, written feedback, pass/fail status, and resubmission controls.
  - Show submission history, feedback, and grades to trainees.

- [x] ~~**Question banks with randomisation**~~
  - Let trainers create and maintain reusable question banks.
  - Allow assessments to draw a configurable random subset per attempt.
  - Support question-order and option-order shuffling.
  - Persist the selected question order so attempts can be reviewed accurately.

## Streams and learning models

- [ ] **Stream and department management**
  - Create and manage streams such as engineering, medicine, commerce, arts, law, and design.
  - Support custom streams, departments, subjects, and stream-specific terminology.
  - Associate courses, learning paths, trainers, cohorts, resources, and competencies with one or more streams.
  - Let trainees select or be assigned a primary stream while permitting cross-stream learning.
  - Provide stream filters and stream-level reporting throughout the platform.

- [ ] **Flexible practical activities**
  - Replace domain-specific lab assumptions with a reusable activity model.
  - Support coding exercises, essays, file submissions, design portfolios, case studies, simulations, research work, viva sessions, and presentations.
  - Allow each activity type to define its instructions, evidence requirements, completion rules, grading method, and environment.
  - Support individual and group activities.
  - Preserve compatibility with existing practical environments and course progress.

- [ ] **Personalized learning recommendations**
  - Recommend lessons, activities, assessments, and projects using performance, goals, stream, prerequisites, and skill gaps.
  - Explain the evidence and reasoning behind each recommendation.
  - Let trainees dismiss, save, or complete recommendations.
  - Let trainers review recommendations and assign alternatives.
  - Track whether recommendations improve progress and assessment outcomes.

## Files and media

- [ ] **Object storage for uploads and recorded lectures**
  - Support S3-compatible storage, including MinIO.
  - Store file metadata in MySQL instead of storing large base64 payloads.
  - Use signed upload and download URLs with authorization and expiry controls.
  - Provide a signed-URL media player for recorded lectures.
  - Preserve a safe migration path for existing inline files.

## Communication and accounts

- [ ] **Email delivery**
  - Deliver approval and rejection decisions by email.
  - Send assignment, assessment, event, and mandatory-training deadline reminders.
  - Send configurable weekly progress digests.
  - Record delivery status, errors, and deduplication information.
  - Provide administrator controls for email configuration and manual reminder runs.

- [ ] **Password reset and change-password**
  - Implement forgot-password emails with single-use, expiring tokens.
  - Implement reset-password and authenticated change-password flows.
  - Revoke or invalidate relevant sessions after a password change.
  - Apply rate limits and avoid account-enumeration responses.

## Cohorts and mandatory training

- [ ] **Cohorts and batches**
  - Create and manage cohorts by department, dates, and owner.
  - Add and remove trainees and trainers.
  - Assign courses or learning paths to an entire cohort.
  - Track cohort-level enrolment, progress, completion, and performance.

- [ ] **Mandatory training and compliance**
  - Assign required training globally or by cohort or department.
  - Support due dates and active/inactive requirements.
  - Show each trainee their pending, completed, upcoming, and overdue requirements.
  - Provide an administrator compliance view with filters and completion rates.

- [ ] **Bulk CSV user import and enrolment**
  - Provide a downloadable CSV template.
  - Validate rows and show a preview before committing changes.
  - Report row-level errors without discarding valid rows.
  - Support bulk cohort membership and course/path enrolment.
  - Record bulk operations in the audit log.

## Learning experience

- [ ] **Prerequisites and progression gating**
  - Let trainers configure module prerequisites.
  - Prevent access until prerequisite completion conditions are satisfied.
  - Explain locked content and the exact unlock requirements to trainees.
  - Allow authorized administrators to override gating when necessary.

- [ ] **Lecture resume position and course-linked notes**
  - Persist lecture playback position and completion status per trainee.
  - Resume playback across devices.
  - Attach notes to courses, modules, lectures, or timestamps.
  - Preserve support for general free-form notes.

- [ ] **Unified full-text search**
  - Search courses, paths, modules, trainer-library items, and research resources.
  - Apply role and publication visibility rules to results.
  - Support filters by stream, subject, content type, trainer, and difficulty.
  - Provide keyboard-accessible navigation and useful empty states.

- [ ] **Timetable and attendance**
  - Schedule classes, practical sessions, assessments, and trainer availability.
  - Provide trainee, trainer, cohort, and administrator calendar views.
  - Record attendance manually or through session check-in.
  - Support attendance corrections, absence reasons, and leave requests.
  - Show attendance percentages and flag configurable shortage thresholds.
  - Support calendar export and integration-ready event data.

- [ ] **Live classes and recordings**
  - Create live sessions with meeting links, trainer details, capacity, and reminders.
  - Track attendance and join/leave information where integrations permit it.
  - Attach lesson materials, recordings, transcripts, and follow-up activities.
  - Publish recordings through authorized signed URLs.
  - Connect sessions to streams, cohorts, courses, modules, and timetable entries.

- [ ] **Gradebook, report cards, and transcripts**
  - Provide a unified gradebook covering assessments, assignments, activities, projects, and trainer-entered grades.
  - Support configurable weighting, grading scales, pass rules, and moderation.
  - Calculate totals, percentages, letter grades, GPA, or institution-defined outcomes.
  - Generate downloadable report cards and verified transcripts.
  - Preserve grade-change history and record changes in the audit log.

- [ ] **Projects and student portfolios**
  - Support individual and group projects with milestones, deliverables, mentors, and review dates.
  - Allow trainers to assess milestones and final outcomes using rubrics.
  - Let trainees publish approved projects, evidence, skills, and reflections to a portfolio.
  - Provide privacy controls for private, organisation-only, and public portfolio items.
  - Generate a shareable portfolio link without exposing unrelated profile data.

- [ ] **Universal skill passport**
  - Build a verified skill profile from courses, assessments, assignments, activities, projects, trainer evaluations, and work experience.
  - Distinguish declared skills from demonstrated and trainer-verified skills.
  - Show proficiency, supporting evidence, last-demonstrated date, and expiry where relevant.
  - Let trainees share a controlled public version using a revocable link or QR code.
  - Connect skill evidence to personalized learning and target-role gap analysis.

## Analytics

- [ ] **CSV and PDF report exports**
  - Export dashboard, progress, assessment, assignment, cohort, and compliance data.
  - Apply the same filters and permissions as the on-screen report.
  - Include generation timestamps and clear report metadata.
  - Handle large exports without blocking normal API requests.

- [ ] **Trainee skill-gap analysis**
  - Compare verified and declared trainee skills with a selected target role or learning goal.
  - Derive evidence from courses, assessments, assignments, projects, and trainer evaluations.
  - Identify missing or weak skills and recommend relevant learning content.
  - Explain why each recommendation was produced.

- [ ] **Trainer performance dashboard**
  - Show assigned learners, engagement, completion, assessment, and grading metrics.
  - Track grading turnaround time and outstanding work.
  - Summarize course feedback without exposing inappropriate personal data.
  - Restrict trainers to their own courses and cohorts while allowing administrators a global view.

## Platform hardening

- [ ] **Administrator audit log**
  - Record approvals, rejections, role changes, activation changes, deletions, enrolments, grading changes, and configuration updates.
  - Capture actor, action, entity, timestamp, source IP, and safe metadata.
  - Provide filtering, pagination, and export.
  - Prevent ordinary administrators from modifying audit records.

## Explicitly excluded from this target

- Course discussion and Q&A
- SSO, OAuth, and MFA
- Accessibility audit/pass
- Academic structure
- Collaboration features
- Internships and opportunities
- Parent or sponsor portal
- Multi-institution support
