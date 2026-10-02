// RevRag In-App Agent, integrated as documented in https://docs.revrag.ai/embed/integration/react
// - useInitialize(apiKey) once at the root.
// - <EmbedProvider> wraps the app; it tracks the route (usePathHook) and renders RevRag's own
//   floating agent button. Tapping it starts the RevRag voice agent.
// - USER_DATA is sent first (with app_user_id), then context as CUSTOM_EVENT / ANALYTICS_DATA,
//   the event keys the docs allow for manual use.
// - embedEvent.addCallback listens for agent_start / agent_end.

import { EmbedProvider, EventKeys, embedEvent, useInitialize } from '@revrag-ai/embed-react';
import '@revrag-ai/embed-react/style.css';
import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { create } from 'zustand';
import { FIELDS, displayValue, isEmpty, maskSensitive, stepForPath } from '../../shared/schema';
import { bus } from '../state/bus';
import { completedSteps } from '../state/journey';
import { useApp } from '../state/store';

const API_KEY = import.meta.env.VITE_REVRAG_API_KEY as string | undefined;

export const useRevrag = create<{
  configured: boolean;
  initialized: boolean;
  identified: boolean;
  error: string | null;
  callActive: boolean;
  eventsSent: number;
  lastEvent: string | null;
}>(() => ({ configured: !!API_KEY, initialized: false, identified: false, error: null, callActive: false, eventsSent: 0, lastEvent: null }));

/** Anonymous customer id (the docs require an app_user_id in USER_DATA). A new one per page load, so
 *  every fresh launch or refresh is a new customer session and RevRag does not recall old form data. */
const SESSION_USER_ID = 'guest-' + crypto.randomUUID().slice(0, 8);
try {
  localStorage.removeItem('bliss-user-id'); // stable id stored by earlier versions
} catch {
  /* storage unavailable */
}
function appUserId(): string {
  return SESSION_USER_ID;
}

async function send(eventKey: string, data: Record<string, unknown>) {
  const s = useRevrag.getState();
  if (!s.initialized) return;
  // Docs: USER_DATA must be sent before any other event, or the event is rejected.
  if (!s.identified && eventKey !== EventKeys.USER_DATA) return;
  try {
    const r = await embedEvent.event({ eventKey: eventKey as never, data: { app_user_id: appUserId(), ...data } });
    useRevrag.setState((st) => ({ eventsSent: st.eventsSent + 1, lastEvent: `${data.event_name ?? eventKey}${r?.success === false ? ' (failed)' : ''}` }));
  } catch (e) {
    useRevrag.setState({ lastEvent: `${eventKey} error: ${String(e)}` });
  }
}

function formValues() {
  const d = useApp.getState().data;
  return Object.fromEntries(
    Object.keys(FIELDS)
      .filter((id) => !isEmpty(d[id]) && FIELDS[id].type !== 'file')
      .map((id) => [id, maskSensitive(id, displayValue(id, d))]),
  );
}

function screenEvent(pathname: string) {
  const step = stepForPath(pathname);
  return { event_name: 'screen_view', screen: step.id, screen_title: step.title, path: pathname };
}

function ContextSync() {
  const { pathname } = useLocation();
  const initialized = useRevrag((s) => s.initialized);
  const identified = useRevrag((s) => s.identified);

  // 1. Identify the customer as soon as the SDK is ready.
  useEffect(() => {
    if (!initialized || useRevrag.getState().identified) return;
    void send(EventKeys.USER_DATA, { name: (useApp.getState().data.full_name as string) ?? 'Guest', channel: 'web', app: 'bliss-loan-demo' }).then(() =>
      useRevrag.setState({ identified: true }),
    );
  }, [initialized]);

  // 2. Which screen the customer is on.
  useEffect(() => {
    if (identified) void send(EventKeys.CUSTOM_EVENT, screenEvent(pathname));
  }, [pathname, identified]);

  // 3. What has been filled in (debounced).
  const timer = useRef<number>(undefined);
  useEffect(
    () =>
      useApp.subscribe((s, prev) => {
        if (s.data === prev.data) return;
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          void send(EventKeys.CUSTOM_EVENT, {
            event_name: 'form_state',
            screen: stepForPath(window.location.pathname).id,
            completed_steps: completedSteps(),
            values: formValues(),
          });
        }, 1500);
      }),
    [],
  );

  // 4. Milestones.
  useEffect(
    () =>
      bus.on((e) => {
        if (e.type === 'eligibility_checked')
          void send(EventKeys.CUSTOM_EVENT, { event_name: 'eligibility_checked', eligible: e.result.eligible, max_amount: e.result.maxEligibleAmount, rate: e.result.indicativeRate });
        if (e.type === 'submitted') void send(EventKeys.CUSTOM_EVENT, { event_name: 'application_submitted', application_id: e.applicationId });
        if (e.type === 'validation_failed') void send(EventKeys.ANALYTICS_DATA, { event_name: 'validation_failed', screen: e.step, problems: e.problems });
      }),
    [],
  );

  // 5. Agent call lifecycle (auto-tracked by the SDK, emitted locally).
  useEffect(() => {
    const cb = (event: { type: string }) => {
      if (event.type === EventKeys.AGENT_CONNECTED) useRevrag.setState({ callActive: true });
      if (event.type === EventKeys.AGENT_DISCONNECTED) useRevrag.setState({ callActive: false });
    };
    embedEvent.addCallback(cb);
    return () => embedEvent.removeCallback(cb);
  }, []);

  return null;
}

/**
 * Workaround for a RevRag SDK 1.4.4 bug: when the dashboard saves the orb avatar with an empty
 * `avatarUrl` (""), the SDK only falls back to its built-in orb for a *missing* URL (`??`), so the
 * floating button renders empty (tooltip visible, no icon). Removing the empty string lets the SDK's
 * own default orb show. Runs on the SDK's stored initialize data; a no-op once the avatar is set.
 */
function fixEmptyAvatar() {
  try {
    const KEY = 'embed_react_initialize_data';
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    const avatar = data?.widget_config?.agentAvatar;
    if (!avatar) return;
    let changed = false;
    for (const k of ['avatarUrl', 'avatarImage'] as const) {
      if (avatar[k] === '') {
        delete avatar[k];
        changed = true;
      }
    }
    if (changed) sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable or unexpected shape: leave the SDK untouched */
  }
}

function usePath() {
  return useLocation().pathname;
}

function Initialised({ children }: { children: ReactNode }) {
  const { isInitialized, error } = useInitialize(API_KEY!);
  if (isInitialized) fixEmptyAvatar();
  useEffect(() => {
    useRevrag.setState({ initialized: !!isInitialized, error: error ? String(error) : null });
  }, [isInitialized, error]);

  return (
    <EmbedProvider appVersion="1.0.0" usePathHook={usePath} embedButtonProps={{ positioning: 'fixed' }} embedButtonPosition={{ bottom: 24, right: 24 }}>
      {children}
      <ContextSync />
    </EmbedProvider>
  );
}

export function RevragLayer({ children }: { children: ReactNode }) {
  if (!API_KEY) return <>{children}</>;
  return <Initialised>{children}</Initialised>;
}
