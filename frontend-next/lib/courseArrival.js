// Milestone 3.2 Developer Plan, Module 6. Buyers come back from a GHL
// checkout through the agreed /dashboard link; these helpers decide where
// they land after signing in and what the Explore Enroll button does.

const isSitePath = (path) => typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');

export function isCourseArrival(path) {
  return isSitePath(path) && (path === '/dashboard' || path.startsWith('/courses/'));
}

// A sign-in that just unlocked purchased courses goes to the dashboard,
// unless the user was already headed to a specific page.
export function postSignInTarget(target, claimedCourses) {
  const safeTarget = isSitePath(target) ? target : '/';
  if (claimedCourses > 0 && safeTarget === '/') return '/dashboard';
  return safeTarget;
}

const isHttpsUrl = (value) => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};

// Explore card CTA for a course from GET /courses (publicCourse shape).
export function courseCta(course) {
  const analyticsId = `training_${course.slug}`;
  if (course.checkoutMethod === 'ghl' && isHttpsUrl(course.checkoutUrl)) {
    return { label: 'Enroll now', href: course.checkoutUrl, ghl: true, analyticsId };
  }
  return { label: 'Purchase course', productKey: `course:${course.slug}`, analyticsId };
}

// Module 7: what the training page shows about the course's GHL workbook.
// Buyers who own it get a note (GHL emails the PDF); others get the order
// form link, when one is configured.
export function workbookOffer({ workbookUrl, ownsWorkbook } = {}) {
  if (ownsWorkbook) return { kind: 'owned' };
  if (isHttpsUrl(workbookUrl)) return { kind: 'offer', href: workbookUrl };
  return null;
}
