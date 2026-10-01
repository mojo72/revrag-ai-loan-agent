import { ELIGIBILITY_RULES, PRODUCTS, type ProductId } from './products.js';

export function calcEmi(principal: number, annualRatePct: number, months: number): number {
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

export function emiBreakdown(principal: number, annualRatePct: number, months: number) {
  const emi = calcEmi(principal, annualRatePct, months);
  const total = emi * months;
  return {
    emi: Math.round(emi),
    totalPayable: Math.round(total),
    totalInterest: Math.round(total - principal),
  };
}

/** Largest principal whose EMI fits in the given monthly budget. */
export function principalForEmi(emiBudget: number, annualRatePct: number, months: number): number {
  const r = annualRatePct / 12 / 100;
  const f = Math.pow(1 + r, months);
  return (emiBudget * (f - 1)) / (r * f);
}

export const CREDIT_BANDS = ['750+', '700-749', '650-699', 'Below 650', "Don't know"] as const;
export type CreditBand = (typeof CREDIT_BANDS)[number];

/** Indicative rate: better credit band gets closer to the product's floor rate. */
export function indicativeRate(product: ProductId, band: CreditBand | undefined): number {
  const p = PRODUCTS[product];
  const spread = p.maxRate - p.minRate;
  const position: Record<CreditBand, number> = {
    '750+': 0,
    '700-749': 0.25,
    '650-699': 0.55,
    'Below 650': 1,
    "Don't know": 0.4,
  };
  return +(p.minRate + spread * position[band ?? "Don't know"]).toFixed(2);
}

export interface EligibilityInput {
  product: ProductId;
  requestedAmount?: number;
  tenureMonths?: number;
  age?: number;
  employmentType?: 'salaried' | 'self_employed';
  monthlyIncome?: number;
  existingEmi?: number;
  creditBand?: CreditBand;
}

export interface EligibilityResult {
  eligible: boolean;
  maxEligibleAmount: number;
  indicativeRate: number;
  emiForRequested?: number;
  reasons: string[];
}

export function checkEligibility(i: EligibilityInput): EligibilityResult {
  const p = PRODUCTS[i.product];
  const reasons: string[] = [];
  const rate = indicativeRate(i.product, i.creditBand);
  const tenure = Math.min(Math.max(i.tenureMonths ?? p.maxTenureMonths, p.minTenureMonths), p.maxTenureMonths);

  const minIncome =
    i.employmentType === 'self_employed'
      ? ELIGIBILITY_RULES.minMonthlyIncomeSelfEmployed
      : ELIGIBILITY_RULES.minMonthlyIncomeSalaried;

  if (i.age !== undefined && i.age < ELIGIBILITY_RULES.minAge) reasons.push(`Minimum age is ${ELIGIBILITY_RULES.minAge}.`);
  if (i.age !== undefined && i.age + tenure / 12 > ELIGIBILITY_RULES.maxAgeAtMaturity)
    reasons.push(`Loan must end before age ${ELIGIBILITY_RULES.maxAgeAtMaturity}; try a shorter tenure.`);
  if ((i.monthlyIncome ?? 0) < minIncome) reasons.push(`Minimum monthly income for this profile is ₹${minIncome.toLocaleString('en-IN')}.`);
  if (i.creditBand === 'Below 650') reasons.push('Credit score below 650 does not meet our policy.');

  const emiBudget = Math.max(0, (i.monthlyIncome ?? 0) * ELIGIBILITY_RULES.maxFoir - (i.existingEmi ?? 0));
  if (emiBudget <= 0 && (i.monthlyIncome ?? 0) > 0) reasons.push('Existing EMIs already use up 50% of your income.');

  const rawMax = emiBudget > 0 ? principalForEmi(emiBudget, rate, tenure) : 0;
  const maxEligibleAmount = Math.min(p.maxAmount, Math.floor(rawMax / 10_000) * 10_000);
  if (maxEligibleAmount < p.minAmount && reasons.length === 0) reasons.push('Income supports less than the minimum loan amount.');

  return {
    eligible: reasons.length === 0,
    maxEligibleAmount: Math.max(0, maxEligibleAmount),
    indicativeRate: rate,
    emiForRequested: i.requestedAmount ? Math.round(calcEmi(i.requestedAmount, rate, tenure)) : undefined,
    reasons,
  };
}

export function ageFromDob(dob: string): number | undefined {
  const d = new Date(dob);
  if (isNaN(d.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}
