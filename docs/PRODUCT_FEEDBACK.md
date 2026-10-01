# RevRag In-App Agent: product feedback

From building a voice-first loan Relationship Manager on the RevRag **React (web) SDK** (`@revrag-ai/embed-react` 1.4.4). Everything below comes from actually integrating it: reading the docs, installing the package, reading the shipped bundle where the docs were silent, and wiring it into a working app.

## TL;DR

1. **The biggest gap: Action Intelligence does not exist on web.** It is documented for React Native, Flutter and Android only. The React SDK has no way for the agent to see the DOM or act on it, and no way for the host app to register actions the agent can call. The assignment's most important requirement could not be met with RevRag alone on web, so I built an action layer next to it.
2. **The host app cannot hear the conversation.** There is no transcript or intent callback on web. To let the app act on what was said during a RevRag call, I had to open a second microphone stream with my own STT. That doubles audio cost, risks echo, and splits the "brain" in two.
3. **The SDK's developer experience undercuts trust**: TypeScript types resolve to `any`, documented hooks are not exported, useful event keys are undocumented, and there is no self-serve key to try it.
4. **The foundation is good**: three-line integration, route-aware visibility, a clean event model, and server-side handling of voice infrastructure (LiveKit) are genuinely fast to adopt.

---

## 1. RevRag integration

### What was easy
- **Getting the widget on screen.** `useInitialize(key)` + `<EmbedProvider>` and the voice button appears. No audio, WebRTC or LiveKit plumbing on my side.
- **Route-aware visibility.** `EmbedProvider` with `includeScreens`, delays and continuity groups is a thoughtful API. Passing `usePathHook` made it work with React Router immediately.
- **The event model is the right shape.** `USER_DATA` → identity, `CUSTOM_EVENT` / `ANALYTICS_DATA` → milestones. I streamed screen views, form state, eligibility results, submission and every agent action into RevRag in about 80 lines.
- **Agent lifecycle callbacks** (`agent_start` / `agent_end`) were enough to build a hand-off: when a RevRag call starts, my agent switches into a silent "co-pilot" mode.
- **Styling isolation.** Prefixed classes did not collide with Tailwind.

### What was difficult / broken (verified)
| Issue | Evidence | Impact |
|---|---|---|
| **Type declarations are broken.** `index.d.ts` re-exports from `../../core/src/index.ts` and `./components/AIWidget`, which are not in the package. | `const x: number = embedEvent` compiles without error. | Every import is silently `any`: no autocomplete, no compile-time safety, wrong props go unnoticed. |
| **Documented hooks are not exported.** `useLiveKit` (connect / disconnect / toggleMute), `useSSRSafe`, `useBrowserSafe` are in the React docs. | Runtime exports are only `EmbedButton, EmbedProvider, EventKeys, embedEvent, useEmbed, useInitialize`. | No programmatic call control on web, so I could not start a RevRag call from my own "Talk" button or mute it when my agent speaks. |
| **Docs example uses an object that does not exist.** "Handling Connection Errors" calls `embed.addCallback`. | `embed` is not exported. | Copy-paste fails. |
| **Undocumented event keys.** `EventKeys` contains `FORM_STATE`, `SCREEN_VIEW` and `OFFER_DATA`; the docs say only `USER_DATA`, `CUSTOM_EVENT`, `ANALYTICS_DATA` may be sent. | Read from the bundle. | These are exactly what an in-app agent needs. I used them, but cannot know whether the agent actually consumes them. |
| **Undocumented props.** `EmbedProvider` accepts `embedButtonProps`; not in the props table. | Read from the bundle. | Needed to move the widget so it does not overlap my own UI. |
| **No self-serve API key.** "Contact our team for integration keys." | Docs, Getting Started step 2. | Nobody can evaluate the SDK on their own; for a developer product this is the top-of-funnel. |
| **Heavy bundle and `eval`.** ~495 KB main + ~424 KB lottie chunk; the lottie chunk uses direct `eval`. | Vite/Rolldown build warning. | Breaks strict CSP (common in BFSI apps, your core market) and costs load time on mobile web. |
| **Ordering trap.** Events are dropped unless `USER_DATA` was sent first. | Docs troubleshooting. | Easy to lose early events (first screen view). The SDK should queue them until identity arrives. |

### SDK / API feedback
- Ship correct `.d.ts` files and add a CI check that the published package type-checks in a blank project.
- Export a call-control hook on web (start, end, mute, `isConnected`, `isSpeaking`), like the mobile SDKs.
- Queue events until `USER_DATA` arrives instead of dropping them.
- Lazy-load the lottie animation; remove `eval`; publish a CSP guide.
- Publish a changelog for the React SDK (React Native and Flutter have release notes; React does not).

---

## 2. Agent experience

### What worked well
- Voice infrastructure is fully managed (LiveKit room, tokens, audio routing). That is a big amount of hard work I never had to touch.
- Agent identity and lifecycle events make it possible to build UI around the call (status, co-pilot hand-off).

### What did not work well
- **Configuration is invisible from the SDK.** Persona, knowledge base and voice are set in a dashboard the docs never describe. As a developer I could not tell what the agent knows, which events it reads, or whether `FORM_STATE` reaches its context *during* a live call or only after. I wrote [REVRAG_AGENT_SETUP.md](REVRAG_AGENT_SETUP.md) as the knowledge I would paste in, but there is no documented contract for "event X becomes context Y".
- **No transcript stream on web.** The only data-channel message the web SDK handles is `type: "calculation"`. Transcripts, agent intents and tool calls never reach the host app, so the app cannot show captions, log the conversation, or act on what was said.
- **One conversation, two brains.** Because the app cannot see the RevRag conversation, my co-pilot has to listen to the mic separately and run its own model to decide actions. The two can disagree (RevRag says "noted" while the co-pilot mishears). A single agent that both talks and acts is the right architecture; today it is impossible on web.

