// Orchestrates the conversation: mic -> transcript -> Claude (with app context) -> tool calls executed
// against the live app -> spoken reply. Also reacts to app events (e.g. a failed Continue) proactively.

import type Anthropic from '@anthropic-ai/sdk';
import { create } from 'zustand';
import { AGENT_NAME } from '../../shared/agentSpec';
import { STEP_BY_ID } from '../../shared/schema';
import { formatINR } from '../../shared/products';
import { currentStep } from '../state/actions';
import { bus } from '../state/bus';
import { BrowserStt, DeepgramStt, browserSttSupported, type Stt } from '../voice/stt';
import { currentLanguage, useLanguage } from '../voice/language';
import { Speaker } from '../voice/tts';
import { buildContext } from './context';
import { executeTool } from './tools';

type Msg = Anthropic.Beta.BetaMessageParam;
type Block = Anthropic.Beta.BetaContentBlock;

export type Status = 'off' | 'connecting' | 'listening' | 'thinking' | 'speaking';

export interface TranscriptItem {
  id: number;
  role: 'user' | 'agent' | 'action' | 'event' | 'error';
  text: string;
  ok?: boolean;
}

interface Providers {
  llm: boolean;
  stt: boolean;
  tts: boolean;
}

interface AgentUi {
  status: Status;
  panelOpen: boolean;
  micOn: boolean;
  interim: string;
  items: TranscriptItem[];
  providers: Providers | null;
  sttProvider: 'deepgram' | 'browser' | null;
  copilot: boolean;
  busy: boolean;
}

export const useAgent = create<AgentUi>(() => ({
  status: 'off',
  panelOpen: false,
  micOn: false,
  interim: '',
  items: [],
  providers: null,
  sttProvider: null,
  copilot: false,
  busy: false,
}));

let seq = 0;
const push = (role: TranscriptItem['role'], text: string, ok?: boolean) =>
  useAgent.setState((s) => {
    const last = s.items[s.items.length - 1];
    // Never repeat the same notice back-to-back (e.g. a flapping mic).
    if (last && last.role === role && last.text === text && (role === 'error' || role === 'event')) return s;
    return { items: [...s.items, { id: ++seq, role, text, ok }].slice(-80) };
  });

// Unicode-aware so Hindi, Tamil, Bengali etc. survive (a Latin-only filter would erase them).
const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

class AgentController {
  private messages: Msg[] = [];
  private stt?: Stt;
  private speaker = new Speaker(true);
  private pending: string[] = [];
  private lastSpokeAt = 0;
  private lastSpokenText = '';
  private started = false;
  /** Tool results not yet sent: when a turn needs no follow-up call, they ride along with the next user message. */
  private deferred: Anthropic.Beta.BetaToolResultBlockParam[] = [];

  constructor() {
    this.speaker.onSpeakingChange = (speaking, text) => {
      if (text) this.lastSpokenText = text;
      if (!speaking) this.lastSpokeAt = Date.now();
      this.refreshStatus(speaking);
    };
    this.speaker.locale = currentLanguage().murfLocale;
    // Switching language (picker or Riya's set_language tool) retunes both ears and voice.
    useLanguage.subscribe((state, prev) => {
      if (state.code === prev.code) return;
      const lang = currentLanguage();
      this.speaker.locale = lang.murfLocale;
      push('event', `Language: ${lang.label} (${lang.native})`);
      if (this.stt) {
        this.stt.stop();
        this.stt = undefined;
        void this.loadProviders().then((p) => this.startMic(p));
      }
    });
    bus.on((e) => {
      if (!this.started || useAgent.getState().copilot) return;
      if (e.type === 'validation_failed' && e.source === 'user')
        this.handle(`<app_event>The customer clicked Continue on "${STEP_BY_ID[e.step].title}" but it was blocked: ${e.problems.join(' ')}</app_event>`, 'event');
      if (e.type === 'eligibility_checked' && e.source === 'user')
        this.handle(
          `<app_event>The customer pressed Check eligibility themselves. Result: ${e.result.eligible ? `eligible up to ${formatINR(e.result.maxEligibleAmount)} at ${e.result.indicativeRate}%` : `not eligible (${e.result.reasons.join(' ')})`}.</app_event>`,
          'event',
        );
      if (e.type === 'submitted' && e.source === 'user')
        this.handle(`<app_event>The customer submitted the application themselves. ID ${e.applicationId}.</app_event>`, 'event');
    });
  }

  private refreshStatus(speaking = this.speaker.speaking) {
    const s = useAgent.getState();
    const status: Status = !this.started ? 'off' : speaking ? 'speaking' : s.busy ? 'thinking' : 'listening';
    useAgent.setState({ status });
  }

  async loadProviders(): Promise<Providers> {
    const cached = useAgent.getState().providers;
    if (cached) return cached;
    let p: Providers = { llm: false, stt: false, tts: false };
    try {
      const r = await fetch('/api/config');
      if (r.ok) p = await r.json();
    } catch {
      /* offline */
    }
    useAgent.setState({ providers: p });
    return p;
  }

