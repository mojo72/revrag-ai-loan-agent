// RevRag Action Intelligence for the web: mission execution.
//
// Inbound `mission` / `cancel` / `highlight` / `request_ui_tree` messages come from RevRag's agent over
// the LiveKit data channel. Each mission step names an action and a target; we resolve the target in a
// fresh snapshot, act on the live app, verify the effect, and report `mission_status`,
// `mission_phase`, `verification_result`, `info_query_response` and `find_candidates_response`
// exactly as RevRag's mobile SDKs do (see @revrag-ai/embed-react-native core/protocol).
//
// Form fields are written through the app store with the same normalisation and validation a human
// gets, so RevRag's agent cannot bypass the journey's rules.

import { FIELDS, coerceField, displayValue } from '../../shared/schema';
import { useApp } from '../state/store';
import { SnapshotBuilder, snapshotDigest, type LiveNode } from './snapshot';

type Wire = Record<string, unknown>;
type Emit = (w: Wire) => void;

interface FindTarget {
  stableId?: string;
  identifier?: string;
  text?: string;
  role?: string;
  tokens?: string[];
  insideText?: string;
  forbidText?: string;
  nthMatch?: number;
}

interface Step {
  action: string;
  target: FindTarget;
  params: Record<string, unknown>;
}

interface Mission {
  missionId: string;
  goal?: string;
  steps: Step[];
}

interface StepOutcome {
  success: boolean;
  evidence: string[];
  failureReason?: string;
  strategy?: string;
}

export interface MissionHooks {
  emit: Emit;
  /** A mission step changed the app; refresh the snapshot RevRag plans from. */
  afterStep: () => void;
  /** Human-readable line for the action timeline. */
  onAction: (summary: string, ok: boolean) => void;
  onActiveChange: (active: boolean) => void;
}

const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);
const now = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseTarget(j: Wire): FindTarget {
  return {
    stableId: str(j.target_stable_id),
    identifier: str(j.target_identifier),
    text: str(j.target_text),
    role: str(j.target_role),
    tokens: Array.isArray(j.target_tokens) ? (j.target_tokens as unknown[]).filter((t): t is string => typeof t === 'string') : undefined,
    insideText: str(j.inside_text),
    forbidText: str(j.forbid_text),
    nthMatch: typeof j.nth_match === 'number' ? j.nth_match : undefined,
  };
}

function parseStep(j: Wire): Step {
  return { action: String(j.action ?? '').toLowerCase(), target: parseTarget(j), params: (j.params && typeof j.params === 'object' ? j.params : {}) as Record<string, unknown> };
}

const isEmptyTarget = (t: FindTarget) => !t.stableId && !t.identifier && !t.text && !t.role && !t.tokens?.length;

// ---------- target resolution ----------

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const haystack = (n: LiveNode) => norm([n.wire.text, n.wire.value, n.wire.placeholder, n.wire.subtree_text, n.wire.identifier].filter(Boolean).join(' '));

