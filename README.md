# Bliss Finance · AI Loan Relationship Manager

A voice-first AI Relationship Manager ("Sara") that **understands and guides** a customer through a loan application end to end, running entirely on the **RevRag In-App Agent**, with RevRag's Action Intelligence protocol implemented on the web side. Built for the RevRag AI In-App Agent assignment.

> Say *"I want a 5 lakh personal loan for 3 years"* and Sara explains the options, tells you exactly what to fill on each screen, checks what is still missing, and walks you through eligibility and submission, by voice.

**Live app:** https://revrag-ai-loan-agent.vercel.app · **Product feedback:** [docs/PRODUCT_FEEDBACK.md](docs/PRODUCT_FEEDBACK.md) · **Demo script:** [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) · **RevRag agent prompt & knowledge base:** [REVRAG_AGENT_PROMPT.md](REVRAG_AGENT_PROMPT.md)

Bliss Finance is a fictional lender. No real money, credit checks or KYC happen; uploaded files never leave the browser.

---

## What it does

| Capability | How it shows up |
|---|---|
| **Voice conversation (RevRag)** | Tap the orb and Sara joins a live voice call. Speech recognition, reasoning, voice and languages are the RevRag agent's, configured in the RevRag dashboard ([REVRAG_AGENT_PROMPT.md](REVRAG_AGENT_PROMPT.md)). Live transcripts and the agent's listening / thinking / speaking state show in Sara's panel. You can also type into the call. |
| **Guidance by voice** | Sara tells the customer what to fill or tap on the screen they are on, answers "what do I enter here?", explains validation errors, and walks them through to submission. The customer fills the form; the agent never claims actions it did not perform (enforced in the agent prompt). |
| **Action Intelligence, ready on the app side** | The app implements RevRag's Action Intelligence protocol for the web (from RevRag's mobile SDKs): it streams `ui_snapshot`s of the screen and executes and verifies `mission`s. Tested end to end with simulated RevRag missions. RevRag's agent does not currently send missions for this agent on web (it replies "I can't tap the screen for you"), so this switches on as soon as RevRag enables it; see [docs/PRODUCT_FEEDBACK.md](docs/PRODUCT_FEEDBACK.md). |
| **Application context** | The agent receives a fresh snapshot of the screen whenever it changes, when the customer finishes speaking, and after every action, including validation errors on fields, plus `SCREEN_VIEW`, `FORM_STATE` and milestone events through the RevRag SDK. |
| **Guardrails** | Once missions are enabled, agent writes go through the same normalisation and validation as a human, cannot skip the eligibility or required-field gates, and cannot open file pickers (the customer is asked to tap). |
| **Conversational knowledge** | Products, rates, tenure, eligibility, documents, EMI, approval time and next steps come from the knowledge base in [REVRAG_AGENT_PROMPT.md](REVRAG_AGENT_PROMPT.md), which mirrors `shared/products.ts`. |

## The journey

`Explore loans → Loan details → Eligibility → Personal → Employment & income → Address → Bank → Documents → Review & submit → Confirmation`

## Architecture

```
 Browser (React app)                                              RevRag
 ┌───────────────────────────────────────────────┐              ┌──────────────────────────────┐
 │ Forms render from shared/schema.ts             │              │ embed.revrag.ai              │
 │                                                │  init, events│  /embedded-agent/initialize  │
 │ RevragLayer ── @revrag-ai/embed-react SDK ─────┼─────────────►│  /embedded-agent/token       │
 │   USER_DATA, SCREEN_VIEW, FORM_STATE, ...      │              │                              │
 │                                                │  voice (WebRTC)                             │
 │ call.ts ── LiveKit room with RevRag token ─────┼─────────────►│ RevRag voice agent           │
 │   agent audio, transcripts, agent state        │◄─────────────┤  (STT, LLM, TTS, prompt,     │
 │                                                │              │   knowledge base, planner)   │
 │ Action Intelligence (data channel)             │  ui_snapshot │                              │
 │   snapshot.ts: DOM ─► ui_snapshot ─────────────┼─────────────►│                              │
 │   missions.ts: mission ─► act ─► verify ───────┼◄────mission──┤                              │
 │                         ─► verification_result ┼─────────────►│                              │
 └───────────────────────────────────────────────┘              └──────────────────────────────┘
```

Key design decisions:

- **RevRag end to end.** There is no other model or voice provider in the runtime. The app is a static site; RevRag runs the conversation. Today the agent talks and guides; form filling is done by the customer until RevRag enables missions for this agent.
- **Action Intelligence on web.** RevRag's official web SDK (1.4.4) has no Action Intelligence, but RevRag's mobile SDKs speak a wire protocol over the call's LiveKit data channel. `src/revrag/` implements that protocol for the browser, matching the mobile message shapes (`ui_snapshot`, `mission`, `cancel`, `highlight`, `request_ui_tree` in; `mission_status`, `mission_phase`, `verification_result`, `info_query_response`, `find_candidates_response` out), so RevRag's planner needs no web-specific changes.
- **Semantic snapshots, not raw DOM.** Each form control becomes one node with a stable id from the schema (`field.amount`, `field.product.personal`, `button.next`), its label, current value, checked state and any validation error. A full screen is about 7 KB; a size budget keeps every snapshot inside the data-channel limit.
- **Same gates for humans and the agent.** Agent writes go through the store's `coerceField` validation, and its Continue is the same button a human presses. Results report what actually happened, including `blocked_by_validation` with the exact missing fields.

| Path | What it is |
|---|---|
| `shared/` | Product catalogue, finance math (EMI, eligibility), form schema |
| `src/revrag/RevragLayer.tsx` | RevRag SDK initialisation and context events |
| `src/revrag/call.ts` | The RevRag voice session: token, LiveKit room, audio, transcripts, snapshot pump |
| `src/revrag/snapshot.ts` | DOM to RevRag `ui_snapshot` |
| `src/revrag/missions.ts` | RevRag `mission` execution, verification and reporting |
| `src/state/` | App store, journey gates, actions shared by buttons and agent |

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

Open http://localhost:5173 in Chrome or Edge, tap the orb, and allow the microphone.

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

The **Status** pill in the header shows the RevRag SDK state, the call, and Action Intelligence traffic (snapshots sent, missions received, actions taken).

## Known limitations

- Browsers do not let scripts open a file picker without a click, so the agent asks the customer to tap the upload tile. A clearly labelled "sample documents" demo button exists for walkthroughs.
- The web Action Intelligence protocol is reverse-engineered from RevRag's React Native SDK (1.1.0). If RevRag changes the wire format, `src/revrag/` needs updating; see [docs/PRODUCT_FEEDBACK.md](docs/PRODUCT_FEEDBACK.md).
- Voice is most reliable in Chrome and Edge.
