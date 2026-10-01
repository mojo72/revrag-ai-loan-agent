// RevRag Action Intelligence for the web: UI snapshot capture.
//
// RevRag's web SDK has no Action Intelligence, but its mobile SDKs speak a documented-in-code wire
// protocol over the LiveKit data channel (`ui_snapshot` out, `mission` in). This file produces the
// same `ui_snapshot` shape from our DOM so RevRag's planner can see and operate the web app.
// Shape mirrors `@revrag-ai/embed-react-native` core/tree/snapshot.ts `toWire()`.

import { FIELDS, optionsFor, stepForPath } from '../../shared/schema';
import { useApp } from '../state/store';

export interface WireNode {
  id: string;
  role: string;
  text: string;
  normalized_text?: string;
  tokens?: string[];
  bounds?: [number, number, number, number];
  visible: boolean;
  visible_fraction: number;
  has_action?: boolean;
  actions?: string[];
  value?: string;
  placeholder?: string;
  scrollable?: boolean;
  selected?: boolean;
  checked?: boolean;
  identifier?: string;
  subtree_text?: string;
}

export interface UiSnapshotWire {
  type: 'ui_snapshot';
  screen: string;
  captured_at: string;
  viewport: [number, number];
  nodes: WireNode[];
  paths: Record<string, string>;
  visible: number[];
}

/** A captured node plus the live element it came from (never serialised). */
export interface LiveNode {
  wire: WireNode;
  el: HTMLElement;
  /** Form field this node controls, when it is a schema field (lets missions write through the store). */
  fieldId?: string;
  /** For radio options: the option value. */
  optionValue?: string;
}

const MAX_TEXT = 100;
const MAX_NODES = 220;

const clip = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'item';

