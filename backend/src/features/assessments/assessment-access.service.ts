import Assessment from '../../models/assessment.model.ts';
import { QUESTIONNAIRE_VERSION } from './assessment-questions.ts';

// An AI Readiness Assessment bought through a GoHighLevel order form. Shared
// by the GHL webhook (verified buyer) and by claiming a pending grant after
// the buyer registers. Idempotent on the GHL order id.
export async function grantAssessment(input: {
  userId: unknown;
  externalOrderId: string;
  amountCents?: number;
}): Promise<'created' | 'duplicate'> {
  try {
    await Assessment.create({
      userId: input.userId,
      status: 'purchased',
      questionnaireVersion: QUESTIONNAIRE_VERSION,
      externalOrderId: input.externalOrderId,
      amount: input.amountCents || 0,
    });
    return 'created';
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) return 'duplicate';
    throw error;
  }
}
