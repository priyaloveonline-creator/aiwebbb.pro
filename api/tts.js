// /api/tts.js
// Edge Function — proxies OpenRouter's /api/v1/audio/speech endpoint.
// Returns raw audio bytes (mp3) to the browser. Key stays server-side.
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

  const { text, voice, model } = body;
  if (!text) {
    return new Response(JSON.stringify({ error: 'text is required' }), { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server is missing OPENROUTER_API_KEY' }), { status: 500 });
  }

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'https://aiwebbb.pro',
        'X-Title': 'AIWEBBB',
      },
      body: JSON.stringify({
        model: model || 'openai/gpt-4o-mini-tts-2025-12-15',
        input: text,
        voice: voice || 'alloy',
        response_format: 'mp3',
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      return new Response(JSON.stringify({ error: `TTS error ${upstream.status}: ${errText.slice(0, 300)}` }), {
        status: upstream.status,
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'TTS request failed' }), { status: 502 });
  }
}
