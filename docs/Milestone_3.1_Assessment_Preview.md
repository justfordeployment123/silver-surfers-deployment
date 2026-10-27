# Milestone 3.1 assessment preview

This is an invitation-only route for three testers to try AI Edge and the real AI Readiness Assessment without Stripe checkout. The route is `/assessment-preview` on the staging SilverSurfers.ai site. It uses the same seven AI Edge modules, 36-question intake, AI report generation, staff review, and customer report view as the normal customer flows.

## Access and data

- The preview is off by default. The backend must have `ASSESSMENT_PREVIEW_ENABLED=true` and the signed-in account email must be in `ASSESSMENT_PREVIEW_EMAILS`.
- The allowlist is checked on the server for both preview creation and every assessment read, start, and answer. Knowing a preview assessment ID is not enough to access it.
- Each invited account gets one resumable preview assessment. Preview records are marked `source=preview`, omitted from the customer's paid-assessment dashboard, and labeled Preview in the staff review screen.
- AI Edge preview progress is stored in a separate collection from purchased course progress. The course preview is only available for the AI Edge course and is not listed as a purchase.
- This is logical separation, not a separate database. Preview answers and reports are stored in the same backend database as other assessments. Do not use sensitive or real customer information for this test.
- Turning the feature switch off blocks customer access to preview records. It does not delete the records or prevent staff from seeing them in the admin review queue.

## Set up the three testers

Deploy both the backend and `frontend-next` changes from this release before sharing the link. The backend can be deployed with the preview disabled; the frontend page will not grant access on its own.

1. Get the exact email address each person will use to sign in. Each person should have their own account. Their accounts can be created on staging and email-verified before the preview is enabled.
2. On the AWS backend host, edit `~/silver-surfers/backend/.env` and add:

   ```dotenv
   ASSESSMENT_PREVIEW_ENABLED=true
   ASSESSMENT_PREVIEW_EMAILS=person1@example.com,person2@example.com,person3@example.com
   ASSESSMENT_PREVIEW_URL=https://staging.silversurfers.ai/assessment-preview
   ```

   Replace the example emails. Do not add these values to the Hostinger frontend environment or commit real email addresses to Git.
3. Recreate only the API container so it receives the new environment values:

   ```bash
   cd ~/silver-surfers/backend
   docker compose -f docker-compose.backend-development.yml up -d --no-deps --force-recreate api
   docker compose -f docker-compose.backend-development.yml ps api
   curl -fsS http://127.0.0.1:8000/health
   ```

4. Each tester signs in with their allowlisted email and opens `https://staging.silversurfers.ai/assessment-preview`. The page links to the AI Edge course preview. The assessment's first visit shows Start assessment preview; later visits resume the same assessment.
5. After the last answer, a staff member opens the existing Admin Assessments screen, finds the record marked Preview, checks or edits the AI report, and approves it. The tester can then open the same preview URL to read the approved report. Report-ready email delivery also uses that URL if email is configured.

## Turn it off

Set `ASSESSMENT_PREVIEW_ENABLED=false` in the AWS backend `.env` and recreate only the API container with the command above. Do not change the Stripe keys or Price IDs. The normal paid purchase path is unaffected.

## Smoke checks

- An invited signed-in account can open AI Edge, watch the seven modules, and mark lessons complete without opening Stripe.
- An invited signed-in account can start, answer, resume, and view an approved assessment report without opening Stripe.
- A fourth signed-in account receives a 403 from the preview API and cannot open another person's preview assessment ID.
- The customer's normal dashboard does not show the preview as a purchase.
- AI Edge preview progress does not carry over to a later purchase.
- The admin queue labels the preview record and still requires manual approval before the customer sees the report.
- Disable the feature after testing and confirm the invited account can no longer open its preview record.

The invitation bypasses checkout only for AI Edge and AI Readiness Assessment. It does not test Stripe payment, webhooks, or paid entitlement creation. Those need a separate controlled checkout test. Public book links can be reviewed from the normal Explore page.