function rank(nodes: LiveNode[], t: FindTarget): LiveNode[] {
  let pool = nodes;
  if (t.role) {
    const roleMatches = pool.filter((n) => n.wire.role === t.role || (t.role === 'text_field' && n.wire.role === 'dropdown'));
    if (roleMatches.length) pool = roleMatches;
  }
  if (t.forbidText) pool = pool.filter((n) => !haystack(n).includes(norm(t.forbidText)));
  if (t.insideText) {
    const inside = pool.filter((n) => norm(n.el.closest('section, [id^="field-"], [id^="review_"], div')?.textContent ?? '').includes(norm(t.insideText)));
    if (inside.length) pool = inside;
  }

  const scored = pool
    .map((n) => {
      let s = 0;
      if (t.stableId && (n.wire.id === t.stableId || n.wire.id.replace(/_\d+$/, '') === t.stableId)) s += 100;
      if (t.identifier && (n.wire.identifier === t.identifier || n.fieldId === t.identifier)) s += 80;
      if (t.text) {
        const want = norm(t.text);
        const txt = norm(n.wire.text);
        if (txt === want) s += 60;
        else if (txt.includes(want)) s += 40;
        else if (haystack(n).includes(want)) s += 25;
        else if (want.includes(txt) && txt.length > 2) s += 15;
      }
      if (t.tokens?.length) {
        const hs = haystack(n);
        s += t.tokens.filter((tok) => hs.includes(norm(tok))).length * 5;
      }
      if (s > 0 && n.wire.visible) s += 3;
      if (s > 0 && n.wire.has_action) s += 2;
      return { n, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored.map((x) => x.n);
}

// ---------- visual feedback ----------

let hlEl: HTMLDivElement | null = null;
let hlTimer: number | undefined;

export function clearHighlight() {
  hlEl?.remove();
  hlEl = null;
  clearTimeout(hlTimer);
}

export function drawHighlight(el: HTMLElement, ms = 2200) {
  clearHighlight();
  const r = el.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = 'ai-highlight';
  Object.assign(box.style, { left: `${r.left + scrollX - 6}px`, top: `${r.top + scrollY - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
  document.body.appendChild(box);
  hlEl = box;
  hlTimer = window.setTimeout(clearHighlight, ms);
}

function setNativeValue(el: HTMLInputElement, value: string) {
  const proto = Object.getPrototypeOf(el) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// ---------- runner ----------

export class MissionRunner {
  private builder = new SnapshotBuilder();
  private cancelled = new Set<string>();
  private active: string | null = null;
  private tail: Promise<void> = Promise.resolve();
  private hlSeq = 0;
  private hooks: MissionHooks;

  constructor(hooks: MissionHooks) {
    this.hooks = hooks;
  }

  /** Route one inbound JSON message. Returns true when it was an Action Intelligence message. */
  handle(json: Wire): boolean {
    switch (json.type) {
      case 'mission': {
        const missionId = str(json.mission_id);
        if (!missionId) return true;
        const steps = (Array.isArray(json.steps) ? json.steps : []).filter((s): s is Wire => !!s && typeof s === 'object').map(parseStep);
        // A newer mission supersedes the one in flight (the agent re-planned).
        if (this.active) this.cancelled.add(this.active);
        this.enqueue({ missionId, goal: str(json.goal), steps });
        return true;
      }
      case 'cancel': {
        const id = str(json.mission_id);
        if (id) this.cancelled.add(id);
        return true;
      }
      case 'highlight': {
        if (json.clear === true) {
          clearHighlight();
          return true;
        }
        const step = parseStep({ ...json, action: 'highlight', params: { duration_ms: json.duration_ms } });
        this.enqueue({ missionId: `hl_${++this.hlSeq}`, steps: [step] });
        return true;
      }
      default:
        return false;
    }
  }

  cancelAll() {
    if (this.active) this.cancelled.add(this.active);
    clearHighlight();
  }

  private enqueue(m: Mission) {
    this.tail = this.tail.then(() => this.execute(m)).catch(() => undefined);
  }

  private status(missionId: string, status: string, extra: { stepIndex?: number; failureReason?: string; goal?: string } = {}) {
    const out: Wire = { type: 'mission_status', mission_id: missionId, status };
    if (extra.stepIndex != null) out.step_index = extra.stepIndex;
    if (extra.failureReason) out.failure_reason = extra.failureReason;
    if (extra.goal) out.goal = extra.goal;
    this.hooks.emit(out);
  }

  private phase(missionId: string, stepIndex: number, phase: string) {
    this.hooks.emit({ type: 'mission_phase', mission_id: missionId, step_index: stepIndex, phase });
  }

  private async execute(m: Mission) {
    this.active = m.missionId;
    this.hooks.onActiveChange(true);
    this.status(m.missionId, 'started', { goal: m.goal });
    try {
      for (let i = 0; i < m.steps.length; i++) {
        if (this.cancelled.has(m.missionId)) return this.status(m.missionId, 'cancelled', { stepIndex: i });
        this.status(m.missionId, 'step_started', { stepIndex: i });
        const outcome = await this.runStep(m, i, m.steps[i]);
        this.hooks.afterStep();
        if (!outcome.success) return this.status(m.missionId, 'failed', { stepIndex: i, failureReason: outcome.failureReason ?? 'step_failed' });
        this.status(m.missionId, 'step_completed', { stepIndex: i });
      }
      this.status(m.missionId, 'succeeded');
    } catch (e) {
      console.error('[RevRag mission]', e);
      this.status(m.missionId, 'failed', { failureReason: 'exception' });
    } finally {
      this.cancelled.delete(m.missionId);
      this.active = null;
      this.hooks.onActiveChange(false);
    }
  }

  private verification(m: Mission, i: number, o: StepOutcome) {
    const out: Wire = { type: 'verification_result', mission_id: m.missionId, step_index: i, success: o.success, evidence: o.evidence, timestamp: now() };
    if (o.failureReason) out.failure_reason = o.failureReason;
    if (o.strategy) out.strategy = o.strategy;
    this.hooks.emit(out);
  }

  /** Find the target, waiting briefly for the DOM to settle after navigation. */
  private async resolve(t: FindTarget): Promise<{ node?: LiveNode; all: LiveNode[] }> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { live } = this.builder.capture();
      const ranked = rank(live, t);
      const node = ranked[t.nthMatch ?? 0];
      if (node) return { node, all: ranked };
      await sleep(300);
    }
    return { all: [] };
  }

  private async runStep(m: Mission, i: number, step: Step): Promise<StepOutcome> {
    const { action, params } = step;
    this.phase(m.missionId, i, 'searching');

    // Actions that do not need a target.
    if (action === 'back') {
      this.phase(m.missionId, i, 'executing');
      history.back();
      await sleep(450);
      return this.finish(m, i, { success: true, evidence: [`route:${location.pathname}`] }, 'Went back');
    }
    if (action === 'wait') {
      this.phase(m.missionId, i, 'executing');
      const until = params.until_appears ?? params.until_disappears;
      const ms = typeof params.duration_ms === 'number' ? params.duration_ms : 800;
      if (until && typeof until === 'object') {
        const t = parseTarget(until as Wire);
        const appear = !!params.until_appears;
        const deadline = Date.now() + Math.max(ms, 4000);
        while (Date.now() < deadline) {
          const found = rank(this.builder.capture().live, t).length > 0;
          if (found === appear) return this.finish(m, i, { success: true, evidence: [appear ? 'appeared' : 'disappeared'] });
          await sleep(250);
        }
        return this.finish(m, i, { success: false, evidence: [], failureReason: 'wait_timeout' });
      }
      await sleep(Math.min(ms, 10_000));
      return this.finish(m, i, { success: true, evidence: [`waited_ms:${ms}`] });
    }
    if ((action === 'scroll' || action === 'scroll_down' || action === 'scroll_up') && isEmptyTarget(step.target)) {
      this.phase(m.missionId, i, 'executing');
      const up = action === 'scroll_up' || params.direction === 'up';
      window.scrollBy({ top: (up ? -0.7 : 0.7) * innerHeight, behavior: 'smooth' });
      await sleep(400);
      return this.finish(m, i, { success: true, evidence: [`scroll_y:${Math.round(scrollY)}`] }, up ? 'Scrolled up' : 'Scrolled down');
    }
    if (isEmptyTarget(step.target)) return this.finish(m, i, { success: false, evidence: [], failureReason: 'empty_target' });

    const { node, all } = await this.resolve(step.target);

    if (action === 'find_candidates') {
      this.hooks.emit({
        type: 'find_candidates_response',
        mission_id: m.missionId,
        step_index: i,
        candidates: all.slice(0, 10).map((n) => ({ id: n.wire.id, text: n.wire.text, role: n.wire.role, bounds: n.wire.bounds, visible: n.wire.visible })),
        ambiguous: all.length > 1,
        timestamp: now(),
      });
      return { success: true, evidence: [`candidates:${all.length}`] };
    }
    // read_field may ask for a value entered on another screen: answer from the saved application.
    const fieldRef = [step.target.identifier, step.target.stableId?.replace(/^field\./, '')].find((k) => k && FIELDS[k]);
    if (!node && action === 'read_field' && fieldRef) {
      this.phase(m.missionId, i, 'executing');
      this.hooks.emit({ type: 'info_query_response', mission_id: m.missionId, step_index: i, value: displayValue(fieldRef, useApp.getState().data), stable_id: `field.${fieldRef}`, timestamp: now() });
      return { success: true, evidence: ['read_from_application'] };
    }
    if (!node) {
      this.hooks.onAction(`Couldn't find “${step.target.text ?? step.target.stableId ?? step.target.identifier}”`, false);
      return this.finish(m, i, { success: false, evidence: [], failureReason: 'target_not_found' });
    }

    const label = node.fieldId ? FIELDS[node.fieldId].label : node.wire.text;
    const before = snapshotDigest(this.builder.capture().wire);
    const routeBefore = location.pathname;
    const store = useApp.getState();
    this.phase(m.missionId, i, 'executing');

    if (action === 'read_field') {
      const value = node.fieldId ? displayValue(node.fieldId, store.data) : node.wire.value ?? node.wire.text;
      this.hooks.emit({ type: 'info_query_response', mission_id: m.missionId, step_index: i, value: String(value ?? ''), stable_id: node.wire.id, timestamp: now() });
      return { success: true, evidence: ['read'] };
    }

    if (action === 'highlight' || action === 'scroll_to' || action === 'scroll_and_highlight' || action === 'show_on_screen') {
      node.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(350);
      if (action !== 'scroll_to') drawHighlight(node.el, typeof params.duration_ms === 'number' ? params.duration_ms : 2200);
      return this.finish(m, i, { success: true, evidence: [`visible:${node.wire.id}`] }, action === 'scroll_to' ? `Scrolled to ${label}` : `Pointed to ${label}`);
    }

    // Writes to schema fields go through the store (same normalisation + validation as a human).
    const writeField = (fieldId: string, raw: unknown): StepOutcome => {
      const { value, error } = raw === '' ? { value: undefined, error: undefined } : coerceField(fieldId, raw, useApp.getState().data);
      if (error && value === undefined) return { success: false, evidence: [error], failureReason: 'invalid_value' };
      // Never clear a field because a value could not be understood.
      if (value === undefined && raw !== '' && raw != null)
        return { success: false, evidence: [`could not understand "${String(raw)}" for ${FIELDS[fieldId].label}; send digits or one of the options`], failureReason: 'invalid_value' };
      node.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      useApp.getState().setField(fieldId, value, 'agent');
      useApp.getState().setHighlight(fieldId);
      const shown = displayValue(fieldId, useApp.getState().data);
      return error ? { success: false, evidence: [`value:${shown}`, error], failureReason: 'validation_error' } : { success: true, evidence: [`value:${shown}`], strategy: 'semantic' };
    };

    let o: StepOutcome;
    let summary = '';
    switch (action) {
      case 'set_text':
      case 'type': {
        const text = String(params.text ?? params.value ?? '');
        if (node.fieldId) {
          o = writeField(node.fieldId, text);
          summary = `Filled ${label}: ${displayValue(node.fieldId, useApp.getState().data)}`;
        } else if (node.el instanceof HTMLInputElement) {
          setNativeValue(node.el, text);
          o = { success: node.el.value === text, evidence: [`value:${node.el.value}`] };
          summary = `Typed into ${label}`;
        } else o = { success: false, evidence: [], failureReason: 'not_editable' };
        break;
      }
      case 'select': {
        const choice = params.value ?? params.text ?? step.target.text;
        if (!node.fieldId) {
          o = { success: false, evidence: [], failureReason: 'not_selectable' };
          break;
        }
        o = writeField(node.fieldId, node.optionValue && !params.value && !params.text ? node.optionValue : choice);
        summary = `Selected ${label}: ${displayValue(node.fieldId, useApp.getState().data)}`;
        break;
      }
      case 'check': {
        if (!node.fieldId) {
          o = { success: false, evidence: [], failureReason: 'not_checkable' };
          break;
        }
        const v = params.value;
        const desired = v === undefined || v === 'toggle' ? store.data[node.fieldId] !== true : v === true || v === 'true' || v === 'checked' || v === 1;
        o = writeField(node.fieldId, desired);
        summary = `${desired ? 'Ticked' : 'Unticked'} ${label}`;
        break;
      }
      case 'set_slider':
      case 'set_value': {
        if (node.el instanceof HTMLInputElement && node.el.type === 'range') {
          setNativeValue(node.el, String(params.value));
          o = { success: true, evidence: [`value:${node.el.value}`] };
          summary = `Set ${label} to ${node.el.value}`;
        } else o = { success: false, evidence: [], failureReason: 'not_adjustable' };
        break;
      }
      case 'tap':
      case 'click':
      case 'navigate':
      case 'press': {
        if (node.fieldId && node.optionValue) {
          o = writeField(node.fieldId, node.optionValue);
          summary = `Selected ${FIELDS[node.fieldId].label}: ${displayValue(node.fieldId, useApp.getState().data)}`;
          break;
        }
        if (node.fieldId && FIELDS[node.fieldId].type === 'checkbox') {
          o = writeField(node.fieldId, store.data[node.fieldId] !== true);
          summary = `${useApp.getState().data[node.fieldId] ? 'Ticked' : 'Unticked'} ${label}`;
          break;
        }
        if (node.fieldId && FIELDS[node.fieldId].type === 'file') {
          // Browsers only open a file picker from a real user click, so hand this one to the customer.
          node.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          drawHighlight(node.el, 4000);
          this.hooks.onAction(`Asked you to tap “${label}”`, false);
          return this.finish(m, i, { success: false, evidence: ['file_picker_requires_user_gesture'], failureReason: 'requires_user_action' });
        }
        node.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (node.el instanceof HTMLSelectElement || (node.el instanceof HTMLInputElement && node.el.type !== 'checkbox')) node.el.focus();
        else node.el.click();
        await sleep(450);
        const routed = location.pathname !== routeBefore;
        const after = this.builder.capture();
        // A blocked Continue/Submit shows validation errors: report them so the agent can fix the inputs.
        const errors = routed ? [] : after.live.flatMap((n) => (/\(error: /.test(n.wire.text) ? [n.wire.text] : []));
        if (errors.length) o = { success: false, evidence: errors.slice(0, 8), failureReason: 'blocked_by_validation' };
        else if (routed || snapshotDigest(after.wire) !== before) o = { success: true, evidence: [routed ? `route:${location.pathname}` : 'screen_changed'] };
        else o = { success: false, evidence: ['no_observable_effect'], failureReason: 'no_observable_effect' };
        summary = `Pressed “${label}”`;
        break;
      }
      default:
        o = { success: false, evidence: [`unsupported_action:${action}`], failureReason: 'unsupported_action' };
    }
    await sleep(120);
    return this.finish(m, i, o, summary || undefined);
  }

  private finish(m: Mission, i: number, o: StepOutcome, summary?: string): StepOutcome {
    this.phase(m.missionId, i, 'verifying');
    this.verification(m, i, o);
    if (summary) this.hooks.onAction(o.success ? summary : `${summary} (${o.evidence.find((e) => !e.startsWith('value:')) ?? o.failureReason})`, o.success);
    return o;
  }
}
