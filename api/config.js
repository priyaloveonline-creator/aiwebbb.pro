// /api/config.js
// Returns PUBLIC configuration only. Never put secret keys here.
// SUPABASE_ANON_KEY and RAZORPAY_KEY_ID are designed by their providers
// to be exposed client-side — Supabase Row Level Security and Razorpay's
// signature verification protect you, not the secrecy of these two values.

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    supabaseUrl:     process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    razorpayKeyId:   process.env.RAZORPAY_KEY_ID || '',
    appUrl:          process.env.APP_URL || '',
  });
};
