// Single source of truth for the loan journey: steps, fields, validation and normalisation.
// The React forms render from it, and the agent's tools and context are generated from it.

import { CREDIT_BANDS } from './finance.js';
import { PRODUCTS, PRODUCT_IDS, type ProductId } from './products.js';

export type FieldType = 'radio' | 'select' | 'text' | 'currency' | 'number' | 'date' | 'checkbox' | 'file';

export interface FileMeta {
  name: string;
  size: number;
  sample?: boolean;
}
export type FieldValue = string | number | boolean | FileMeta | undefined;
export type AppData = Record<string, FieldValue>;

export interface Option {
  value: string;
  label: string;
}

export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  required: boolean | ((d: AppData) => boolean);
  /** What the field means and how to fill it. Shown as a hint and given to the agent. */
  help: string;
  /** Short customer-facing hint under the input. */
  hint?: string;
  placeholder?: string;
  options?: Option[] | ((d: AppData) => Option[]);
  showIf?: (d: AppData) => boolean;
  sensitive?: boolean;
  normalize?: (raw: unknown, d: AppData) => FieldValue;
  validate?: (v: FieldValue, d: AppData) => string | null;
  prefix?: string;
  suffix?: string;
}

export type StepId =
  | 'discover'
  | 'loan'
  | 'eligibility'
  | 'personal'
  | 'employment'
  | 'address'
  | 'bank'
  | 'documents'
  | 'review'
  | 'submitted';

export interface StepDef {
  id: StepId;
  path: string;
  title: string;
  short: string;
  purpose: string;
  /** Customer-facing subtitle. */
  subtitle: string;
  fields: string[];
  /** Buttons on this screen the agent may press (besides next/back). */
  actions: { id: string; label: string; description: string }[];
}

// ---------- normalisers & validators ----------

