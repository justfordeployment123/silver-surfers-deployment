# Training course management

Admins can create separately purchased training courses at `/admin/courses`.

## Add a course

1. Select Create training course.
2. Enter its title, unique slug, and description. The slug cannot change after creation because Stripe checkout uses it to identify the course.
3. Leave visibility as Draft while preparing the content.
4. Add modules and lessons. Six or seven modules are supported, but this is not a fixed limit.
5. Enter each lesson's title, YouTube link or video ID, and description.
6. Save the draft. Drafts are hidden from the public course catalog.
7. In the same Stripe account used by the backend, create a separate product and an active one-time fixed price for this course. Copy its `price_...` ID into Course Management. Do not paste Stripe API keys into the course editor.
8. Save to verify the price. Amount and currency are read from Stripe.
9. Select Published and save. A description, valid price, and complete modules and lessons are required.
10. The new course appears on Explore using the existing product-card design. Customers sign in and purchase through Stripe.

## Access and progress

- The signed Stripe payment webhook grants access to the specific purchased course.
- An unpaid checkout does not grant access.
- Course progress is stored separately for each customer and course.
- Repeated delivery of the same webhook preserves existing progress.
- Setting a course back to Draft removes it from the catalog and blocks new checkout. Existing purchasers retain their access.
- Existing AI Edge purchase buttons, environment variables, and entitlements continue to work.

## Selling a course through GoHighLevel (Milestone 3.2)

A course can be sold through a GHL order form instead of native Stripe checkout.

1. In Course Management, set **Checkout method** to *GoHighLevel order form*.
2. Paste the GHL order form URL and enter the display price shown on Explore. The real price is set in GHL. Optionally, paste a workbook order form URL.
3. Publish. The Enroll button on Explore opens the order form in the same tab. AI Edge keeps its own Explore card and switches to its GHL form automatically once it's published that way.
4. In GHL, each payment workflow calls `POST /integrations/ghl/purchase` once per product bought. The body is `{ orderId, email, courseSlug, item: "course" | "workbook", amount }`, and the shared secret goes in the `X-SilverSurfers-Secret` header or the `?token=` query parameter.
5. Buyers with a verified account get access immediately. Other emails get a pending grant, which is claimed when that email verifies, logs in or resets its password. Unverified accounts never receive a course.
6. The GHL thank-you page and welcome email link to `/dashboard`.

**Customer access** (bottom of Course Management) grants or removes a course or workbook by email, and lists purchases still waiting for sign-up. Use it when a buyer checked out with a different email, after a refund, or for comps. Removing access keeps the buyer's progress.

The training page shows a "Get the workbook" card to buyers who don't own the workbook, linking to the course's workbook order form. GHL emails the PDF itself.

### Required backend environment variable

`GHL_WEBHOOK_SECRET`: a long random string, shared with the GHL webhook step. If it isn't set, the endpoint returns 503 and grants nothing. Generate one with `openssl rand -hex 32`.

## Deployment and verification

Redeploy the AWS backend API and worker, and the Hostinger Next.js frontend using the existing hosting instructions. Native Stripe course checkout needs no new environment variables. GHL checkout needs `GHL_WEBHOOK_SECRET` in the backend `.env` (see above).

Verify a draft does not appear on Explore, publish a configured course, open its checkout and confirm the Stripe product and price. In an appropriate payment-testing environment, complete payment and check the dashboard, course access, and saved progress. The deployed staging account intentionally uses live Stripe credentials, so completing a checkout there may charge real money.

No real charge was made during automated testing. Stripe prices and payments were covered through validation and mocked tests.
