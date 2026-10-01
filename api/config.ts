import { env, json } from './_lib.js';

// Tells the browser which voice/LLM providers are configured so it can fall back gracefully.
export function GET(): Response {
  return json({
    llm: !!env('ANTHROPIC_API_KEY'),
    stt: !!env('DEEPGRAM_API_KEY'),
    tts: !!env('MURF_API_KEY'),
  });
}
