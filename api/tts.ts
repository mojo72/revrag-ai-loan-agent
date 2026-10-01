import { MURF_LOCALES } from '../shared/languages.js';
import { env, json } from './_lib.js';

// Proxies Murf streaming TTS so the API key stays server-side. Default voice is Khyati on Murf's
// multilingual Falcon model; `locale` picks the language she speaks (English and 11 Indian languages).
export async function POST(request: Request): Promise<Response> {
  const key = env('MURF_API_KEY');
  if (!key) return json({ error: 'Murf is not configured' }, 503);
  const { text, locale } = (await request.json().catch(() => ({}))) as { text?: string; locale?: string };
  if (!text || typeof text !== 'string') return json({ error: 'text is required' }, 400);
  if (text.length > 1500) return json({ error: 'text too long' }, 413);

  const res = await fetch('https://api.murf.ai/v1/speech/stream', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      voiceId: env('MURF_VOICE_ID') ?? 'hi-IN-khyati',
      model: env('MURF_MODEL') ?? 'FALCON',
      locale: locale && MURF_LOCALES.has(locale) ? locale : 'en-IN',
      format: 'MP3',
      sampleRate: 24000,
      channelType: 'MONO',
    }),
  });
  if (!res.ok || !res.body) return json({ error: `Murf failed (${res.status})`, detail: await res.text() }, 502);
  return new Response(res.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
}
