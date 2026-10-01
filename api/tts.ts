import { env, json } from './_lib.js';

// Proxies Murf streaming TTS so the API key stays server-side. Streams MP3 back as it is generated.
export async function POST(request: Request): Promise<Response> {
  const key = env('MURF_API_KEY');
  if (!key) return json({ error: 'Murf is not configured' }, 503);
  const { text } = (await request.json().catch(() => ({}))) as { text?: string };
  if (!text || typeof text !== 'string') return json({ error: 'text is required' }, 400);
  if (text.length > 1500) return json({ error: 'text too long' }, 413);

  const res = await fetch('https://api.murf.ai/v1/speech/stream', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      voiceId: env('MURF_VOICE_ID') ?? 'en-IN-isha',
      ...(env('MURF_MODEL') ? { model: env('MURF_MODEL') } : {}),
      locale: env('MURF_LOCALE') ?? 'en-IN',
      format: 'MP3',
      sampleRate: 24000,
      channelType: 'MONO',
    }),
  });
  if (!res.ok || !res.body) return json({ error: `Murf failed (${res.status})`, detail: await res.text() }, 502);
  return new Response(res.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
}
