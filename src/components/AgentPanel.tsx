import { useEffect, useRef, useState } from 'react';
import { LANGUAGES } from '../../shared/languages';
import { agent, useAgent, type Status } from '../agent/controller';
import { useLanguage } from '../voice/language';

const STATUS_TEXT: Record<Status, string> = {
  off: 'Tap to talk',
  connecting: 'Connecting…',
  listening: 'Listening',
  thinking: 'Working on it…',
  speaking: 'Speaking · tap to interrupt',
};

const SUGGESTIONS = [
  'What loans do you offer?',
  'I want a 5 lakh personal loan for 3 years',
  'What documents do I need?',
  'What do I need to enter here?',
];

function Orb({ status, micOn, size = 'lg' }: { status: Status; micOn: boolean; size?: 'lg' | 'sm' }) {
  const dim = size === 'lg' ? 'size-16' : 'size-12';
  const color =
    status === 'speaking' ? 'from-accent to-brand-500' : status === 'thinking' ? 'from-brand-500 to-brand-700' : status === 'off' ? 'from-brand-600 to-brand-900' : 'from-brand-500 to-brand-600';
  return (
    <span className={`relative grid ${dim} place-items-center`}>
      {(status === 'listening' && micOn) || status === 'speaking' ? <span className={`orb-ripple absolute inset-0 rounded-full bg-gradient-to-br ${color}`} /> : null}
      {status === 'thinking' && <span className="orb-spin absolute -inset-1 rounded-full border-2 border-transparent border-t-accent" />}
      <span className={`relative ${dim} rounded-full bg-gradient-to-br ${color} shadow-lg ${status === 'listening' ? 'orb-breathe' : ''}`} />
      <span className="absolute text-lg text-white">{status === 'off' ? '●' : status === 'listening' && !micOn ? '⏸' : ''}</span>
    </span>
  );
}

export function AgentPanel() {
  const { status, panelOpen, micOn, interim, items, sttProvider } = useAgent();
  const [text, setText] = useState('');
  const lang = useLanguage();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [items.length, interim]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && agent.interrupt();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onOrb = () => {
    if (status === 'off') void agent.start();
    else if (status === 'speaking') agent.interrupt();
    else void agent.toggleMic();
  };

  const submit = (t: string) => {
    agent.sendText(t);
    setText('');
  };

  return (
    <>
      {/* Mobile launcher */}
      {!panelOpen && (
        <button type="button" aria-label="Open Sara" onClick={() => (agent.active ? useAgent.setState({ panelOpen: true }) : void agent.start())} className="fixed bottom-5 right-5 z-40 lg:hidden">
          <Orb status={status} micOn={micOn} size="sm" />
        </button>
      )}

      <aside
        aria-label="Sara, AI relationship manager"
        className={`fixed z-40 flex flex-col border-line bg-white shadow-2xl transition-transform lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[400px] lg:translate-y-0 lg:border-l lg:shadow-none ${
          panelOpen ? 'inset-x-0 bottom-0 h-[72dvh] translate-y-0 rounded-t-3xl border-t' : 'inset-x-0 bottom-0 h-[72dvh] translate-y-full'
        } lg:h-auto lg:rounded-none`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-900 font-display font-bold text-white">S</span>
            <div>
              <p className="font-semibold leading-tight">Sara</p>
              <p className="text-xs text-muted">AI Relationship Manager · powered by Claude</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <label className="sr-only" htmlFor="sara-language">
              Conversation language
            </label>
            <select
              id="sara-language"
              value={lang.code}
              onChange={(e) => lang.set(e.target.value)}
              className="max-w-[9.5rem] rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs text-ink outline-none focus:border-brand-500"
              title="Language Sara speaks and listens in"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.native === 'English' ? l.label : `${l.native} · ${l.label}`}
                </option>
              ))}
            </select>
            {status !== 'off' && (
              <button type="button" onClick={() => agent.stop()} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-canvas hover:text-bad">
                End
              </button>
            )}
            <button type="button" aria-label="Minimise" onClick={() => useAgent.setState({ panelOpen: false })} className="rounded-lg px-2.5 py-1.5 text-lg leading-none text-muted hover:bg-canvas lg:hidden">
              ⌄
            </button>
          </div>
        </div>

        <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
          {items.length === 0 && (
            <div className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-900">
              <p className="font-semibold">Hi, I'm Sara.</p>
              <p className="mt-1 text-brand-900/80">
                I can explain our loans, check your eligibility, and fill the application for you. Tap the orb and talk to me, or type below.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => submit(s)} className="rounded-full border border-brand-200 bg-white px-3 py-1 text-xs text-brand-700 hover:border-brand-500">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {items.map((it) =>
            it.role === 'user' ? (
              <p key={it.id} className="slide-in ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-sm text-white">
                {it.text}
              </p>
            ) : it.role === 'agent' ? (
              <p key={it.id} className="slide-in w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-canvas px-3.5 py-2 text-sm text-ink">
                {it.text}
              </p>
            ) : it.role === 'action' ? (
              <p key={it.id} className={`slide-in flex w-fit max-w-[95%] items-start gap-1.5 rounded-lg px-2.5 py-1 text-xs ${it.ok ? 'bg-ok/8 text-ok' : 'bg-accent/10 text-[#a4500f]'}`}>
                <span aria-hidden>{it.ok ? '⚡' : '!'}</span>
                {it.text}
              </p>
            ) : (
              <p key={it.id} className={`slide-in text-center text-xs ${it.role === 'error' ? 'text-bad' : 'text-muted'}`}>
                {it.text}
              </p>
            ),
          )}
          {interim && <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand-100 px-3.5 py-2 text-sm italic text-brand-900">{interim}…</p>}
        </div>

        <div className="border-t border-line px-4 pb-4 pt-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onOrb} aria-label={STATUS_TEXT[status]} className="shrink-0">
              <Orb status={status} micOn={micOn} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{status === 'listening' && !micOn ? 'Mic off · tap the orb to retry' : STATUS_TEXT[status]}</p>
              <p className="truncate text-xs text-muted">
                {status === 'off' ? 'Voice works best in Chrome or Edge' : sttProvider ? `Speech: ${sttProvider === 'deepgram' ? 'Deepgram' : 'browser'} · Esc to interrupt` : 'Type to chat'}
              </p>
            </div>
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Or type a message…"
              className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
            />
            <button type="submit" disabled={!text.trim()} className="rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white disabled:opacity-40">
              Send
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
