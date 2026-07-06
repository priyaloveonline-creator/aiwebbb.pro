// /api/razorpay/verify.js
// Verifies the payment signature server-side (never trust the browser),
// then applies credits to the user's profile using the Supabase
// service role key. RAZORPAY_KEY_SECRET and SUPABASE_SERVICE_ROLE_KEY
// never leave this file.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment fields' });
    }

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('razorpay_order_id', razorpay_order_id)
      .eq('status', 'pending')
      .single();

    if (fetchErr || !order) {
      return res.status(404).json({ error: 'Order not found or already processed' });
    }

    const { error: rpcErr } = await supabase.rpc('apply_credits', {
      p_user_id: order.user_id,
      p_plan: order.plan,
      p_credits: order.credits,
    });
    if (rpcErr) {
      console.error('apply_credits error:', rpcErr);
      return res.status(500).json({ error: 'Failed to apply credits' });
    }

    await supabase
      .from('orders')
      .update({ status: 'paid', razorpay_payment_id, updated_at: new Date().toISOString() })
      .eq('id', order.id);

    res.status(200).json({ success: true, plan: order.plan, credits: order.credits });
  } catch (err) {
    console.error('verify error:', err);
    res.status(500).json({ error: err.message || 'Verification failed' });
  }
};
