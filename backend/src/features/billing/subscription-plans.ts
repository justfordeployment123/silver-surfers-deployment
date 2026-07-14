export interface SubscriptionPlanLimits {
  // Annual scan allotment when billed yearly. When billed monthly, the
  // effective per-period limit is this value divided by 12 (see getLimitsForCycle).
  scansPerMonth: number;
  maxUsers: number;
  features: string[];
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price?: number;
  yearlyPrice?: number | null;
  yearlyPriceId?: string;
  monthlyPrice?: number | null;
  monthlyPriceId?: string;
  currency: string;
  type?: string;
  isOneTime?: boolean;
  limits: SubscriptionPlanLimits;
  icon?: string;
  gradient?: string;
  popular?: boolean;
  contactSales?: boolean;
  buttonText?: string;
}

export type BillingCycle = 'monthly' | 'yearly';

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  oneTime: {
    id: 'oneTime',
    name: 'One-Time',
    description: 'Perfect for getting started',
    price: 39700,
    currency: 'usd',
    type: 'one-time',
    isOneTime: true,
    limits: {
      scansPerMonth: 1,
      maxUsers: 1,
      features: [
        'One device tested',
        'up to 25 subpages scanned',
        'Detailed PDF report',
        'Actionable recommendations',
        '17-category analysis',
        'Email support',
      ],
    },
    gradient: 'from-blue-500 to-indigo-500',
    popular: false,
    buttonText: 'Get Report',
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    description: '',
    yearlyPriceId: process.env.STRIPE_STARTER_YEARLY_PRICE_ID,
    yearlyPrice: 144000, // $120/month billed yearly ($1,440/year)
    monthlyPriceId: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
    monthlyPrice: 14000, // $140/month billed monthly ($1,680/year)
    currency: 'usd',
    limits: {
      scansPerMonth: 60,
      maxUsers: 1,
      features: [
        '60 reports per year',
        'Select device per report',
        'up to 25 subpages scanned',
        '1 user account',
        'PDF reports',
        'Actionable recommendations',
        'Priority email support',
      ],
    },
    gradient: 'from-blue-500 to-green-500',
    popular: false,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: '',
    yearlyPriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
    yearlyPrice: 478800, // $399/month billed annually ($4,788/year)
    monthlyPriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    monthlyPrice: 46000, // $460/month billed monthly ($5,520/year)
    currency: 'usd',
    limits: {
      scansPerMonth: 144,
      maxUsers: 3,
      features: [
        '144 reports per year',
        'All devices tested together',
        'up to 25 subpages scanned',
        '3 team users',
        'SilverSurfers Seal',
        'Priority support',
        'Historical tracking',
        'White-label reports',
        'Quarterly consultation',
      ],
    },
    gradient: 'from-green-500 to-teal-500',
    popular: true,
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    description: 'Tailored solutions for enterprise-level accessibility needs.',
    monthlyPrice: null,
    yearlyPrice: null,
    currency: 'usd',
    limits: {
      scansPerMonth: -1,
      maxUsers: -1,
      features: [
        'SilverSurfers Score',
        'Unlimited scans',
        'SilverSurfers Seal of Approval',
        'Unlimited team users',
        'Advanced analytics',
        'API access',
        'White labeling options',
        'Dedicated support',
        'Custom integrations',
      ],
    },
    gradient: 'from-purple-500 to-blue-500',
    popular: false,
    contactSales: true,
  },
};

export function getPlanById(planId: string | null | undefined): SubscriptionPlan | null {
  if (!planId) {
    return null;
  }

  return SUBSCRIPTION_PLANS[planId] || null;
}

export function getPlanByPriceId(
  priceId: string | null | undefined,
): { plan: SubscriptionPlan; billingCycle: BillingCycle } | null {
  if (!priceId) {
    return null;
  }

  for (const plan of Object.values(SUBSCRIPTION_PLANS)) {
    if (plan.yearlyPriceId === priceId) {
      return { plan, billingCycle: 'yearly' };
    }
    if (plan.monthlyPriceId === priceId) {
      return { plan, billingCycle: 'monthly' };
    }
  }

  return null;
}

export function getPriceIdForCycle(plan: SubscriptionPlan, billingCycle: BillingCycle): string | undefined {
  return billingCycle === 'monthly' ? plan.monthlyPriceId : plan.yearlyPriceId;
}

// The monthly-billed plan grants the annual scan allotment divided by 12 per (monthly) period.
export function getLimitsForCycle(plan: SubscriptionPlan, billingCycle: BillingCycle): SubscriptionPlanLimits {
  const { scansPerMonth } = plan.limits;
  if (billingCycle !== 'monthly' || scansPerMonth === -1) {
    return plan.limits;
  }

  return { ...plan.limits, scansPerMonth: Math.floor(scansPerMonth / 12) };
}

export function getAvailablePlans(): SubscriptionPlan[] {
  return Object.values(SUBSCRIPTION_PLANS);
}

export function getPublicPlans(): Array<Record<string, unknown>> {
  return getAvailablePlans().map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: plan.price,
    yearlyPrice: plan.yearlyPrice,
    monthlyPrice: plan.monthlyPrice,
    currency: plan.currency,
    type: plan.type,
    isOneTime: plan.isOneTime,
    limits: plan.limits,
    icon: plan.icon,
    gradient: plan.gradient,
    popular: plan.popular,
    contactSales: plan.contactSales,
  }));
}
