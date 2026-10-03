# Student enrollment

Verified personal accounts use `/account/student-enrollment` on the frontend to
request admission to a verified university. A request never grants a student
role. University admins review requests at `/workspace/student-enrollments`.
The navbar remains common; both links live in their respective role sidebars.

All API routes below require a valid bearer token. Flutter can call them directly
without embedding the origin secret.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/student-enrollments/universities?keyword=...` | Search verified schools (up to 50) |
| GET | `/student-enrollments/universities/:id/majors` | Majors belonging to that verified school |
| GET | `/student-enrollments/me` | Latest 50 requests owned by the current account |
| POST | `/student-enrollments` | Submit universityId, majorId, studentCode, className, semester (1–8) |
| PATCH | `/student-enrollments/:id/cancel` | Cancel one's own pending request |
| GET | `/student-enrollments?status=PENDING&page=1&limit=20` | University admin's scoped queue; optional keyword/status |
| PATCH | `/student-enrollments/:id/review` | University admin sends decision APPROVED or REJECTED; rejection requires reason |

Only active, email-verified personal USER accounts without an existing student,
school or company profile can submit. School and major are validated together.
One pending request per account is enforced by both the API and a partial unique
database index. Rejected/cancelled requests remain in history; corrections use a
new request, so a stale review cannot approve edited data.

Approval rechecks eligibility, school verification and student-code uniqueness,
then creates Student using the existing accountId and updates the request in a
single serializable transaction. It does not create a new Account or change its
password. Concurrent changes return 409 and should be followed by a reload.
Pending requests can neither apply to opportunities nor enter student-only pages.
JWT authentication reads the current database profile on each request, so after
approval the user can refresh the dashboard without signing in again.

School admins manage academic fields through existing student management. Students
see these fields read-only on their profile and can edit their name, phone and CV.
Changing university is not supported by self-service enrollment once a Student
exists. The school must verify the student's real enrollment before approving.

Deployment: run `npm run db:generate`, then `npm run db:deploy` separately before
starting the new backend. The additive migration is
`20261003090000_student_enrollment`; no existing account/student data is rewritten.
Deploy backend before frontend so the new pages can reach the new endpoints.

Local integration check (ignored from Git):
`npm run build && node test/student-enrollment.integration.cjs`.
It runs HTTP validation/tenant/approval checks using database fixtures inside a
transaction, rolls the entire transaction back, and checks no fixtures remain.
