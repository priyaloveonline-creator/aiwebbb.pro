// /api/video-status.js
// Node function — polls an OpenRouter video generation job by id.
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id query param is required' });

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Server is missing OPENROUTER_API_KEY' });

    const upstream = await fetch(`https://openrouter.ai/api/v1/videos/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.error?.message || `Status check error ${upstream.status}` });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error('video-status error:', err);
    res.status(500).json({ error: err.message || 'Status check failed' });
  }
};