### Context-awareness observations
- Context is push-only (events). There is no way for the agent to *pull* state ("what is on screen right now?") at the moment it needs it. In my own agent, sending a compact structured snapshot of the current screen with every turn (fields, status, what is missing elsewhere, what the user did by hand) was the single biggest quality lever: it removed repeated questions and made "what do I enter here?" work.

---

## 3. Action Intelligence

### What I needed and could not get from RevRag on web
Navigate, fill fields, select options, press buttons, scroll/highlight, read validation errors, and verify the action worked. The React Native docs describe exactly this pipeline (UI capture → decide → tap/type/select/scroll → verify), but none of it ships in the React SDK.

### What I built instead (and what it taught me)
A typed action layer generated from the app's form schema: `navigate_to`, `fill_fields`, `press_button`, `scroll_to`, `calculate_emi`, `get_application_state`. Lessons that apply directly to RevRag's design:

1. **Declared actions beat DOM scraping for forms.** Because the agent's tool enums come from the same schema the UI renders from, it never targets a field that does not exist, and the app normalises "5 lakh", "3 years", "HDFC" or "aarav dot sharma at gmail dot com" into valid values. Inferring this from a DOM/UI tree is much harder and more fragile.
2. **Actions must return real outcomes.** Every tool returns what actually happened, including validation errors ("IFSC must look like HDFC0001234"). That is what lets the agent recover gracefully instead of claiming success.
3. **The agent must hit the same gates as a human.** The agent's "Continue" calls the same function as the button, so it cannot skip eligibility or required fields.
4. **Visible action is the product.** Fields glow as they fill, the agent scrolls to and rings what it is talking about, and a timeline lists every action. Without this, users do not trust what the agent did.
5. **Some actions must stay with the human.** Browsers will not open a file picker without a click; consents need an explicit "yes". The agent guides, the customer acts.

### Missing capabilities and edge cases found
- File upload cannot be agent-driven on web (user-activation rule). RevRag needs a first-class "hand to human" action: highlight + spoken prompt + wait for completion event.
- Consent and submission need a confirmation primitive with an audit trail (who agreed, when, to what wording). Regulated lenders will ask for this.
- Partial answers across screens ("my income is 85k" while on Loan details) need "save for later screen" semantics, not just "fill visible field".
- Speech-to-text errors in structured fields (PAN, IFSC, email) need read-back-and-confirm patterns built into the action layer.

---

## 4. Platform improvements (top recommendations)

### 1. Ship Action Intelligence for web, with a declarative action API
- **What:** `registerActions([{ name, description, schema, handler }])` in the React SDK, plus an optional automatic DOM capture mode. The agent calls handlers over the existing LiveKit data channel (RPC); the handler result goes back to the agent.
- **Why:** Web is where most BFSI customer journeys start, and "agent that operates the app" is RevRag's core differentiator. Today it is absent on the platform reviewers and buyers try first.
- **Problem solved:** Removes the need for a second STT stream and a second model; one brain both talks and acts.
- **Impact:** Turns the web SDK from a voice widget into an in-app agent; unlocks the headline demo on every platform.

### 2. Make context a contract, not a black box
- **What:** Document exactly how each event type enters the agent's context (live vs post-call, token budget, precedence). Add a `setContext({...})` call that replaces the agent's live app state, and a pull-style "get_app_state" the agent can call.
- **Why:** I could send `FORM_STATE`, but could not know if the agent used it.
- **Impact:** Fewer repeated questions, predictable behaviour, and developers can debug "why did the agent ask that again?"

### 3. Expose the conversation to the host app
- **What:** Callbacks for `transcript` (user and agent, interim and final), `agent_speaking`, `tool_call`, `error`.
- **Why:** Captions (accessibility), audit logs (compliance), and UI reactions all need it.
- **Impact:** Unblocks regulated deployments and richer UX.

### 4. Developer experience: self-serve sandbox and an agent debugger
- **What:** A free sandbox key with a demo agent; a dev panel (or dashboard view) showing, per turn: transcript, context the agent saw, actions called with inputs/outputs, latency per stage (STT, LLM, TTS).
- **Why:** I had no way to see why the agent said something, which is the first thing a developer needs when tuning an agent.
- **Impact:** Faster integrations, fewer support tickets, higher trial conversion.

### 5. SDK quality bar
Correct types, exported documented hooks, CSP-safe bundle, event queueing, React changelog. Individually small, together they decide whether a bank's engineering team trusts the SDK.

---

## 5. Other observations, assumptions and ideas

- **Assumption:** Kosh Finance products, rates and policies are fictional but realistic for the Indian market.
- **Echo and barge-in:** with the mic open while the agent speaks, browser echo cancellation is not enough on laptop speakers. I filter transcripts that mostly match what the agent is currently saying; RevRag could do this server-side since it knows its own TTS output.
- **Latency budget:** voice feels natural only if the first audio starts within about 1.5 to 2 seconds. Sentence-level TTS pipelining (synthesise all sentences in parallel, play the first as soon as it is ready) gave the biggest perceived gain.
- **Idea:** "Resume where you left off" calls: the agent greets a returning user with the exact step and missing fields, using the same context snapshot.
- **Idea:** Agent-initiated nudges when a user stalls on a screen (with rate limiting), which is where most loan funnels leak.

## 6. Live-call observations

_To be completed after testing the RevRag agent with the issued API key: latency, voice quality, how well it used the streamed context, and behaviour when the co-pilot acts during the call._