function visibility(el: HTMLElement): { bounds: [number, number, number, number]; fraction: number } {
  const r = el.getBoundingClientRect();
  const bounds: [number, number, number, number] = [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
  const area = r.width * r.height;
  if (area <= 0) return { bounds, fraction: 0 };
  const ix = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
  const iy = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
  return { bounds, fraction: Math.round(((ix * iy) / area) * 100) / 100 };
}

function isRendered(el: HTMLElement) {
  if (el.closest('[data-ai-ignore]')) return false;
  const s = getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
}

export class SnapshotBuilder {
  private nodes: LiveNode[] = [];
  private used = new Map<string, number>();
  private paths: Record<string, string> = {};
  private screenTitle = '';

  private uniqueId(base: string) {
    const n = this.used.get(base) ?? 0;
    this.used.set(base, n + 1);
    return n === 0 ? base : `${base}_${n + 1}`;
  }

  private add(el: HTMLElement, wire: Omit<WireNode, 'visible' | 'visible_fraction' | 'bounds'>, extra: Partial<LiveNode> = {}, section?: string) {
    if (this.nodes.length >= MAX_NODES) return;
    const { bounds, fraction } = visibility(el);
    const id = this.uniqueId(wire.id);
    const text = clip(wire.text);
    const node: WireNode = { ...wire, id, text, bounds, visible: fraction >= 0.05, visible_fraction: fraction };
    const norm = text.toLowerCase();
    node.tokens = norm.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1).slice(0, 12);
    if (!node.tokens.length) delete node.tokens;
    this.nodes.push({ wire: node, el, ...extra });
    this.paths[id] = ['Bliss Finance', this.screenTitle, section, text].filter(Boolean).join(' > ');
  }

  capture(): { wire: UiSnapshotWire; live: LiveNode[] } {
    this.nodes = [];
    this.used.clear();
    this.paths = {};
    const step = stepForPath(location.pathname);
    this.screenTitle = step.title;
    const data = useApp.getState().data;
    const root = document.getElementById('root')!;
    const claimed = new Set<Element>();

    // 1. Form fields: one semantic node per control, labelled from the schema.
    root.querySelectorAll<HTMLElement>('[id^="field-"]').forEach((wrap) => {
      if (!isRendered(wrap)) return;
      const fieldId = wrap.id.slice(6);
      const f = FIELDS[fieldId];
      if (!f) return;
      // Validation message under the control (not the red "*" in the label).
      const err = wrap.querySelector('p.text-bad')?.textContent?.trim();
      const errSuffix = err ? ` (error: ${err})` : '';
      wrap.querySelectorAll('*').forEach((c) => claimed.add(c));
      const opts = optionsFor(f, data);
      const current = data[fieldId];

      if (f.type === 'radio') {
        wrap.querySelectorAll<HTMLElement>('[role="radio"]').forEach((btn, i) => {
          const o = opts[i];
          if (!o) return;
          this.add(btn, {
            id: `field.${fieldId}.${slug(o.value)}`,
            role: 'radio',
            text: `${f.label}: ${o.label}${i === 0 ? errSuffix : ''}`,
            identifier: `${fieldId}.${o.value}`,
            has_action: true,
            actions: ['tap'],
            checked: current === o.value,
            selected: current === o.value,
          }, { fieldId, optionValue: o.value }, f.label);
        });
        return;
      }
      const control = wrap.querySelector<HTMLElement>('select, input, label:has(input[type="file"])');
      if (!control) return;
      const base = { id: `field.${fieldId}`, identifier: fieldId, has_action: true } as const;
      if (f.type === 'select') {
        const sel = control as HTMLSelectElement;
        this.add(sel, {
          ...base,
          role: 'dropdown',
          text: f.label + errSuffix,
          actions: ['tap', 'select'],
          value: sel.selectedIndex > 0 ? sel.options[sel.selectedIndex].text : undefined,
          subtree_text: clip(`Options: ${opts.map((o) => o.label).join(', ')}`),
        }, { fieldId }, f.label);
      } else if (f.type === 'checkbox') {
        this.add(control, { ...base, role: 'checkbox', text: f.label + errSuffix, actions: ['tap', 'check'], checked: current === true }, { fieldId }, f.label);
      } else if (f.type === 'file') {
        const name = typeof current === 'object' && current ? (current as { name: string }).name : undefined;
        this.add(control, { ...base, role: 'button', text: `Upload ${f.label}${errSuffix}`, actions: ['tap'], value: name }, { fieldId }, f.label);
      } else {
        const input = control as HTMLInputElement;
        this.add(input, {
          ...base,
          role: 'text_field',
          text: f.label + errSuffix,
          actions: ['tap', 'setText'],
          value: input.value || undefined,
          placeholder: input.placeholder || f.hint || undefined,
        }, { fieldId }, f.label);
      }
    });

    // 2. Buttons, links, sliders and other controls outside form fields.
    root.querySelectorAll<HTMLElement>('button, a[href], input[type="range"], [role="button"]').forEach((el) => {
      if (claimed.has(el) || !isRendered(el)) return;
      const label = clip(el.getAttribute('aria-label') || el.textContent || '');
      if (el instanceof HTMLInputElement && el.type === 'range') {
        const lab = clip(el.closest('label')?.textContent?.split(/₹|\d/)[0] ?? 'Slider');
        this.add(el, { id: `slider.${slug(lab)}`, role: 'slider', text: lab, has_action: true, actions: ['setValue'], value: el.value });
        return;
      }
      if (!label) return;
      const isLink = el.tagName === 'A';
      const isTab = !!el.closest('nav[aria-label="Application progress"]');
      const ownId = el.id ? el.id.replace(/^btn-/, '') : slug(label);
      this.add(el, {
        id: `${isTab ? 'tab' : isLink ? 'link' : 'button'}.${ownId}`,
        role: isTab ? 'tab' : isLink ? 'link' : 'button',
        text: label,
        has_action: true,
        actions: ['tap'],
        selected: el.className.includes('bg-brand-600') && !!el.closest('nav') ? true : undefined,
      });
      el.querySelectorAll('*').forEach((c) => claimed.add(c));
    });

    // 3. Readable text inside <main> (headings, results, summaries) so the agent can see what is on screen.
    root.querySelectorAll<HTMLElement>('main h1, main h2, main h3, main p, main dt, main dd, main li').forEach((el) => {
      if (claimed.has(el) || !isRendered(el)) return;
      const t = clip(el.textContent || '');
      if (!t || t.length < 2) return;
      const role = /^H[1-3]$/.test(el.tagName) ? 'heading' : 'text';
      this.add(el, { id: `text.${slug(t)}`, role, text: t });
    });

    // The page itself is the scroll container.
    this.add(document.documentElement, { id: 'screen.scroll', role: 'scroll_view', text: step.title, scrollable: true, has_action: true, actions: ['scrollUp', 'scrollDown', 'showOnScreen'] });

    const visible: number[] = [];
    this.nodes.forEach((n, i) => n.wire.visible && visible.push(i));
    return {
      wire: {
        type: 'ui_snapshot',
        screen: step.id,
        captured_at: new Date().toISOString(),
        viewport: [innerWidth, innerHeight],
        nodes: this.nodes.map((n) => n.wire),
        paths: this.paths,
        visible,
      },
      live: this.nodes,
    };
  }
}

/** Stable digest so unchanged screens are not re-sent (bounds excluded: scrolling alone is not news). */
export function snapshotDigest(w: UiSnapshotWire) {
  return JSON.stringify([w.screen, w.nodes.map((n) => [n.id, n.value, n.checked, n.text, n.visible])]);
}