const toNumber = (raw: unknown): number | undefined => {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return undefined;
  const s = raw.toLowerCase().replace(/[₹,\s]|rs\.?|inr|rupees?/g, '');
  const m = s.match(/^(\d+(?:\.\d+)?)(k|thousand|l|lakh|lakhs|lac|cr|crore|crores)?$/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  const mult: Record<string, number> = { k: 1e3, thousand: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 };
  return Math.round(n * (m[2] ? mult[m[2]] : 1));
};

const toBool = (raw: unknown): boolean => {
  if (typeof raw === 'boolean') return raw;
  return /^(true|yes|y|1|on|checked|agree|agreed)$/i.test(String(raw).trim());
};

const upper = (raw: unknown) => (raw == null ? undefined : String(raw).replace(/\s+/g, '').toUpperCase());
const trimmed = (raw: unknown) => (raw == null ? undefined : String(raw).trim());

const pattern = (re: RegExp, msg: string) => (v: FieldValue) => (typeof v === 'string' && !re.test(v) ? msg : null);

const range = (min: number, max: number, fmt = (n: number) => n.toLocaleString('en-IN')) => (v: FieldValue) =>
  typeof v === 'number' && (v < min || v > max) ? `Must be between ${fmt(min)} and ${fmt(max)}.` : null;

const opts = (...labels: string[]): Option[] => labels.map((l) => ({ value: l.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label: l }));

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan',
  'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

export const BANKS = [
  'HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra Bank', 'Yes Bank',
  'IndusInd Bank', 'Bank of Baroda', 'Punjab National Bank', 'Canara Bank', 'IDFC First Bank', 'Federal Bank',
];

const product = (d: AppData) => (d.product as ProductId) || 'personal';
const isSalaried = (d: AppData) => d.employment_type !== 'self_employed';

// ---------- fields ----------

export const FIELDS: Record<string, FieldDef> = {
  product: {
    id: 'product',
    label: 'Loan product',
    type: 'radio',
    required: true,
    help: 'Which loan the customer wants: personal, home, car or business.',
    options: PRODUCT_IDS.map((id) => ({ value: id, label: PRODUCTS[id].name })),
    normalize: (raw) => {
      const s = String(raw).toLowerCase();
      return PRODUCT_IDS.find((id) => s.includes(id)) ?? s;
    },
    validate: (v) => (PRODUCT_IDS.includes(v as ProductId) ? null : 'Choose personal, home, car or business.'),
  },
  amount: {
    id: 'amount',
    hint: "Must be within the limits of the loan you picked.",
    label: 'Loan amount',
    type: 'currency',
    prefix: '₹',
    required: true,
    help: 'How much the customer wants to borrow, in rupees. Must be within the product limits.',
    normalize: toNumber,
    validate: (v, d) => {
      const p = PRODUCTS[product(d)];
      return typeof v !== 'number' ? 'Enter an amount in rupees.' : range(p.minAmount, p.maxAmount, (n) => '₹' + n.toLocaleString('en-IN'))(v);
    },
  },
  tenure_months: {
    id: 'tenure_months',
    hint: "For example, 36 months = 3 years.",
    label: 'Tenure',
    type: 'number',
    suffix: 'months',
    required: true,
    help: 'Repayment period in MONTHS (3 years = 36). Must be within the product tenure limits.',
    normalize: (raw) => {
      if (typeof raw === 'number') return raw;
      const s = String(raw).toLowerCase();
      const n = parseFloat(s);
      if (isNaN(n)) return undefined;
      return /y(ea)?r/.test(s) ? Math.round(n * 12) : Math.round(n);
    },
    validate: (v, d) => {
      const p = PRODUCTS[product(d)];
      return typeof v !== 'number' ? 'Enter tenure in months.' : range(p.minTenureMonths, p.maxTenureMonths)(v);
    },
  },
  purpose: {
    id: 'purpose',
    label: 'Purpose of loan',
    type: 'select',
    required: true,
    help: 'What the money will be used for. Options depend on the product.',
    options: (d) => opts(...PRODUCTS[product(d)].purposes),
  },

  dob: {
    id: 'dob',
    hint: "You must be at least 21 years old.",
    label: 'Date of birth',
    type: 'date',
    required: true,
    help: 'Customer date of birth in YYYY-MM-DD format. Applicant must be at least 21.',
    normalize: (raw) => {
      const s = trimmed(raw);
      if (!s) return undefined;
      const d = new Date(s);
      return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
    },
    validate: pattern(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date (YYYY-MM-DD).'),
  },
  employment_type: {
    id: 'employment_type',
    label: 'Employment type',
    type: 'radio',
    required: true,
    help: 'Salaried (works for an employer) or self-employed (own business or profession).',
    options: [
      { value: 'salaried', label: 'Salaried' },
      { value: 'self_employed', label: 'Self-employed' },
    ],
    normalize: (raw) => (/self|business|own/i.test(String(raw)) ? 'self_employed' : /salar|job|employ/i.test(String(raw)) ? 'salaried' : String(raw)),
  },
  monthly_income: {
    id: 'monthly_income',
    hint: "Your in-hand salary after taxes.",
    label: 'Net monthly income',
    type: 'currency',
    prefix: '₹',
    required: true,
    help: 'Take-home (in-hand) income per month after taxes. For self-employed, average monthly income.',
    normalize: toNumber,
    validate: (v) => (typeof v !== 'number' || v <= 0 ? 'Enter monthly income in rupees.' : null),
  },
  existing_emi: {
    id: 'existing_emi',
    hint: "Enter 0 if you have no running loans.",
    label: 'Existing EMIs per month',
    type: 'currency',
    prefix: '₹',
    required: true,
    help: 'Total of all EMIs the customer currently pays each month (other loans, credit card EMIs). 0 if none.',
    normalize: (raw) => (/^(none|no|nil|zero)$/i.test(String(raw).trim()) ? 0 : toNumber(raw)),
    validate: (v) => (typeof v !== 'number' || v < 0 ? 'Enter 0 if there are no existing EMIs.' : null),
  },
  credit_band: {
    id: 'credit_band',
    hint: "Not sure? Pick \"Don't know\". This check won't affect your score.",
    label: 'Credit score (approx.)',
    type: 'select',
    required: true,
    help: "Self-declared CIBIL score range. Pick \"Don't know\" if unsure; we verify it with the bureau later.",
    options: CREDIT_BANDS.map((b) => ({ value: b, label: b })),
    normalize: (raw) => {
      const s = String(raw).toLowerCase();
      const n = parseInt(s, 10);
      if (!isNaN(n)) return n >= 750 ? '750+' : n >= 700 ? '700-749' : n >= 650 ? '650-699' : 'Below 650';
      if (/know|unsure|not sure/.test(s)) return "Don't know";
      return CREDIT_BANDS.find((b) => b.toLowerCase() === s) ?? String(raw);
    },
  },

  full_name: {
    id: 'full_name',
    hint: "Exactly as printed on your PAN card.",
    label: 'Full name (as on PAN)',
    type: 'text',
    required: true,
    help: 'Legal name exactly as printed on the PAN card.',
    normalize: trimmed,
    validate: (v) => (typeof v === 'string' && v.split(/\s+/).length < 2 ? 'Enter first and last name.' : null),
  },
  gender: {
    id: 'gender',
    label: 'Gender',
    type: 'radio',
    required: true,
    help: 'Gender as per official ID.',
    options: opts('Male', 'Female', 'Other'),
    normalize: (raw) => String(raw).toLowerCase(),
  },
  marital_status: {
    id: 'marital_status',
    label: 'Marital status',
    type: 'select',
    required: true,
    help: 'Single, married, divorced or widowed.',
    options: opts('Single', 'Married', 'Divorced', 'Widowed'),
    normalize: (raw) => String(raw).toLowerCase(),
  },
  pan: {
    id: 'pan',
    hint: "Format: ABCDE1234F",
    label: 'PAN',
    type: 'text',
    required: true,
    sensitive: true,
    placeholder: 'ABCDE1234F',
    help: '10-character PAN: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).',
    normalize: upper,
    validate: pattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN must look like ABCDE1234F.'),
  },
  email: {
    id: 'email',
    hint: "Your sanction letter is sent here.",
    label: 'Email',
    type: 'text',
    required: true,
    help: 'Email where the sanction letter and updates will be sent.',
    normalize: (raw) => trimmed(raw)?.toLowerCase().replace(/\s+at\s+/, '@').replace(/\s+dot\s+/g, '.').replace(/\s/g, ''),
    validate: pattern(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i, 'Enter a valid email address.'),
  },
  mobile: {
    id: 'mobile',
    hint: "We'll send an OTP to verify later.",
    label: 'Mobile number',
    type: 'text',
    required: true,
    prefix: '+91',
    help: '10-digit Indian mobile number starting with 6, 7, 8 or 9.',
    normalize: (raw) => String(raw).replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''),
    validate: pattern(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number.'),
  },

  employer_name: {
    id: 'employer_name',
    label: 'Employer / company name',
    type: 'text',
    required: isSalaried,
    showIf: isSalaried,
    help: 'Name of the company the customer works for.',
    normalize: trimmed,
  },
  designation: {
    id: 'designation',
    label: 'Designation',
    type: 'text',
    required: isSalaried,
    showIf: isSalaried,
    help: 'Job title, e.g. Software Engineer, Manager.',
    normalize: trimmed,
  },
  work_experience_years: {
    id: 'work_experience_years',
    label: 'Total work experience',
    type: 'number',
    suffix: 'years',
    required: isSalaried,
    showIf: isSalaried,
    help: 'Total years of work experience across all jobs.',
    normalize: toNumber,
    validate: range(0, 45),
  },
  business_name: {
    id: 'business_name',
    label: 'Business name',
    type: 'text',
    required: (d) => !isSalaried(d),
    showIf: (d) => !isSalaried(d),
    help: 'Registered name of the business or practice.',
    normalize: trimmed,
  },
  years_in_business: {
    id: 'years_in_business',
    hint: "Minimum 2 years.",
    label: 'Years in business',
    type: 'number',
    suffix: 'years',
    required: (d) => !isSalaried(d),
    showIf: (d) => !isSalaried(d),
    help: 'How long the business has been operating. Minimum 2 years.',
    normalize: toNumber,
    validate: (v) => (typeof v === 'number' && v < 2 ? 'Business must be at least 2 years old.' : null),
  },
  annual_turnover: {
    id: 'annual_turnover',
    label: 'Annual turnover',
    type: 'currency',
    prefix: '₹',
    required: (d) => !isSalaried(d),
    showIf: (d) => !isSalaried(d),
    help: 'Gross annual revenue of the business as per the latest ITR.',
    normalize: toNumber,
  },

  address_line1: {
    id: 'address_line1',
    label: 'Address line 1',
    type: 'text',
    required: true,
    help: 'House / flat number, building and street of the current residence.',
    normalize: trimmed,
  },
  address_line2: {
    id: 'address_line2',
    label: 'Address line 2 (optional)',
    type: 'text',
    required: false,
    help: 'Area, locality or landmark.',
    normalize: trimmed,
  },
  city: { id: 'city', label: 'City', type: 'text', required: true, help: 'City of current residence.', normalize: trimmed },
  state: {
    id: 'state',
    label: 'State',
    type: 'select',
    required: true,
    help: 'State of current residence.',
    options: INDIAN_STATES.map((s) => ({ value: s, label: s })),
    normalize: (raw) => INDIAN_STATES.find((s) => s.toLowerCase() === String(raw).trim().toLowerCase()) ?? String(raw),
    validate: (v) => (INDIAN_STATES.includes(String(v)) ? null : 'Pick a state from the list.'),
  },
  pincode: {
    id: 'pincode',
    label: 'PIN code',
    type: 'text',
    required: true,
    help: '6-digit postal PIN code.',
    normalize: (raw) => String(raw).replace(/\D/g, ''),
    validate: pattern(/^[1-9]\d{5}$/, 'PIN code must be 6 digits.'),
  },
  residence_type: {
    id: 'residence_type',
    label: 'Residence type',
    type: 'radio',
    required: true,
    help: 'Whether the customer owns the home, rents it, or lives with parents/family.',
    options: opts('Owned', 'Rented', 'Parental'),
    normalize: (raw) => {
      const s = String(raw).toLowerCase();
      return /own/.test(s) ? 'owned' : /rent/.test(s) ? 'rented' : /parent|family/.test(s) ? 'parental' : s;
    },
  },
  years_at_address: {
    id: 'years_at_address',
    label: 'Years at current address',
    type: 'number',
    suffix: 'years',
    required: true,
    help: 'How many years the customer has lived at this address.',
    normalize: toNumber,
    validate: range(0, 80),
  },
  permanent_same: {
    id: 'permanent_same',
    label: 'Permanent address is the same as current address',
    type: 'checkbox',
    required: false,
    help: 'Tick if the permanent address matches the current one.',
    normalize: toBool,
  },
  permanent_address: {
    id: 'permanent_address',
    label: 'Permanent address',
    type: 'text',
    required: (d) => d.permanent_same === false,
    showIf: (d) => d.permanent_same === false,
    help: 'Full permanent address including city and PIN code.',
    normalize: trimmed,
  },

  bank_name: {
    id: 'bank_name',
    label: 'Bank',
    type: 'select',
    required: true,
    help: 'Bank where the loan will be disbursed and EMIs debited. Ideally the salary account.',
    options: BANKS.map((b) => ({ value: b, label: b })),
    normalize: (raw) => {
      const s = String(raw).toLowerCase().replace(/bank|\s/g, '');
      return BANKS.find((b) => b.toLowerCase().replace(/bank|\s/g, '') === s) ?? BANKS.find((b) => b.toLowerCase().replace(/\s/g, '').includes(s)) ?? String(raw);
    },
    validate: (v) => (BANKS.includes(String(v)) ? null : 'Pick a bank from the list.'),
  },
  account_holder: {
    id: 'account_holder',
    label: 'Account holder name',
    type: 'text',
    required: true,
    help: 'Name on the bank account. Should match the applicant name.',
    normalize: trimmed,
  },
  account_number: {
    id: 'account_number',
    hint: "The account where you want the money.",
    label: 'Account number',
    type: 'text',
    required: true,
    sensitive: true,
    help: '9 to 18 digit bank account number.',
    normalize: (raw) => String(raw).replace(/\D/g, ''),
    validate: pattern(/^\d{9,18}$/, 'Account number must be 9 to 18 digits.'),
  },
  ifsc: {
    id: 'ifsc',
    hint: "11 characters, printed on your cheque book.",
    label: 'IFSC code',
    type: 'text',
    required: true,
    placeholder: 'HDFC0001234',
    help: '11-character branch code: 4 letters, the digit 0, then 6 letters or digits (e.g. HDFC0001234). Printed on the cheque book.',
    normalize: upper,
    validate: pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC must look like HDFC0001234 (5th character is zero).'),
  },
  account_type: {
    id: 'account_type',
    label: 'Account type',
    type: 'radio',
    required: true,
    help: 'Savings or current account.',
    options: opts('Savings', 'Current'),
    normalize: (raw) => (/curr/i.test(String(raw)) ? 'current' : /sav/i.test(String(raw)) ? 'savings' : String(raw)),
  },
  emi_autodebit: {
    id: 'emi_autodebit',
    label: 'Set up EMI auto-debit (e-mandate) from this account',
    type: 'checkbox',
    required: false,
    help: 'Authorises automatic monthly EMI debit. Recommended to avoid missed payments.',
    normalize: toBool,
  },

  doc_pan: { id: 'doc_pan', label: 'PAN card', type: 'file', required: true, help: 'Clear photo or PDF of the PAN card.' },
  doc_aadhaar: { id: 'doc_aadhaar', label: 'Aadhaar card', type: 'file', required: true, help: 'Front and back of Aadhaar as address proof.' },
  doc_income: {
    id: 'doc_income',
    label: 'Income proof',
    type: 'file',
    required: true,
    help: 'Salaried: last 3 months salary slips. Self-employed: last 2 years ITR.',
  },
  doc_bank_statement: {
    id: 'doc_bank_statement',
    label: 'Bank statement',
    type: 'file',
    required: true,
    help: 'Last 6 months (salaried) or 12 months (self-employed) statement of the salary/primary account, as PDF.',
  },

  consent_terms: {
    id: 'consent_terms',
    label: 'I have read and accept the loan terms, KFS and privacy policy',
    type: 'checkbox',
    required: true,
    help: 'Customer must explicitly agree. The agent may only tick this after the customer says yes.',
    normalize: toBool,
    validate: (v) => (v === true ? null : 'Consent is required to submit.'),
  },
  consent_bureau: {
    id: 'consent_bureau',
    label: 'I authorise Bliss Finance to fetch my credit report from bureaus',
    type: 'checkbox',
    required: true,
    help: 'Permission for a credit bureau check. Agent may only tick this after the customer says yes.',
    normalize: toBool,
    validate: (v) => (v === true ? null : 'Bureau consent is required to submit.'),
  },
};

// ---------- steps ----------

export const STEPS: StepDef[] = [
  {
    id: 'discover',
    path: '/',
    title: 'Explore loans',
    short: 'Explore',
    purpose: 'Compare loan products and estimate EMIs before applying.',
    subtitle: "Compare loans and estimate your EMI.",
    fields: [],
    actions: [{ id: 'start_application', label: 'Apply now', description: 'Start the application (go to Loan details).' }],
  },
  {
    id: 'loan',
    path: '/apply/loan',
    title: 'Loan details',
    short: 'Loan',
    purpose: 'Choose the product, amount, tenure and purpose.',
    subtitle: "Tell us how much you need and for how long.",
    fields: ['product', 'amount', 'tenure_months', 'purpose'],
    actions: [],
  },
  {
    id: 'eligibility',
    path: '/apply/eligibility',
    title: 'Check eligibility',
    short: 'Eligibility',
    purpose: 'Quick check of age, income and obligations to compute how much the customer can borrow. No credit score impact.',
    subtitle: "A soft check to see how much you can borrow. No impact on your credit score.",
    fields: ['dob', 'employment_type', 'monthly_income', 'existing_emi', 'credit_band'],
    actions: [{ id: 'check_eligibility', label: 'Check eligibility', description: 'Run the eligibility engine with the entered details and show the result.' }],
  },
  {
    id: 'personal',
    path: '/apply/personal',
    title: 'Personal information',
    short: 'Personal',
    purpose: 'Identity and contact details used for KYC.',
    subtitle: "Used for KYC. Keep your PAN handy.",
    fields: ['full_name', 'gender', 'marital_status', 'pan', 'email', 'mobile'],
    actions: [],
  },
  {
    id: 'employment',
    path: '/apply/employment',
    title: 'Employment & income',
    short: 'Employment',
    purpose: 'Where the customer works and what they earn. Some values carry over from eligibility.',
    subtitle: "Where you work and what you earn.",
    fields: ['employment_type', 'employer_name', 'designation', 'work_experience_years', 'business_name', 'years_in_business', 'annual_turnover', 'monthly_income'],
    actions: [],
  },
  {
    id: 'address',
    path: '/apply/address',
    title: 'Address details',
    short: 'Address',
    purpose: 'Current and permanent residential address.',
    subtitle: "Where you live now.",
    fields: ['address_line1', 'address_line2', 'city', 'state', 'pincode', 'residence_type', 'years_at_address', 'permanent_same', 'permanent_address'],
    actions: [],
  },
  {
    id: 'bank',
    path: '/apply/bank',
    title: 'Bank details',
    short: 'Bank',
    purpose: 'Account for disbursal and EMI auto-debit.',
    subtitle: "Where we send the money and collect EMIs.",
    fields: ['bank_name', 'account_holder', 'account_number', 'ifsc', 'account_type', 'emi_autodebit'],
    actions: [],
  },
  {
    id: 'documents',
    path: '/apply/documents',
    title: 'Upload documents',
    short: 'Documents',
    purpose: 'KYC and income documents. The customer uploads files themselves; browsers do not let the agent pick files from the device.',
    subtitle: "Upload clear photos or PDFs.",
    fields: ['doc_pan', 'doc_aadhaar', 'doc_income', 'doc_bank_statement'],
    actions: [
      { id: 'attach_sample_documents', label: 'Use sample documents (demo)', description: 'DEMO ONLY: attach placeholder sample files for any missing documents. Only on explicit customer request.' },
    ],
  },
  {
    id: 'review',
    path: '/apply/review',
    title: 'Review & submit',
    short: 'Review',
    purpose: 'Final summary of everything entered, consents, and submission.',
    subtitle: "Check everything once before you submit.",
    fields: ['consent_terms', 'consent_bureau'],
    actions: [{ id: 'submit_application', label: 'Submit application', description: 'Submit the application. Only after every step is complete, both consents are given and the customer confirms.' }],
  },
  {
    id: 'submitted',
    path: '/apply/submitted',
    title: 'Application submitted',
    short: 'Done',
    purpose: 'Confirmation with the application ID and next steps.',
    subtitle: "",
    fields: [],
    actions: [{ id: 'start_new_application', label: 'Start a new application', description: 'Clear everything and start over.' }],
  },
];

export const STEP_BY_ID = Object.fromEntries(STEPS.map((s) => [s.id, s])) as Record<StepId, StepDef>;
export const FORM_STEPS = STEPS.filter((s) => s.fields.length > 0 && s.id !== 'review');

export function stepForPath(path: string): StepDef {
  return STEPS.find((s) => s.path === path) ?? STEPS[0];
}

export function isRequired(f: FieldDef, d: AppData) {
  return typeof f.required === 'function' ? f.required(d) : f.required;
}
export function isVisible(f: FieldDef, d: AppData) {
  return f.showIf ? f.showIf(d) : true;
}
export function optionsFor(f: FieldDef, d: AppData): Option[] {
  return typeof f.options === 'function' ? f.options(d) : f.options ?? [];
}

export function isEmpty(v: FieldValue) {
  return v === undefined || v === '' || v === null || (typeof v === 'number' && isNaN(v));
}

/** Normalise a raw value (from a human or the agent) and validate it. */
export function coerceField(fieldId: string, raw: unknown, d: AppData): { value?: FieldValue; error?: string } {
  const f = FIELDS[fieldId];
  if (!f) return { error: `Unknown field "${fieldId}".` };
  if (f.type === 'file') return { error: 'Files can only be attached by the customer (or via the sample-documents demo action).' };
  let value: FieldValue = f.normalize ? f.normalize(raw, d) : (raw as FieldValue);
  if (value === undefined || value === '') return { value: undefined };
  const options = optionsFor(f, d);
  if (options.length && (f.type === 'select' || f.type === 'radio')) {
    const s = String(value).toLowerCase();
    const hit = options.find((o) => o.value.toLowerCase() === s || o.label.toLowerCase() === s) ??
      options.find((o) => o.label.toLowerCase().includes(s) || s.includes(o.label.toLowerCase()));
    if (!hit) return { error: `"${raw}" is not an option. Options: ${options.map((o) => o.label).join(', ')}.` };
    value = hit.value;
  }
  const err = f.validate?.(value, { ...d, [fieldId]: value });
  return err ? { value, error: err } : { value };
}

export function fieldError(fieldId: string, d: AppData): string | null {
  const f = FIELDS[fieldId];
  if (!isVisible(f, d)) return null;
  const v = d[fieldId];
  if (isEmpty(v)) return isRequired(f, d) ? 'Required' : null;
  return f.validate?.(v, d) ?? null;
}

export function missingFields(stepId: StepId, d: AppData): string[] {
  return STEP_BY_ID[stepId].fields.filter((id) => fieldError(id, d) !== null);
}

export function isStepComplete(stepId: StepId, d: AppData): boolean {
  return missingFields(stepId, d).length === 0;
}

export function displayValue(fieldId: string, d: AppData): string {
  const f = FIELDS[fieldId];
  const v = d[fieldId];
  if (isEmpty(v)) return 'Not provided';
  if (f.type === 'file') return (v as FileMeta).name;
  if (f.type === 'checkbox') return v ? 'Yes' : 'No';
  if (f.type === 'currency') return '₹' + Number(v).toLocaleString('en-IN');
  const o = optionsFor(f, d).find((o) => o.value === v);
  if (o) return o.label;
  return `${v}${f.suffix ? ' ' + f.suffix : ''}`;
}

export function maskSensitive(fieldId: string, s: string): string {
  return FIELDS[fieldId]?.sensitive && s.length > 4 ? '•'.repeat(s.length - 4) + s.slice(-4) : s;
}
