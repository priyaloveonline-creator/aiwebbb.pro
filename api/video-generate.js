// /api/video-generate.js
// Node function — submits an async video generation job to OpenRouter.
// Video generation is billed per-second of output and is currently the
// most expensive AI modality (roughly $0.10-0.75 per second of video
// depending on model/resolution) — price your credits accordingly before
// enabling this tool for users.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, model } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Server is missing OPENROUTER_API_KEY' });

    const upstream = await fetch('https://openrouter.ai/api/v1/videos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'https://aiwebbb.pro',
        'X-Title': 'AIWEBBB',
      },
      body: JSON.stringify({
        model: model || 'kwaivgi/kling-v3.0-std',
        prompt,
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.error?.message || `Video generation error ${upstream.status}` });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error('video-generate error:', err);
    res.status(500).json({ error: err.message || 'Video generation failed to start' });
  }
};