  /** Start a voice session. Must be called from a click (unlocks audio + mic permission). */
  async start(opts: { copilot?: boolean } = {}) {
    if (this.started) return;
    this.speaker.unlock();
    useAgent.setState({ panelOpen: true, status: 'connecting', copilot: !!opts.copilot });
    const p = await this.loadProviders();
    this.speaker.setMurf(p.tts);
    this.started = true;

    if (!p.llm) {
      push('error', 'The AI backend is not configured (ANTHROPIC_API_KEY missing).');
    }
    await this.startMic(p);
    this.refreshStatus();
    if (!opts.copilot) this.greet();
  }

  private async startMic(p: Providers) {
    const cb = {
      onInterim: (t: string) => useAgent.setState({ interim: t }),
      onUtterance: (t: string) => this.onUtterance(t),
      onError: (m: string) => push('error', m),
      onFatal: (m: string) => {
        this.stt?.stop();
        this.stt = undefined;
        useAgent.setState({ micOn: false, interim: '', sttProvider: null });
        push('error', m);
      },
    };
    const lang = currentLanguage();
    const candidates: Stt[] = [];
    if (p.stt && lang.deepgram) candidates.push(new DeepgramStt(cb, lang.deepgram));
    if (browserSttSupported()) candidates.push(new BrowserStt(cb, lang.browserLocale));
    for (const stt of candidates) {
      try {
        await stt.start();
        this.stt = stt;
        useAgent.setState({ micOn: true, sttProvider: stt.provider });
        return;
      } catch (e) {
        stt.stop();
        console.warn(`${stt.provider} STT failed`, e);
        if (e instanceof DOMException && e.name === 'NotAllowedError') {
          push('error', 'Microphone permission was denied. You can still type to me below.');
          return;
        }
      }
    }
    push('error', 'Voice input is unavailable in this browser. You can type to me below.');
  }

  stop() {
    this.stt?.stop();
    this.stt = undefined;
    this.speaker.stop();
    this.started = false;
    useAgent.setState({ micOn: false, interim: '', sttProvider: null, copilot: false });
    this.refreshStatus();
  }

  get active() {
    return this.started;
  }

  async toggleMic() {
    if (this.stt) {
      this.stt.stop();
      this.stt = undefined;
      useAgent.setState({ micOn: false, interim: '' });
    } else {
      await this.startMic(await this.loadProviders());
    }
  }

  interrupt() {
    this.speaker.stop();
  }

  setCopilot(on: boolean) {
    useAgent.setState({ copilot: on });
    if (on) {
      this.speaker.stop();
      if (!this.started) void this.start({ copilot: true });
      push('event', 'RevRag voice agent connected. Riya is now the silent action co-pilot.');
    } else if (this.started) {
      push('event', 'RevRag call ended. Riya is back on voice.');
    }
  }

  private greet() {
    const lang = currentLanguage();
    if (lang.code !== 'en') {
      // Let Riya greet in the customer's language rather than a canned English line.
      void this.run(`<app_event>Voice session started. Greet the customer warmly in ${lang.label}, introduce yourself as ${AGENT_NAME}, and ask how you can help with their loan.</app_event>`);
      return;
    }
    const step = currentStep();
    const text =
      step === 'discover'
        ? `Hi, I'm ${AGENT_NAME}, your relationship manager at Kosh Finance. Tell me what you need, like a 5 lakh personal loan for 3 years, and I'll set it all up for you.`
        : step === 'submitted'
          ? `Hi, I'm ${AGENT_NAME}. Your application is submitted. Ask me anything about what happens next.`
          : `Hi, I'm ${AGENT_NAME}. I can see you're on ${STEP_BY_ID[step].title}. Just tell me your details and I'll fill them in, or ask me anything.`;
    // Record the greeting in history so the model knows what was already said.
    this.messages.push({ role: 'user', content: [{ type: 'text', text: `${buildContext()}\n<app_event>Voice session started. ${AGENT_NAME} greeted the customer.</app_event>` }] });
    this.messages.push({ role: 'assistant', content: [{ type: 'text', text }] });
    this.say(text);
  }

  private say(text: string) {
    push('agent', text);
    if (!useAgent.getState().copilot) this.speaker.speak(text);
  }

  private isEcho(text: string) {
    const recent = this.speaker.speaking || Date.now() - this.lastSpokeAt < 1200;
    if (!recent) return false;
    const spoken = new Set(words(this.speaker.currentText || this.lastSpokenText));
    const heard = words(text);
    if (!heard.length) return true;
    const overlap = heard.filter((w) => spoken.has(w)).length / heard.length;
    return overlap >= 0.6;
  }

