# Backend Guide

## What this backend actually is

The backend is split into three separate Node processes:

1. `src/server.ts`
   Accepts HTTP requests, validates/authenticates them, writes database records, and enqueues audit jobs.
2. `src/worker.ts`
   Consumes queued audit jobs, runs the full or quick scan processors, stores reports, sends email, and performs cache cleanup.
3. `src/scanner-server.ts`
   Runs the local HTTP scanner service for prechecks and development scans.
4. `python-scanner/sqs_worker.py`
   Production scanner worker entrypoint for Fargate. It reads scan requests from SQS, runs Camoufox + axe-core, uploads raw JSON to S3, and sends a small result event.

The API process does not perform heavy scans itself. It depends on the worker and scanner services being up.

## Startup and runtime flow

- App creation lives in `src/app/create-app.ts`.
- Feature routers are mounted in `src/features/register-features.ts`.
- Environment parsing is centralized in `src/config/env.ts`.
- Database connection is handled in `src/config/database.ts`.
- Queue creation and runtime wiring live in `src/server/runtime.ts`.
- Queue backend selection happens in `src/infrastructure/queues/queue-factory.ts`.

High-level full audit flow:

1. Frontend calls `POST /start-audit`.
2. `src/features/audits/audits.routes.ts` passes to `audits.controller.ts`.
3. The controller validates subscription or one-time credits, normalizes the URL, creates an `AnalysisRecord`, and enqueues a `FullAudit` job.
4. `src/worker.ts` starts the queue processors.
5. `src/features/audits/full-audit.processor.ts` calls the scanner client, generates scorecards and reports, stores files, updates MongoDB, and triggers email delivery.

In production, set `SCANNER_DISPATCH_MODE=sqs` on the Node worker. Quick scans are sent to the quick scanner queue, and full-audit page scans are sent to the full scanner queue, so large full audits do not block short quick scans. Python Fargate scanner workers upload raw page JSON to S3 and publish tiny completion messages back to their matching result queues. Quick scans use a dedicated event-driven result worker, so the quick BullMQ job only dispatches the scanner job and the result worker later generates the PDF, uploads/stores it, updates MongoDB, and sends email. Full-audit page scans use a full result inbox worker: it consumes the full result queue into MongoDB by `scannerJobId`, and the full audit waits for its own stored result instead of polling the shared SQS result queue directly.

Recommended production scanner env:

- `SCANNER_DISPATCH_MODE=sqs` on the Node worker
- `SCANNER_SQS_QUICK_JOB_QUEUE_URL` and `SCANNER_SQS_QUICK_RESULT_QUEUE_URL` on the Node worker
- `SCANNER_SQS_FULL_JOB_QUEUE_URL` and `SCANNER_SQS_FULL_RESULT_QUEUE_URL` on the Node worker
- `SCANNER_SQS_RESULT_WORKER_ENABLED=true` on the Node worker so quick scanner results and full scanner results are consumed by dedicated result workers instead of many request waiters
- `SCANNER_SQS_RESULT_WORKER_VISIBILITY_TIMEOUT_SECONDS=900` on the Node worker so a result message stays hidden while PDF/email/S3 finalization runs
- `SCANNER_SQS_JOB_QUEUE_URL` and `SCANNER_SQS_RESULT_QUEUE_URL` on each Python scanner service, pointing to either the quick or full pair
- `SCANNER_SQS_ARTIFACT_BUCKET`/`AWS_S3_BUCKET` and `SCANNER_SQS_ARTIFACT_REGION`/`AWS_REGION`
- `SCANNER_FULL_AUDIT_TIMEOUT_MS` high enough for the longest single page scan
- `SCANNER_ECS_TASK_PROTECTION_ENABLED=true` on Fargate scanner workers so ECS service scale-in does not stop a task while it is actively scanning
- `QUEUE_QUICK_SCAN_JOB_TIMEOUT_MS` only needs to cover SQS dispatch in event-driven quick mode, but keeping `3600000` during load tests is harmless.

Keep one small HTTP scanner service available for `/precheck-url` if you want Camoufox-backed immediate prechecks. Heavy full/quick audit page scans should use the SQS worker path.

Fargate scale-in protection:

- The Python SQS worker enables ECS task scale-in protection immediately after it receives a scan job.
- It releases protection in a `finally` block after the result is sent/deleted or the job fails.
- Set `SCANNER_ECS_TASK_PROTECTION_EXPIRES_MINUTES` longer than the longest expected scan. Use `30` for quick-only workers and `180` or higher for full-audit workers.
- The scanner task role must allow `ecs:UpdateTaskProtection` if the task uses the ECS API fallback. The ECS task protection endpoint is used automatically when `ECS_AGENT_URI` is available.

Recommended scanner services:

