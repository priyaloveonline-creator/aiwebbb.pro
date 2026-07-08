// /api/transcribe.js
// Edge Function — proxies OpenRouter's /api/v1/audio/transcriptions endpoint.
// Accepts base64-encoded audio, returns transcribed text. Key stays server-side.
export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { audioBase64, model } = body;
  if (!audioBase64) {
    return new Response(JSON.stringify({ error: 'audioBase64 is required' }), { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server is missing OPENROUTER_API_KEY' }), { status: 500 });
  }

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'https://aiwebbb.pro',
        'X-Title': 'AIWEBBB',
      },
      body: JSON.stringify({
        model: model || 'openai/whisper-1',
        file: audioBase64,
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || `Transcription error ${upstream.status}` }), {
        status: upstream.status,
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Transcription request failed' }), { status: 502 });
  }
}
