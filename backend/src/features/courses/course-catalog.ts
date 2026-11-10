export function normalizeCourseDetails(body: any) {
  const slug = String(body.slug || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if (!slug || slug.length > 100) throw new Error('Enter a course slug of 1 to 100 characters.');
  const description = String(body.description || '').trim();
  const status = body.status === 'published' ? 'published' : 'draft';
  const stripePriceId = String(body.stripePriceId || '').trim();
  if (status === 'published') {
    if (!description) throw new Error('A description is required before publishing.');
    if (!/^price_[a-zA-Z0-9]+$/.test(stripePriceId)) throw new Error('A Stripe Price ID is required before publishing.');
    if (!body.modules?.length || body.modules.some((module: any) => !module.lessons?.length || module.lessons.some((lesson: any) => !lesson.youtubeId && !lesson.description))) throw new Error('Add complete modules and lessons before publishing.');
  }
  return {slug,description,status,stripePriceId};
}

export function validateCoursePrice(price: any) {
  if (!price.active || price.type !== 'one_time') throw new Error('Choose an active one-time Stripe price.');
  if (!Number.isInteger(price.unit_amount) || price.unit_amount <= 0) throw new Error('Course price must have a positive fixed amount.');
  return { priceCents: price.unit_amount, currency: price.currency };
}

export function publicCourse(course: any) {
  return {id:String(course._id),slug:course.slug,title:course.title,description:course.description || '',priceCents:course.priceCents,currency:course.currency,moduleCount:course.modules?.length || 0,lessonCount:(course.modules || []).reduce((total: number,module: any)=>total+(module.lessons?.length || 0),0)};
}
