import { useEffect, useState } from 'react';
import { FIELDS, coerceField, fieldError, isRequired, isVisible, optionsFor, type FieldValue, type FileMeta } from '../../shared/schema';
import { useApp } from '../state/store';
import { useHighlight } from './useHighlight';

const inputCls =
  'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-brand-500 focus:ring-4 focus:ring-brand-100';

export function Field({ id, carriedFrom, showErrors = false }: { id: string; carriedFrom?: string; showErrors?: boolean }) {
  const f = FIELDS[id];
  const data = useApp((s) => s.data);
  const touchedAt = useApp((s) => s.agentTouched[id]);
  const setField = useApp((s) => s.setField);
  const value = data[id];
  const pointed = useHighlight(id);
  const [, force] = useState(0);
  const [blurred, setBlurred] = useState(false);

  // Re-trigger the glow animation each time the agent fills this field.
  useEffect(() => force((n) => n + 1), [touchedAt]);

  if (!isVisible(f, data)) return null;
  const err = fieldError(id, data);
  const showErr = err && (showErrors || (blurred && err !== 'Required'));
  const set = (v: FieldValue) => setField(id, v, 'user');
  const fromAgent = touchedAt && Date.now() - touchedAt < 2500;

  const commitText = (raw: string) => {
    if (raw === '') return set(undefined);
    const { value: v } = coerceField(id, raw, data);
    set(v ?? raw);
  };

  let control: React.ReactNode;
  switch (f.type) {
    case 'radio':
      control = (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={f.label}>
          {optionsFor(f, data).map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={value === o.value}
              onClick={() => set(o.value)}
              className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                value === o.value ? 'border-brand-600 bg-brand-600 text-white shadow-sm' : 'border-line bg-white text-ink hover:border-brand-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      );
      break;
    case 'select':
      control = (
        <select className={inputCls} value={String(value ?? '')} onChange={(e) => set(e.target.value || undefined)} onBlur={() => setBlurred(true)}>
          <option value="">Select…</option>
          {optionsFor(f, data).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'checkbox':
      control = (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-3.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={value === true} onChange={(e) => set(e.target.checked)} />
          <span>{f.label}</span>
        </label>
      );
      break;
    case 'date':
      control = <input type="date" className={inputCls} value={String(value ?? '')} onChange={(e) => set(e.target.value || undefined)} onBlur={() => setBlurred(true)} />;
      break;
    case 'file':
      control = <FileTile id={id} value={value as FileMeta | undefined} onPick={(m) => set(m)} />;
      break;
    default:
      control = (
        <TextLike
          key={`${touchedAt ?? 0}`}
          value={value}
          currency={f.type === 'currency'}
          numeric={f.type === 'number'}
          placeholder={f.placeholder}
          prefix={f.prefix}
          suffix={f.suffix}
          onCommit={(raw) => {
            commitText(raw);
            setBlurred(true);
          }}
        />
      );
  }

  return (
    <div id={`field-${id}`} className={`scroll-mt-28 rounded-2xl p-1 ${pointed ? 'agent-point' : ''}`}>
      {f.type !== 'checkbox' && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <label className="text-sm font-medium text-ink">
            {f.label}
            {isRequired(f, data) && <span className="text-bad"> *</span>}
          </label>
          {carriedFrom && value !== undefined && <span className="text-xs text-brand-600">Carried over from {carriedFrom}</span>}
        </div>
      )}
      <div key={touchedAt} className={`rounded-xl ${fromAgent ? 'agent-glow' : ''}`}>
        {control}
      </div>
      {showErr ? <p className="mt-1 text-xs text-bad">{err}</p> : f.hint && <p className="mt-1 text-xs text-muted">{f.hint}</p>}
    </div>
  );
}

function TextLike(props: {
  value: FieldValue;
  currency: boolean;
  numeric: boolean;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  onCommit: (raw: string) => void;
}) {
  const fmt = (v: FieldValue) => (v === undefined ? '' : props.currency && typeof v === 'number' ? v.toLocaleString('en-IN') : String(v));
  const [text, setText] = useState(fmt(props.value));
  useEffect(() => setText(fmt(props.value)), [props.value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex items-center rounded-xl border border-line bg-white focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
      {props.prefix && <span className="pl-3.5 text-[15px] text-muted">{props.prefix}</span>}
      <input
        className="w-full bg-transparent px-3.5 py-2.5 text-[15px] outline-none placeholder:text-muted/60"
        inputMode={props.currency || props.numeric ? 'numeric' : undefined}
        value={text}
        placeholder={props.placeholder}
        onChange={(e) => {
          if (!props.currency) return setText(e.target.value);
          const digits = e.target.value.replace(/\D/g, '');
          setText(digits ? Number(digits).toLocaleString('en-IN') : '');
        }}
        onBlur={() => props.onCommit(text.replace(/,/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {props.suffix && <span className="pr-3.5 text-sm text-muted">{props.suffix}</span>}
    </div>
  );
}

function FileTile({ id, value, onPick }: { id: string; value?: FileMeta; onPick: (m: FileMeta) => void }) {
  const f = FIELDS[id];
  return (
    <label
      className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed p-4 transition ${
        value ? 'border-ok/40 bg-ok/5' : 'border-line bg-white hover:border-brand-200'
      }`}
    >
      <span className={`grid size-10 shrink-0 place-items-center rounded-lg text-lg ${value ? 'bg-ok/10 text-ok' : 'bg-brand-50 text-brand-600'}`}>{value ? '✓' : '↑'}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{value ? value.name : `Upload ${f.label}`}</span>
        <span className="block truncate text-xs text-muted">{value ? `${(value.size / 1024).toFixed(0)} KB${value.sample ? ' · sample file (demo)' : ''}` : f.help}</span>
      </span>
      <span className="text-xs font-medium text-brand-600">{value ? 'Replace' : 'Choose file'}</span>
      <input
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick({ name: file.name, size: file.size });
        }}
      />
    </label>
  );
}