- Quick scanner ECS service: `SCANNER_QUEUE_KIND=quick`, consumes `silversurfers-scanner-quick-jobs`, writes `silversurfers-scanner-quick-results`, min tasks 1, max tasks based on quick-scan demand.
- Full scanner ECS service: `SCANNER_QUEUE_KIND=full`, consumes `silversurfers-scanner-full-jobs`, writes `silversurfers-scanner-full-results`, min tasks 0 or 1, max tasks based on full-audit backlog.

Quick scan flow is the same shape, but uses `QuickScan` records and `quick-scan.processor.ts`.

## Active route map

`src/features/register-features.ts` is the real source of truth.

### Health

- `GET /health`
  API health endpoint from `src/features/health/health.routes.ts`
- `GET /healthz`
  Lightweight process health endpoint from `src/server.ts`

### Auth

Routes are in `src/features/auth/auth.routes.ts`.

- `POST /auth/register`
- `POST /auth/verify-email`
- `POST /auth/resend-verification`
- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/me`
- `GET /auth/my-analysis`
- `GET /auth/my-analysis/:taskId`
- `GET /auth/my-analysis/:taskId/reports`
- `GET /auth/my-analysis/:taskId/reports/:reportId`

### Audits

Routes are in `src/features/audits/audits.routes.ts`.

- `POST /precheck-url`
- `POST /start-audit`
- `POST /quick-audit`

### Billing and team

Routes are in:

- `src/features/billing/subscription.routes.ts`
- `src/features/billing/team.routes.ts`
- `src/features/billing/stripe.routes.ts`

Main endpoints:

- `GET /subscription`
- `GET /subscription/plans`
- `POST /create-checkout-session`
- `POST /create-portal-session`
- `POST /subscription/upgrade`
- `POST /subscription/cancel`
- `GET /payment-success`
- `GET /subscription-success`
- `POST /subscription/team/add`
- `POST /subscription/team/remove`
- `POST /subscription/team/leave`
- `GET /subscription/team`
- `GET /subscription/team/scans`
- `GET /subscription/team/invite/:token`
- `POST /subscription/team/accept`
- `POST /stripe-webhook`

### Content and contact

- `GET /blogs`
- `GET /blogs/:slug`
- `GET /faqs`
- `POST /contact`

Files:

- `src/features/content/content.routes.ts`
- `src/features/contact/contact.routes.ts`

### Legal

Routes are in `src/features/legal/legal.routes.ts`.

- `GET /legal`
- `GET /legal/:type`
- `POST /legal/:type/accept`
- `GET /legal/acceptances`
- `GET /admin/legal`
- `POST /admin/legal`
- `PUT /admin/legal/:id`
- `POST /admin/legal/:id/publish`

### Admin

Routes are in `src/features/admin/admin.routes.ts`.

Main areas:

- Blog CRUD
- Services CRUD
- FAQ CRUD
- Analysis listing and reruns
- Contact inbox management
- Quick scan admin views and bulk queueing
- User listing, role updates, and subscription updates

### Records

- `POST /cleanup`

File:

- `src/features/records/records.routes.ts`

This is admin-only and deletes generated report folders through `cleanup.service.ts`.

## Feature ownership

### Authentication and user access

- Routing and token lifecycle: `src/features/auth/auth.routes.ts`
- JWT parsing and protection: `src/features/auth/auth.middleware.ts`
- Admin-only guard: `src/features/auth/admin.middleware.ts`
- Email helpers: `src/features/auth/auth-email.service.ts`

### Audit orchestration

- API controller: `src/features/audits/audits.controller.ts`
- Queue injection/runtime: `src/features/audits/audits.runtime.ts`
- Full audit worker logic: `src/features/audits/full-audit.processor.ts`
- Quick audit worker logic: `src/features/audits/quick-scan.processor.ts`
- URL precheck: `src/features/audits/precheck.service.ts`
- Scorecard building: `src/features/audits/audit-scorecard.ts`
- Analysis detail shaping for frontend: `src/features/audits/analysis-details.ts`
- Report listing and download metadata: `src/features/audits/analysis-reports.ts`
- Email delivery: `src/features/audits/report-delivery.ts`
- PDF/report generation: `src/features/audits/report-generation.ts`

### Scanner integration

- Scanner client, HTTP mode, and SQS dispatch mode: `src/features/scanner/scanner-client.ts`
- Scanner service routes: `src/features/scanner/scanner.routes.ts`
- Scanner implementation: `src/features/scanner/scanner.service.ts`
- Python scanner HTTP service: `python-scanner/scanner_service.py`
- Python scanner SQS worker: `python-scanner/sqs_worker.py`
- Raw report/PDF internals: `src/features/audits/scanner/`

### Billing

- Subscription controller: `src/features/billing/subscription.controller.ts`
- Team controller: `src/features/billing/team.controller.ts`
- Stripe event handling: `src/features/billing/stripe-webhook.service.ts`
- Plan definitions: `src/features/billing/subscription-plans.ts`

### Infrastructure

- Cache cleanup manager: `src/infrastructure/cache/cache-manager.ts`
- Queue implementations:
  `src/infrastructure/queues/persistent-queue.ts`
  `src/infrastructure/queues/bullmq-queue.ts`
- S3 report storage:
  `src/features/storage/report-storage.ts`

## Main data models

The most important Mongo models are:

- `src/models/user.model.ts`
  Auth, role, Stripe customer data, one-time scan credits, embedded subscription snapshot.
- `src/models/subscription.model.ts`
  Canonical recurring subscription record, limits, usage, and team members.
- `src/models/analysis-record.model.ts`
  Full audit jobs, scores, report metadata, and email delivery state.
- `src/models/quick-scan.model.ts`
  Quick scan jobs and generated report metadata.
- `src/models/blog-post.model.ts`
  Public blog content.
- `src/models/faq.model.ts`
  Public FAQ content.
- `src/models/contact-message.model.ts`
  Contact form submissions.
- `src/models/legal-document.model.ts`
  Versioned legal content.
- `src/models/legal-acceptance.model.ts`
  Per-user legal acceptance tracking.
- `src/models/service.model.ts`
  Admin-managed service catalog.

## If you want to change X, edit Y

### Add or change an API endpoint

1. Add the route under the correct feature folder in `src/features/*/*.routes.ts`.
2. Put heavy logic in the feature controller or service, not directly in the route.
3. If the endpoint needs auth, use `authRequired` or `adminRequired`.
4. If the frontend calls it, update `frontend/src/api.js` or `frontend/src/config/apiBase.js`.

### Change how a full audit is queued

- Start in `src/features/audits/audits.controller.ts`
- Then check `src/features/audits/subscription-access.middleware.ts`
- Then follow into `src/server/runtime.ts` and `src/features/audits/full-audit.processor.ts`

### Change report generation or email attachments

- Score calculation: `src/features/audits/audit-scorecard.ts`
- Report generation: `src/features/audits/report-generation.ts`
- File metadata normalization: `src/features/audits/report-files.ts`
- Download API shaping: `src/features/audits/analysis-reports.ts`
- Outgoing email packaging: `src/features/audits/report-delivery.ts`

### Change what the frontend sees in analysis detail

- Backend detail shape: `src/features/audits/analysis-details.ts`
- Auth detail route: `src/features/auth/auth.routes.ts`
- Frontend screen: `../frontend/src/pages/AnalysisDetail.js`

### Change subscription rules or available plans

- Plan catalog: `src/features/billing/subscription-plans.ts`
- Upgrade/cancel/checkout behavior: `src/features/billing/subscription.controller.ts`
- Team behavior: `src/features/billing/team.controller.ts`
- Stripe side effects: `src/features/billing/stripe-webhook.service.ts`

### Change blog, FAQ, legal, or contact behavior

- Public content fetch routes:
  `src/features/content/content.routes.ts`
- Admin content CRUD:
  `src/features/admin/admin.routes.ts`
- Legal workflow:
  `src/features/legal/legal.routes.ts`
  `src/features/legal/legal.service.ts`
- Contact intake:
  `src/features/contact/contact.routes.ts`
  `src/features/contact/contact-notifications.ts`

## Tests

Backend tests live in `tests/` and cover mostly service-level logic.

Strongly covered areas:

- queue factory and job queue behavior
- cache cleanup
- env parsing
- report generation and retention helpers
- scanner client/service helpers
- legal serializers
- billing and email helper logic

What is not strongly covered:

- end-to-end API startup
- route integration across auth, admin, and frontend flows
- scanner server process behavior as a running service

## Important caveats and cleanup notes

### Active vs legacy router trees

`src/routes/v1.ts` is legacy and is not the active router tree anymore. It references missing or outdated modules such as old healthcare/certification/regression routes and an outdated middleware path. Use `src/features/register-features.ts` as the real entrypoint map.

### Scheduler feature looks incomplete

`src/features/scheduler/` is not mounted by the active app. It also depends on `node-cron`, which is not declared in `package.json`. Treat it as inactive or unfinished unless you intentionally revive it.

### Queue backend behavior matters

- If `REDIS_URL` or `QUEUE_REDIS_URL` is set, the app defaults to BullMQ.
- Otherwise it uses the persistent in-process queue backend.

That choice changes operational behavior, so check `src/config/env.ts` before debugging queue issues.

### Database can be optional at startup

If `MONGO_URL` is missing, the app logs a warning and starts without a DB connection. That is convenient for local exploration but can make feature failures look confusing later.
