// /api/razorpay/create-order.js
// Node serverless function. Creates a Razorpay order and a matching
// "pending" row in Supabase (via service role, bypasses RLS safely
// because this code runs only on the server).
const Razorpay = require('razorpay');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { amount, currency, plan, credits, userId, userEmail, userName } = req.body || {};

    if (!amount || !plan || !credits || !userId) {
      return res.status(400).json({ error: 'amount, plan, credits and userId are required' });
    }
    if (!['pro', 'plus'].includes(plan)) {
      return res.status(400).json({ error: 'plan must be "pro" or "plus"' });
    }

    const rp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // Razorpay expects the smallest currency unit (paise for INR, cents for USD)
    const cur = (currency || 'INR').toUpperCase();
    const order = await rp.orders.create({
      amount: Math.round(amount * 100),
      currency: cur,
      receipt: `aiwebbb_${String(userId).slice(0, 8)}_${Date.now()}`,
      notes: { userId, plan, credits: String(credits) },
    });

    // Record a pending order so /api/razorpay/verify has something to confirm
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from('orders').insert({
      user_id: userId,
      plan,
      currency: cur.toLowerCase(),
      amount: order.amount,
      credits,
      razorpay_order_id: order.id,
      status: 'pending',
    });

    res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      userEmail: userEmail || '',
      userName: userName || '',
    });
  } catch (err) {
    console.error('create-order error:', err);
    res.status(500).json({ error: err.message || 'Failed to create order' });
  }
};
