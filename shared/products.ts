// Loan product catalogue and policy knowledge for "Kosh Finance", a fictional lender used for this demo.
// The UI renders from this file and the agent's system prompt is built from it, so both always agree.

export type ProductId = 'personal' | 'home' | 'car' | 'business';

export interface LoanProduct {
  id: ProductId;
  name: string;
  tagline: string;
  minAmount: number;
  maxAmount: number;
  minRate: number; // % p.a.
  maxRate: number;
  minTenureMonths: number;
  maxTenureMonths: number;
  processingFee: string;
  approvalTime: string;
  disbursalTime: string;
  purposes: string[];
  highlights: string[];
}

export const PRODUCTS: Record<ProductId, LoanProduct> = {
  personal: {
    id: 'personal',
    name: 'Personal Loan',
    tagline: 'Collateral-free funds for anything life throws at you',
    minAmount: 50_000,
    maxAmount: 40_00_000,
    minRate: 10.49,
    maxRate: 24,
    minTenureMonths: 12,
    maxTenureMonths: 72,
    processingFee: 'Up to 2% of the loan amount + GST',
    approvalTime: 'Instant in-principle approval; final approval within 24 hours',
    disbursalTime: 'Within 24 hours of e-sign',
    purposes: ['Medical', 'Wedding', 'Travel', 'Home renovation', 'Education', 'Debt consolidation', 'Other'],
    highlights: ['No collateral', 'Zero foreclosure charges after 12 EMIs', '100% digital'],
  },
  home: {
    id: 'home',
    name: 'Home Loan',
    tagline: 'Own your home with long tenures and low rates',
    minAmount: 5_00_000,
    maxAmount: 5_00_00_000,
    minRate: 8.35,
    maxRate: 11.5,
    minTenureMonths: 60,
    maxTenureMonths: 360,
    processingFee: '0.5% of the loan amount, capped at ₹15,000',
    approvalTime: 'In-principle approval instantly; sanction in 3 to 5 working days after property verification',
    disbursalTime: 'After property legal and technical checks',
    purposes: ['Purchase of ready property', 'Under-construction property', 'Plot + construction', 'Balance transfer'],
    highlights: ['Up to 30 years tenure', 'Tax benefits under 80C and 24(b)', 'Doorstep document pickup'],
  },
  car: {
    id: 'car',
    name: 'Car Loan',
    tagline: 'Drive home your new or used car',
    minAmount: 1_00_000,
    maxAmount: 1_00_00_000,
    minRate: 8.9,
    maxRate: 14,
    minTenureMonths: 12,
    maxTenureMonths: 84,
    processingFee: '₹3,999 flat',
    approvalTime: 'Within 4 working hours',
    disbursalTime: 'Directly to the dealer within 24 hours',
    purposes: ['New car', 'Used car'],
    highlights: ['Up to 100% on-road funding', 'Tenure up to 7 years'],
  },
  business: {
    id: 'business',
    name: 'Business Loan',
    tagline: 'Working capital and expansion for your business',
    minAmount: 1_00_000,
    maxAmount: 50_00_000,
    minRate: 14,
    maxRate: 22,
    minTenureMonths: 12,
    maxTenureMonths: 60,
    processingFee: 'Up to 2.5% of the loan amount + GST',
    approvalTime: '48 to 72 hours',
    disbursalTime: 'Within 48 hours of approval',
    purposes: ['Working capital', 'Equipment purchase', 'Expansion', 'Inventory'],
    highlights: ['Collateral-free up to ₹50 lakh', 'Flexible repayment'],
  },
};

export const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[];

export const ELIGIBILITY_RULES = {
  minAge: 21,
  maxAgeAtMaturity: 60,
  minMonthlyIncomeSalaried: 25_000,
  minMonthlyIncomeSelfEmployed: 35_000,
  maxFoir: 0.5, // fixed obligations (all EMIs incl. this loan) may not exceed 50% of monthly income
  minCreditScoreBand: '650-699',
};

export const REQUIRED_DOCUMENTS = {
  common: ['PAN card', 'Aadhaar card (address proof)'],
  salaried: ['Last 3 months salary slips', 'Last 6 months bank statement'],
  self_employed: ['Last 2 years ITR', 'Last 12 months bank statement'],
};

export const AFTER_SUBMISSION = [
  'Application is submitted and you get an application ID instantly.',
  'Automated credit bureau check and document verification (usually under 2 hours).',
  'A credit officer reviews and issues a sanction letter (within 24 hours for personal loans).',
  'You e-sign the loan agreement and set up the EMI auto-debit (e-mandate).',
  'Money is disbursed to your registered bank account, typically within 24 hours of e-sign.',
];

export function formatINR(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

/** "5 lakh", "1.2 crore": how an Indian RM would say amounts out loud. */
export function speakINR(n: number): string {
  if (n >= 1_00_00_000) return `${+(n / 1_00_00_000).toFixed(2)} crore rupees`;
  if (n >= 1_00_000) return `${+(n / 1_00_000).toFixed(2)} lakh rupees`;
  return `${Math.round(n).toLocaleString('en-IN')} rupees`;
}
