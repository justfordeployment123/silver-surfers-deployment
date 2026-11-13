// Milestone 3.2 Developer Plan, Module 5: GHL order form links are shown
// to customers as Enroll / workbook buttons, so only https URLs are stored.
function httpsUrl(value: unknown, label: string): string {
  const input = String(value ?? '').trim();
  if (!input) return '';
  let url: URL;
  try { url = new URL(input); } catch { throw new Error(`${label} must be a full https:// link.`); }
  if (url.protocol !== 'https:' || !url.hostname) throw new Error(`${label} must be a full https:// link.`);
  return input;
}

function displayPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const cents = Number(value);
  if (!Number.isInteger(cents) || cents <= 0) throw new Error('Display price must be a positive amount.');
  return cents;
}

export function normalizeCourseDetails(body: any) {
  const slug = String(body.slug || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if (!slug || slug.length > 100) throw new Error('Enter a course slug of 1 to 100 characters.');
  const description = String(body.description || '').trim();
  const status = body.status === 'published' ? 'published' : 'draft';
  const stripePriceId = String(body.stripePriceId || '').trim();
  const checkoutMethod = body.checkoutMethod === 'ghl' ? 'ghl' : 'stripe';
  const ghlCheckoutUrl = httpsUrl(body.ghlCheckoutUrl, 'GHL order form URL');
  const ghlWorkbookUrl = httpsUrl(body.ghlWorkbookUrl, 'GHL workbook order form URL');
  const displayPriceCents = displayPrice(body.displayPriceCents);
  if (status === 'published') {
    if (!description) throw new Error('A description is required before publishing.');
    if (checkoutMethod === 'stripe' && !/^price_[a-zA-Z0-9]+$/.test(stripePriceId)) throw new Error('A Stripe Price ID is required before publishing.');
    if (checkoutMethod === 'ghl' && !ghlCheckoutUrl) throw new Error('A GHL order form URL is required before publishing.');
    if (checkoutMethod === 'ghl' && !displayPriceCents) throw new Error('A display price is required before publishing.');
    if (!body.modules?.length || body.modules.some((module: any) => !module.lessons?.length || module.lessons.some((lesson: any) => !lesson.youtubeId && !lesson.description))) throw new Error('Add complete modules and lessons before publishing.');
  }
  return {slug,description,status,stripePriceId,checkoutMethod,ghlCheckoutUrl,ghlWorkbookUrl,displayPriceCents};
}

export function validateCoursePrice(price: any) {
  if (!price.active || price.type !== 'one_time') throw new Error('Choose an active one-time Stripe price.');
  if (!Number.isInteger(price.unit_amount) || price.unit_amount <= 0) throw new Error('Course price must have a positive fixed amount.');
  return { priceCents: price.unit_amount, currency: price.currency };
}

export function publicCourse(course: any) {
  const ghl = course.checkoutMethod === 'ghl';
  return {
    id:String(course._id),slug:course.slug,title:course.title,description:course.description || '',
    checkoutMethod: ghl ? 'ghl' : 'stripe',
    checkoutUrl: ghl ? course.ghlCheckoutUrl || '' : '',
    workbookUrl: course.ghlWorkbookUrl || '',
    priceCents: ghl ? course.displayPriceCents : course.priceCents,
    currency: ghl ? 'usd' : course.currency,
    moduleCount:course.modules?.length || 0,
    lessonCount:(course.modules || []).reduce((total: number,module: any)=>total+(module.lessons?.length || 0),0),
  };
}
