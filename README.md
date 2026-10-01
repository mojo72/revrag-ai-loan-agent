# Bliss Finance · Claude AI Loan Agent

A voice-first AI Relationship Manager ("Sara") that **understands, guides and operates** a loan application end to end. Built for the RevRag AI In-App Agent assignment. This branch (`claude-agent`) is the Claude-powered version: Claude reasons and operates the app, Deepgram listens, Murf (Khyati) speaks.

> Say *"I want a 5 lakh personal loan for 3 years"* and watch Sara pick the product, fill the amount and tenure, tell you what is still missing, check your eligibility, move you through each screen, and submit, by voice.

**Live app:** https://claude-ai-loan-agent.vercel.app · **RevRag-only version:** https://revrag-ai-loan-agent.vercel.app (branch `main`) · **Product feedback:** [docs/PRODUCT_FEEDBACK.md](docs/PRODUCT_FEEDBACK.md) · **Demo script:** [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) · **RevRag agent prompt & knowledge base:** [REVRAG_AGENT_PROMPT.md](REVRAG_AGENT_PROMPT.md)

Bliss Finance is a fictional lender. No real money, credit checks or KYC happen; uploaded files never leave the browser.

---

## What it does

| Capability | How it shows up |
|---|---|
| **Voice conversation** | Streaming speech-to-text (Deepgram Nova-3), natural replies in Murf's **Khyati** voice (Falcon model), barge-in (just start talking, or press Esc), echo filtering. Falls back to browser speech APIs if a provider is down. |
| **12 languages** | English / Hinglish, Hindi, Bengali, Tamil, Telugu, Marathi, Kannada, Gujarati, Punjabi, Malayalam, Assamese, Odia. Pick one in Sara's panel or just ask ("can we talk in Tamil?"). Sara replies in everyday spoken language in the native script, Khyati speaks it, and speech recognition switches to match. Form values are always captured in English and digits so validation keeps working. |
| **Conversational intelligence** | Products, rates, tenure, eligibility rules, documents, EMI, approval time, what happens after submission. All answers come from one product catalogue the UI also renders from, so the agent cannot contradict the screen. |
| **Action Intelligence** | Navigate screens, fill fields from speech ("5 lakh", "3 years", "HDFC", "aarav dot sharma at gmail dot com"), select options, tick checkboxes, press buttons (Continue, Check eligibility, Submit), scroll to and highlight fields/sections, update earlier answers, recover from validation errors. Every action is visible: fields glow as they are filled and an action timeline shows what was done. |
| **Application context** | Every turn the agent receives the current screen, its fields and their status, what is missing elsewhere, eligibility, and anything the customer did by hand. "What do I enter here?" is answered for the screen you are on. Information already given is never asked for again. |
| **Proactive help** | If the customer clicks Continue and validation fails, or runs eligibility themselves, the agent reacts without being asked. |
| **Guardrails** | Consents are only ticked after an explicit spoken "yes"; submission needs confirmation; the agent cannot skip the same gates a human faces (eligibility, required fields); sensitive values are masked on screen. |
| **RevRag In-App Agent** | RevRag widget embedded with route-aware `EmbedProvider`; user identity and live application context are streamed to RevRag (`USER_DATA`, `SCREEN_VIEW`, `FORM_STATE`, `CUSTOM_EVENT`, `ANALYTICS_DATA`). When a RevRag voice call is live, Sara switches to **co-pilot mode**: RevRag does the talking, Sara silently operates the app from the same conversation. |

## The journey

`Explore loans → Loan details → Eligibility → Personal → Employment & income → Address → Bank → Documents → Review & submit → Confirmation`

## Architecture

```
 Browser                                                     Vercel serverless (/api)
 ┌──────────────────────────────────────────────┐            ┌──────────────────────────────┐
 │ React app (forms render from shared/schema)   │            │ /api/agent   Claude (tools,   │
 │                                               │  messages  │              cached system    │
 │ Agent controller ── owns the agent loop ──────┼───────────►│              prompt)          │
 │   │ executes tool calls on the LIVE app       │◄───────────┤                               │
 │   │ (navigate/fill/press/scroll/emi/state)    │  tool_use  │ /api/stt-token  Deepgram JWT  │
 │   │                                           │            │ /api/tts        Murf stream   │
 │ Mic ─► Deepgram WS (PCM, short-lived token)   │            │ /api/config     provider flags│
 │ Speaker ◄─ Murf MP3 (sentence-pipelined)      │            └──────────────────────────────┘
 │                                               │
 │ RevRag SDK: widget + context events ──────────┼──► RevRag platform
 └──────────────────────────────────────────────┘
```

Key design decisions:

- **One schema, two consumers.** [`shared/schema.ts`](shared/schema.ts) defines steps, fields, options, normalisation and validation. The forms render from it, and the agent's tool enums, system prompt and context are generated from it. Field IDs can never drift between UI and agent.
- **The browser owns the agent loop.** `/api/agent` is a stateless proxy that adds the system prompt, tools and key. Tool calls execute against the real app state in the browser, so results report what actually happened (including validation errors) instead of what the model hoped happened.
- **Same gates for humans and agent.** The Continue button and the agent's `press_button("next")` call the same function ([`src/state/actions.ts`](src/state/actions.ts)).
- **Latency.** Low reasoning effort for snappy voice turns, a byte-stable cached prompt prefix, TTS synthesised per sentence in parallel so playback starts on the first sentence, and the spoken reply starts while tools are still executing.

| Path | What it is |
|---|---|
| `shared/` | Product catalogue, finance math (EMI, eligibility), schema, agent tools + system prompt |
| `api/` | Serverless routes (Vercel). Same files serve local dev through a Vite plugin |
| `src/agent/` | Controller (loop, barge-in, proactive events), tool executor, context builder |
| `src/voice/` | Deepgram streaming STT + browser fallback, Murf TTS + browser fallback, language state |
| `shared/languages.ts` | Per-language Murf locale, Deepgram model/language and browser fallback locale |
| `src/revrag/` | RevRag SDK integration and context sync |

## Run locally

Requires Node 20+.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local` (Anthropic, Deepgram, Murf, and the RevRag key), then:

```bash
npm run dev
```

Open http://localhost:5173 in Chrome or Edge and allow the microphone.

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

`push-env.sh` copies the keys from your `.env.local` into the Vercel project without printing them.

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | server | Agent reasoning and tool calling (Claude) |
| `DEEPGRAM_API_KEY` | server | Speech-to-text (browser gets 60s tokens only) |
| `MURF_API_KEY` | server | Text-to-speech |
| `VITE_REVRAG_API_KEY` | client | RevRag In-App Agent SDK key |
| `ANTHROPIC_MODEL` | server, optional | Defaults to `claude-opus-5-5` |
| `AGENT_EFFORT` | server, optional | `low` (default) / `medium` / `high` |
| `MURF_VOICE_ID`, `MURF_MODEL` | server, optional | Defaults `hi-IN-khyati`, `FALCON` |

The **Status** pill in the header shows which providers are live and how many context events have reached RevRag.

## Known limitations

- Browsers do not let scripts open a file picker without a click, so the agent guides the customer to the upload tile instead of uploading for them. A clearly labelled "sample documents" demo action exists for walkthroughs.
- Voice input is most reliable in Chrome and Edge. Safari and Firefox use Deepgram too, but browser-fallback STT is Chromium-only.
- Deepgram has no streaming model for Malayalam or Odia, so those two use the browser's speech recognition (best in Google Chrome).
- The public demo uses the deployer's API keys; set spend limits on each provider.
