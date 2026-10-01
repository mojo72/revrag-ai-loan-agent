// RevRag In-App Agent integration (SDK side).
// - Initialises the official SDK (`useInitialize`) and identifies the customer (USER_DATA).
// - Streams application context to RevRag: SCREEN_VIEW on navigation, FORM_STATE on edits,
//   CUSTOM_EVENT / ANALYTICS_DATA for milestones and every action the RevRag agent performs.
// The voice call itself, and RevRag's Action Intelligence protocol on web, live in call.ts.

import { EventKeys, embedEvent, useInitialize } from '@revrag-ai/embed-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { create } from 'zustand';
import { FIELDS, displayValue, isEmpty, maskSensitive, stepForPath } from '../../shared/schema';
import { completedSteps } from '../state/journey';
import { bus } from '../state/bus';
import { useApp } from '../state/store';
import { REVRAG_API_KEY as API_KEY, appUserId } from './identity';

export const useRevrag = create<{ configured: boolean; initialized: boolean; error: string | null; eventsSent: number; lastEvent: string | null }>(() => ({
  configured: !!API_KEY,
  initialized: false,
  error: null,
  eventsSent: 0,
  lastEvent: null,
}));

let identified = false;
async function send(eventKey: string, data: Record<string, unknown>) {
  if (!useRevrag.getState().initialized) return;
  if (!identified && eventKey !== EventKeys.USER_DATA) return;
  try {
    const r = await embedEvent.event({ eventKey: eventKey as never, data: { app_user_id: appUserId(), ...data } });
    useRevrag.setState((s) => ({ eventsSent: s.eventsSent + 1, lastEvent: `${eventKey}${r?.success === false ? ' (failed)' : ''}` }));
  } catch (e) {
    useRevrag.setState({ lastEvent: `${eventKey} error: ${String(e)}` });
  }
}

function formSnapshot() {
  const d = useApp.getState().data;
  return Object.fromEntries(
    Object.keys(FIELDS)
      .filter((id) => !isEmpty(d[id]) && FIELDS[id].type !== 'file')
      .map((id) => [id, maskSensitive(id, displayValue(id, d))]),
  );
}

function ContextSync() {
  const { pathname } = useLocation();

  // Identify the user once the SDK is ready.
  const initialized = useRevrag((s) => s.initialized);
  useEffect(() => {
    if (!initialized || identified) return;
    void send(EventKeys.USER_DATA, { name: (useApp.getState().data.full_name as string) ?? 'Guest', channel: 'web', app: 'bliss-loan-demo' }).then(() => {
      identified = true;
    });
  }, [initialized]);

  // Screen views.
  useEffect(() => {
    const step = stepForPath(pathname);
    void send('screen_view', { screen: step.id, screen_title: step.title, path: pathname });
  }, [pathname, initialized]);

  // Form state, debounced.
  const timer = useRef<number>(undefined);
  useEffect(
    () =>
      useApp.subscribe((s, prev) => {
        if (s.data === prev.data) return;
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          void send('form_state', { screen: stepForPath(window.location.pathname).id, completed_steps: completedSteps(), values: formSnapshot() });
        }, 1500);
      }),
    [],
  );

  // Milestones and agent actions.
  useEffect(
    () =>
      bus.on((e) => {
        if (e.type === 'eligibility_checked')
          void send(EventKeys.CUSTOM_EVENT, { event_name: 'eligibility_checked', eligible: e.result.eligible, max_amount: e.result.maxEligibleAmount, rate: e.result.indicativeRate, by: e.source });
        if (e.type === 'submitted') void send(EventKeys.CUSTOM_EVENT, { event_name: 'application_submitted', application_id: e.applicationId, by: e.source });
        if (e.type === 'validation_failed') void send(EventKeys.ANALYTICS_DATA, { event_name: 'validation_failed', screen: e.step, problems: e.problems.length });
        if (e.type === 'agent_action') void send(EventKeys.ANALYTICS_DATA, { event_name: 'agent_action', tool: e.tool, summary: e.summary });
      }),
    [],
  );

  return null;
}

function Initialised({ children }: { children: ReactNode }) {
  const { isInitialized, error } = useInitialize(API_KEY!);
  useEffect(() => {
    useRevrag.setState({ initialized: !!isInitialized, error: error ? String(error) : null });
  }, [isInitialized, error]);

  // Never block the loan app on the SDK. The voice call is started from Sara's panel (call.ts),
  // so the SDK's own floating button is not mounted: one entry point, one conversation.
  return (
    <>
      {children}
      <ContextSync />
    </>
  );
}

export function RevragLayer({ children }: { children: ReactNode }) {
  if (!API_KEY) return <>{children}</>;
  return <Initialised>{children}</Initialised>;
}
