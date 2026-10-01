// Tiny typed event bus: app events the agent (and the RevRag context sync) react to.

import type { EligibilityResult } from '../../shared/finance';
import type { StepId } from '../../shared/schema';

export type AppEvent =
  | { type: 'validation_failed'; step: StepId; problems: string[]; source: 'user' | 'agent' }
  | { type: 'eligibility_checked'; result: EligibilityResult; source: 'user' | 'agent' }
  | { type: 'submitted'; applicationId: string; source: 'user' | 'agent' }
  | { type: 'agent_action'; tool: string; summary: string };

type Listener = (e: AppEvent) => void;
const listeners = new Set<Listener>();

export const bus = {
  emit(e: AppEvent) {
    listeners.forEach((l) => l(e));
  },
  on(l: Listener) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};
