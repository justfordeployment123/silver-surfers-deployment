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

## Deployment and verification

Redeploy the AWS backend API and worker, and the Hostinger Next.js frontend using the existing hosting instructions. No new environment variables or separate webhook endpoint are required.

Verify a draft does not appear on Explore, publish a configured course, open its checkout and confirm the Stripe product and price. In an appropriate payment-testing environment, complete payment and check the dashboard, course access, and saved progress. The deployed staging account intentionally uses live Stripe credentials, so completing a checkout there may charge real money.

No real charge was made during automated testing. Stripe prices and payments were covered through validation and mocked tests.
