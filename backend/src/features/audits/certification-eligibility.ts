/**
 * Certification eligibility logic for the SilverSurfers platform.
 *
 * Determines whether a site's Silver Score qualifies for Silver Certification™,
 * conditional improvement status, or no eligibility.
 *
 * This is the foundation-level implementation for Milestone 1.
 * Full badge issuance, public registry, and litigation defense packs are M4/M6 scope.
 */

export type CertificationTier = 'silver-certified' | 'conditional' | 'not-eligible';

export interface CertificationEligibility {
  tier: CertificationTier;
  eligible: boolean;
  score: number;
  threshold: number;
  message: string;
  improvementNeeded: number;
  validForDays: number;
  evaluatedAt: string;
}

const SILVER_CERTIFIED_THRESHOLD = 80;
const CONDITIONAL_THRESHOLD = 70;
const CERTIFICATION_VALID_DAYS = 365;

/**
 * Evaluates certification eligibility based on the Silver Score.
 *
 * Silver Certified:  score ≥ 80  — meets the Silver Web Excellence standard
 * Conditional:       score 70–79 — close, targeted remediation required
 * Not Eligible:      score < 70  — below the minimum for certification consideration
 */
export function getCertificationEligibility(score: number): CertificationEligibility {
  const normalizedScore = Number.isFinite(score) ? Math.round(score * 100) / 100 : 0;
  const evaluatedAt = new Date().toISOString();

  if (normalizedScore >= SILVER_CERTIFIED_THRESHOLD) {
    return {
      tier: 'silver-certified',
      eligible: true,
      score: normalizedScore,
      threshold: SILVER_CERTIFIED_THRESHOLD,
      improvementNeeded: 0,
      message: `This site meets the Silver Certified threshold with a score of ${normalizedScore}. It demonstrates a strong commitment to accessible, senior-friendly design.`,
      validForDays: CERTIFICATION_VALID_DAYS,
      evaluatedAt,
    };
  }

  if (normalizedScore >= CONDITIONAL_THRESHOLD) {
    const gap = SILVER_CERTIFIED_THRESHOLD - normalizedScore;
    return {
      tier: 'conditional',
      eligible: false,
      score: normalizedScore,
      threshold: SILVER_CERTIFIED_THRESHOLD,
      improvementNeeded: gap,
      message: `This site is ${Math.round(gap)} points below the Silver Certified threshold. Addressing the Quick Wins in this report could close the gap significantly.`,
      validForDays: 0,
      evaluatedAt,
    };
  }

  const gap = SILVER_CERTIFIED_THRESHOLD - normalizedScore;
  return {
    tier: 'not-eligible',
    eligible: false,
    score: normalizedScore,
    threshold: SILVER_CERTIFIED_THRESHOLD,
    improvementNeeded: gap,
    message: `This site requires a score improvement of ${Math.round(gap)} points to reach the Silver Certified standard. Begin with the Quick Wins in the remediation roadmap.`,
    validForDays: 0,
    evaluatedAt,
  };
}

/**
 * Returns a short human-readable label for a certification tier.
 */
export function getCertificationTierLabel(tier: CertificationTier): string {
  switch (tier) {
    case 'silver-certified': return 'Silver Certified™';
    case 'conditional': return 'Conditional — Improvement Required';
    case 'not-eligible': return 'Not Eligible';
  }
}
