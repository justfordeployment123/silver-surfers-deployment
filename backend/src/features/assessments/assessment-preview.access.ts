import type { Request } from 'express';

function invitedEmails(): Set<string> {
  return new Set(
    String(process.env.ASSESSMENT_PREVIEW_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function canUseAssessmentPreview(user: Request['user']): boolean {
  if (process.env.ASSESSMENT_PREVIEW_ENABLED !== 'true' || !user?.email || user.verified !== true) {
    return false;
  }

  return invitedEmails().has(user.email.trim().toLowerCase());
}

export function canAccessAssessment(
  assessment: { source?: string },
  user: Request['user'],
): boolean {
  return assessment.source !== 'preview' || canUseAssessmentPreview(user);
}
