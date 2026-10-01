import { useState } from 'react';
import { emiBreakdown } from '../../shared/finance';
import { PRODUCTS, PRODUCT_IDS, formatINR, type ProductId } from '../../shared/products';
import { call, useCall } from '../revrag/call';
import { useHighlight } from '../components/useHighlight';
import { goTo } from '../state/actions';
import { useApp } from '../state/store';

const ICON: Record<ProductId, string> = { personal: '◎', home: '⌂', car: '⛟', business: '▣' };

export function DiscoverPage() {
  const setField = useApp((s) => s.setField);
  const active = useCall((s) => s.status !== 'off');
  const pointedProducts = useHighlight('products');

  return (
    <div className="slide-in">
      <section className="relative overflow-hidden rounded-[28px] bg-brand-900 px-6 py-10 text-white shadow-xl sm:px-10">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-brand-500/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 size-64 rounded-full bg-accent/25 blur-3xl" />
        <p className="relative text-sm font-medium text-brand-200">Bliss Finance · Instant loans</p>
        <h1 className="relative mt-2 max-w-lg font-display text-4xl font-bold leading-tight sm:text-5xl">Just say what you need. Sara walks you through it.</h1>
        <p className="relative mt-3 max-w-md text-brand-100">
          Your AI relationship manager, powered by RevRag, answers your questions and guides you through eligibility and the application, by voice.
        </p>
        <div className="relative mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void call.start()}
            disabled={active}
            className="flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-semibold text-brand-900 shadow-lg transition hover:bg-brand-50 disabled:opacity-70"
          >
            <span className="grid size-6 place-items-center rounded-full bg-brand-600 text-xs text-white">●</span>
            {active ? 'Sara is on the call' : 'Talk to Sara'}
          </button>
          <button type="button" onClick={() => goTo('loan')} className="rounded-2xl border border-white/30 px-5 py-3 font-semibold text-white hover:bg-white/10">
            Apply on my own
          </button>
        </div>
        <p className="relative mt-4 text-xs text-brand-200">Try: “I want a 5 lakh personal loan for 3 years”</p>
      </section>

      <h2 className="mt-10 font-display text-2xl font-bold">Our loans</h2>
      <div id="products" className={`mt-4 grid scroll-mt-28 gap-3 sm:grid-cols-2 ${pointedProducts ? 'agent-point' : ''}`}>
        {PRODUCT_IDS.map((id) => {
          const p = PRODUCTS[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setField('product', id, 'user');
                goTo('loan');
              }}
              className="group rounded-3xl border border-line bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-xl text-brand-600">{ICON[id]}</span>
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-muted">{p.tagline}</p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted">Rate from</dt>
                  <dd className="text-base font-bold text-brand-900">{p.minRate}%</dd>
                </div>
                <div>
                  <dt className="text-muted">Up to</dt>
                  <dd className="text-base font-bold text-brand-900">{formatINR(p.maxAmount).replace(',00,00,000', ' Cr').replace(',00,000', ' L')}</dd>
                </div>
                <div>
                  <dt className="text-muted">Tenure</dt>
                  <dd className="text-base font-bold text-brand-900">{p.maxTenureMonths / 12} yrs</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs font-medium text-brand-600 group-hover:underline">Apply →</p>
            </button>
          );
        })}
      </div>

      <EmiCalculator />
    </div>
  );
}

function EmiCalculator() {
  const [product, setProduct] = useState<ProductId>('personal');
  const p = PRODUCTS[product];
  const [amount, setAmount] = useState(5_00_000);
  const [months, setMonths] = useState(36);
  const a = Math.min(Math.max(amount, p.minAmount), p.maxAmount);
  const m = Math.min(Math.max(months, p.minTenureMonths), p.maxTenureMonths);
  const b = emiBreakdown(a, p.minRate, m);
  const pointed = useHighlight('emi_calculator');

  return (
    <section id="emi_calculator" className={`mt-10 scroll-mt-28 rounded-3xl border border-line bg-white p-5 shadow-sm sm:p-6 ${pointed ? 'agent-point' : ''}`}>
      <h2 className="font-display text-2xl font-bold">EMI calculator</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {PRODUCT_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setProduct(id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${id === product ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700'}`}
          >
            {PRODUCTS[id].name}
          </button>
        ))}
      </div>
      <div className="mt-5 grid gap-6 sm:grid-cols-[1fr_220px]">
        <div className="space-y-5">
          <label className="block text-sm">
            <span className="flex justify-between font-medium">
              Amount <span className="text-brand-700">{formatINR(a)}</span>
            </span>
            <input type="range" className="mt-2 w-full" min={p.minAmount} max={p.maxAmount} step={p.minAmount} value={a} onChange={(e) => setAmount(+e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="flex justify-between font-medium">
              Tenure <span className="text-brand-700">{m} months</span>
            </span>
            <input type="range" className="mt-2 w-full" min={p.minTenureMonths} max={p.maxTenureMonths} step={6} value={m} onChange={(e) => setMonths(+e.target.value)} />
          </label>
          <p className="text-xs text-muted">At our starting rate of {p.minRate}% p.a. Your actual rate depends on your credit profile.</p>
        </div>
        <div className="rounded-2xl bg-brand-50 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-muted">Monthly EMI</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand-900">{formatINR(b.emi)}</p>
          <p className="mt-3 text-xs text-muted">Interest {formatINR(b.totalInterest)}</p>
          <p className="text-xs text-muted">Total {formatINR(b.totalPayable)}</p>
        </div>
      </div>
    </section>
  );
}
