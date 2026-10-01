import Anthropic from '@anthropic-ai/sdk';
import { AGENT_TOOLS, SYSTEM_PROMPT } from '../shared/agentSpec.js';
import { env, json } from './_lib.js';

// One model turn of the agent loop. The browser owns the loop: it executes tool calls against the
// live app state (so results reflect what really happened on screen) and posts the results back here.
// This route is stateless and only adds the system prompt, tools and the API key.

const MAX_MESSAGES = 240;
const MAX_BODY_BYTES = 400_000;

let client: Anthropic | undefined;

export async function POST(request: Request): Promise<Response> {
  if (!env('ANTHROPIC_API_KEY')) return json({ error: 'Anthropic is not configured' }, 503);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Conversation too long, please start a new session.' }, 413);

  let messages: Anthropic.Beta.BetaMessageParam[];
  try {
    messages = (JSON.parse(raw) as { messages: Anthropic.Beta.BetaMessageParam[] }).messages;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES)
    return json({ error: 'Invalid messages' }, 400);

  client ??= new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), maxRetries: 1, timeout: 45_000 });
  const useFallbacks = env('AGENT_FALLBACKS') !== 'off';

  try {
    const response = await client.beta.messages.create({
      model: env('ANTHROPIC_MODEL') ?? 'claude-opus-5-5',
      max_tokens: 4000,
      // Voice needs snappy turns: low effort keeps latency down; tool use is still reliable.
      output_config: { effort: (env('AGENT_EFFORT') as 'low' | 'medium' | 'high') ?? 'low' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: AGENT_TOOLS as unknown as Anthropic.Beta.BetaToolUnion[],
      cache_control: { type: 'ephemeral' },
      messages,
      ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });

    return json({
      content: response.content,
      stop_reason: response.stop_reason,
      model: response.model,
      usage: response.usage,
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'The assistant is busy, please try again in a moment.' }, 429);
    if (err instanceof Anthropic.APIError) return json({ error: `Model error (${err.status})`, detail: err.message }, 502);
    return json({ error: 'Agent request failed', detail: String(err) }, 500);
  }
}