  private onUtterance(text: string) {
    useAgent.setState({ interim: '' });
    if (!text.trim() || this.isEcho(text)) return;
    // Barge-in: the customer started talking, so stop speaking and listen.
    if (this.speaker.speaking) this.speaker.stop();
    this.handle(text, 'speech');
  }

  sendText(text: string) {
    if (!text.trim()) return;
    this.speaker.unlock();
    if (!this.started) {
      // Typing works even without starting voice.
      this.started = true;
      useAgent.setState({ panelOpen: true });
      void this.loadProviders().then((p) => {
        this.speaker.setMurf(p.tts);
        this.handle(text, 'text');
      });
      return;
    }
    this.speaker.stop();
    this.handle(text, 'text');
  }

  private handle(text: string, kind: 'speech' | 'text' | 'event') {
    if (kind !== 'event') push('user', text);
    if (useAgent.getState().busy) {
      // Events are dropped while busy; the next turn's context will reflect the app state anyway.
      if (kind !== 'event') this.pending.push(text);
      return;
    }
    void this.run(text);
  }

  private async run(userText: string) {
    useAgent.setState({ busy: true });
    this.refreshStatus();
    const copilot = useAgent.getState().copilot;
    const base = this.messages.length;
    const carried = this.deferred;
    this.deferred = [];
    this.messages.push({
      role: 'user',
      content: [...carried, { type: 'text', text: buildContext({ voiceMuted: copilot }) }, { type: 'text', text: userText }],
    });

    let speakOnly = false;
    try {
      for (let i = 0; i < 10; i++) {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: this.messages, speakOnly }),
        });
        const body = (await res.json()) as { content?: Block[]; stop_reason?: string; error?: string; detail?: string };
        if (!res.ok || !body.content) throw Object.assign(new Error(body.error ?? `Agent error ${res.status}`), { status: res.status });

        this.messages.push({ role: 'assistant', content: body.content as Anthropic.Beta.BetaContentBlockParam[] });

        const text = body.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
          .map((b) => b.text)
          .join(' ')
          .trim();
        if (text) this.say(text);

        if (body.stop_reason === 'refusal') {
          this.say("Sorry, I can't help with that one. Is there anything about your loan I can do?");
          break;
        }
        if (body.stop_reason === 'pause_turn') continue;
        const toolUses = body.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
        if (body.stop_reason !== 'tool_use' || toolUses.length === 0) break;

        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        let needsFollowUp = !text;
        let failed = false;
        let informational = false;
        for (const tu of toolUses) {
          const input = (tu.input ?? {}) as Record<string, unknown>;
          const out = await executeTool(tu.name, input);
          push('action', out.summary, !out.isError);
          bus.emit({ type: 'agent_action', tool: tu.name, summary: out.summary });
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: out.content, is_error: out.isError || undefined });
          if (out.isError || out.content.includes('INVALID') || out.content.includes('NOT SET')) failed = true;
          if (returnsInformation(tu.name, input)) informational = true;
        }
        needsFollowUp ||= failed || informational;
        // A follow-up that only relays a result must not call tools, or its words come back hidden.
        speakOnly = informational && !failed;
        // Latency: if Riya already said her reply and every action simply succeeded, skip the follow-up
        // model call. The results are sent with the next user message, so history stays valid.
        if (!needsFollowUp) {
          this.deferred = results;
          break;
        }
        this.messages.push({ role: 'user', content: [...results, { type: 'text', text: buildContext({ voiceMuted: copilot }) }] });
      }
    } catch (e) {
      console.error(e);
      // Roll back this turn so the history stays valid (no dangling tool_use). Any actions already
      // taken are visible to the model next turn through app_context.
      this.messages.length = base;
      this.deferred = carried; // they belong to the assistant turn that is still in history
      const status = (e as { status?: number }).status;
      push('error', e instanceof Error ? e.message : String(e));
      // Be honest about the failure: a setup problem won't be fixed by the customer repeating themselves.
      if (status === 401 || status === 403 || status === 503)
        this.say("Sorry, I'm unavailable right now because of a setup problem on our side. You can still fill the form yourself, and I'll be back shortly.");
      else if (status === 429) this.say("I'm getting a lot of requests right now. Give me a few seconds and try again.");
      else this.say('Sorry, I lost my connection for a moment. Could you say that again?');
    } finally {
      useAgent.setState({ busy: false });
      this.refreshStatus();
      const next = this.pending.splice(0).join(' ');
      if (next) void this.run(next);
    }
  }

  reset() {
    this.stop();
    this.messages = [];
    this.pending = [];
    this.deferred = [];
    useAgent.setState({ items: [] });
  }
}

/** Tools whose output Riya has to relay or reason about, so they always need a follow-up model call. */
function returnsInformation(tool: string, input: Record<string, unknown>) {
  if (tool === 'calculate_emi' || tool === 'get_application_state') return true;
  return tool === 'press_button' && ['check_eligibility', 'submit_application', 'start_new_application'].includes(String(input.button));
}

export const agent = new AgentController();
