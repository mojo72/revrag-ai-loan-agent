# Bliss Finance · RevRag AI Loan Agent

A loan application with **Sara**, an AI Relationship Manager running entirely on the **RevRag In-App Agent**, integrated exactly as the [RevRag React guide](https://docs.revrag.ai/embed/integration/react) describes. Built for the RevRag AI In-App Agent assignment.

**Live app:** https://revrag-ai-loan-agent.vercel.app · **Claude version (separate app, branch `claude-agent`):** https://claude-ai-loan-agent.vercel.app · **Product feedback:** [docs/PRODUCT_FEEDBACK.md](docs/PRODUCT_FEEDBACK.md) · **Demo script:** [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) · **RevRag agent prompt & knowledge base:** [REVRAG_AGENT_PROMPT.md](REVRAG_AGENT_PROMPT.md)

Bliss Finance is a fictional lender. No real money, credit checks or KYC happen; uploaded files never leave the browser.

---

## What it does

| Capability | How it shows up |
|---|---|
| **RevRag agent button** | RevRag's own floating agent button sits in the bottom-right corner of every screen. Tap it to start a voice conversation with Sara. |
| **Voice conversation** | Speech recognition, reasoning, voice and languages are all the RevRag agent's, configured in the RevRag dashboard with [REVRAG_AGENT_PROMPT.md](REVRAG_AGENT_PROMPT.md). |
| **Application context** | The customer is identified with `USER_DATA`, then RevRag receives the current screen, what has been filled in, eligibility results, validation failures and submission as events, so Sara can guide the customer on the screen they are on. |
| **Guidance** | Sara answers product questions, explains each screen, helps fix validation errors, and walks the customer to submission. The customer fills the form. |

## The journey

`Explore loans → Loan details → Eligibility → Personal → Employment & income → Address → Bank → Documents → Review & submit → Confirmation`

## RevRag integration (as documented)

| Step in the docs | Where |
|---|---|
| Import `@revrag-ai/embed-react/style.css` | `src/revrag/RevragLayer.tsx` |
| `useInitialize(apiKey)` once at the root | `RevragLayer` |
| `<EmbedProvider usePathHook={...} embedButtonProps embedButtonPosition>` wrapping the router content; it renders RevRag's floating `EmbedButton` and tracks the route | `RevragLayer` |
| Send `USER_DATA` with `app_user_id` before any other event | `ContextSync` |
| Context as `CUSTOM_EVENT` (`screen_view`, `form_state`, `eligibility_checked`, `application_submitted`) and `ANALYTICS_DATA` (`validation_failed`) | `ContextSync` |
| `embedEvent.addCallback` for `agent_start` / `agent_end` | `ContextSync` (drives the Status pill) |

| Path | What it is |
|---|---|
| `shared/` | Product catalogue, finance math (EMI, eligibility), form schema |
| `src/revrag/RevragLayer.tsx` | The whole RevRag integration |
| `src/state/` | App store, journey gates and actions |
| `src/pages/`, `src/components/` | The loan application UI |

## Run locally

Requires Node 20+.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Put your RevRag In-App Agent key in `.env.local` as `VITE_REVRAG_API_KEY`, then:

```bash
npm run dev
```

Open http://localhost:5173 in Chrome or Edge and tap the RevRag agent button in the bottom-right corner.

## Deploy (Vercel)

```bash
npx vercel link
```

```bash
./scripts/push-env.sh
```

```bash
npx vercel deploy --prod
```

The **Status** pill in the header shows whether the RevRag SDK is initialised, the customer is identified, a call is active, and how many context events were sent.

## Known limitations (RevRag web SDK 1.4.4)

- No Action Intelligence on web: Sara guides, the customer fills the form. Details and recommendations in [docs/PRODUCT_FEEDBACK.md](docs/PRODUCT_FEEDBACK.md).
- No programmatic call control on web (`useLiveKit` is documented but not exported), so the call can only be started from RevRag's floating button.
