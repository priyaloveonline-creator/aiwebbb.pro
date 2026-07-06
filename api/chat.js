// /api/chat.js
// Edge Function — streams AI responses from OpenRouter without ever
// exposing OPENROUTER_API_KEY to the browser.
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

  const { model, messages } = body;
  if (!model || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'model and messages are required' }), { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server is missing OPENROUTER_API_KEY' }), { status: 500 });
  }

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'https://aiwebbb.pro',
        'X-Title': 'AIWEBBB',
      },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return new Response(JSON.stringify({ error: `OpenRouter error ${upstream.status}: ${text.slice(0, 300)}` }), {
        status: upstream.status,
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Upstream request failed' }), { status: 502 });
  }
}
