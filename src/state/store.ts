import { create } from 'zustand';
import { ageFromDob, checkEligibility, type CreditBand, type EligibilityResult } from '../../shared/finance';
import type { ProductId } from '../../shared/products';
import { FIELDS, type AppData, type FieldValue, type StepId } from '../../shared/schema';

export type ChangeSource = 'user' | 'agent';

interface AppState {
  data: AppData;
  eligibility: (EligibilityResult & { checkedAt: number; inputsKey: string }) | null;
  applicationId: string | null;
  submittedAt: number | null;
  /** Steps where the user pressed Continue, so we show validation errors there. */
  attempted: Partial<Record<StepId, boolean>>;
  /** field id -> timestamp of last agent fill, drives the glow animation. */
  agentTouched: Record<string, number>;
  highlight: { target: string; at: number } | null;
  /** Things the customer did by hand since the agent last looked, so the agent stays in sync. */
  manualChanges: string[];

  setField: (id: string, value: FieldValue, source: ChangeSource) => void;
  markAttempted: (step: StepId) => void;
  runEligibility: () => EligibilityResult;
  submit: () => string;
  setHighlight: (target: string) => void;
  noteManual: (what: string) => void;
  takeManualChanges: () => string[];
  reset: () => void;
}

export function eligibilityInputsKey(d: AppData) {
  return ['product', 'amount', 'tenure_months', 'dob', 'employment_type', 'monthly_income', 'existing_emi', 'credit_band']
    .map((k) => String(d[k] ?? ''))
    .join('|');
}

const initialData: AppData = { product: 'personal', existing_emi: undefined, permanent_same: true, emi_autodebit: true };

// In memory only: every fresh launch or refresh starts a new, empty application.
// Remove copies saved by earlier versions of the app, which persisted to session storage.
try {
  sessionStorage.removeItem('bliss-application');
} catch {
  /* storage unavailable */
}

export const useApp = create<AppState>()((set, get) => ({
      data: initialData,
      eligibility: null,
      applicationId: null,
      submittedAt: null,
      attempted: {},
      agentTouched: {},
      highlight: null,
      manualChanges: [],

      setField: (id, value, source) => {
        const prev = get().data[id];
        if (prev === value) return;
        set((s) => {
          const data = { ...s.data, [id]: value };
          // Changing the product can invalidate purpose; clear it so the select is consistent.
          if (id === 'product' && prev !== value) data.purpose = undefined;
          return {
            data,
            agentTouched: source === 'agent' ? { ...s.agentTouched, [id]: Date.now() } : s.agentTouched,
          };
        });
        if (source === 'user') get().noteManual(`changed ${FIELDS[id]?.label ?? id}`);
      },

      markAttempted: (step) => set((s) => ({ attempted: { ...s.attempted, [step]: true } })),

      runEligibility: () => {
        const d = get().data;
        const result = checkEligibility({
          product: (d.product as ProductId) ?? 'personal',
          requestedAmount: d.amount as number | undefined,
          tenureMonths: d.tenure_months as number | undefined,
          age: typeof d.dob === 'string' ? ageFromDob(d.dob) : undefined,
          employmentType: d.employment_type as 'salaried' | 'self_employed' | undefined,
          monthlyIncome: d.monthly_income as number | undefined,
          existingEmi: d.existing_emi as number | undefined,
          creditBand: d.credit_band as CreditBand | undefined,
        });
        set({ eligibility: { ...result, checkedAt: Date.now(), inputsKey: eligibilityInputsKey(d) } });
        return result;
      },

      submit: () => {
        const id = 'BF' + Date.now().toString(36).toUpperCase().slice(-6) + Math.floor(Math.random() * 90 + 10);
        set({ applicationId: id, submittedAt: Date.now() });
        return id;
      },

      setHighlight: (target) => set({ highlight: { target, at: Date.now() } }),
      noteManual: (what) => set((s) => ({ manualChanges: [...s.manualChanges.filter((c) => c !== what), what].slice(-12) })),
      takeManualChanges: () => {
        const c = get().manualChanges;
        if (c.length) set({ manualChanges: [] });
        return c;
      },
      reset: () =>
        set({ data: initialData, eligibility: null, applicationId: null, submittedAt: null, attempted: {}, agentTouched: {}, manualChanges: [] }),
}));

/** Eligibility result only counts if it was computed from the current inputs. */
export function currentEligibility(s: Pick<AppState, 'eligibility' | 'data'>) {
  return s.eligibility && s.eligibility.inputsKey === eligibilityInputsKey(s.data) ? s.eligibility : null;
}
