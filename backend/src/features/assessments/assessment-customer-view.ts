// A generated report is an internal draft until staff approves it. Do not
// rely on the frontend hiding it: API customers must not receive the draft.
export function assessmentForCustomer<T extends { status: string; aiReport?: unknown; adminReview?: unknown }>(assessment: T): Omit<T, 'aiReport' | 'adminReview'> & { aiReport?: unknown } {
  const { aiReport, adminReview: _adminReview, ...rest } = assessment;
  if (assessment.status === 'report_ready' || assessment.status === 'delivered') {
    return { ...rest, aiReport };
  }
  return rest;
}
