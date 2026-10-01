import { env, json } from './_lib.js';

// Mints a short-lived Deepgram JWT so the browser can stream mic audio straight to Deepgram
// without ever seeing the real API key.
export async function GET(): Promise<Response> {
  const key = env('DEEPGRAM_API_KEY');
  if (!key) return json({ error: 'Deepgram is not configured' }, 503);
  const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: { Authorization: `Token ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl_seconds: 60 }),
  });
  if (!res.ok) return json({ error: `Deepgram grant failed (${res.status})`, detail: await res.text() }, 502);
  const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };
  return json({ token: access_token, expiresIn: expires_in });
}
