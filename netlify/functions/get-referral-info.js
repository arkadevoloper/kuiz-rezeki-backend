// =====================================================================
// netlify/functions/get-referral-info.js  ->  ENDPOINT: /api/get-referral-info
// =====================================================================

const { supabase, jsonResponse, handleOptionsPreflight, getUserFromInitData } = require('./_shared');

exports.handler = async (event) => {
  const preflight = handleOptionsPreflight(event);
  if (preflight) return preflight;
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body); } catch { return jsonResponse(400, { error: 'Body tidak valid' }); }

  const { initData } = body;
  if (!initData) return jsonResponse(400, { error: 'initData wajib dikirim' });

  const result = await getUserFromInitData(initData);
  if (result.error === 'INVALID_INIT_DATA') return jsonResponse(401, { error: 'Data tidak valid' });
  if (result.error === 'USER_NOT_FOUND') return jsonResponse(404, { error: 'User belum terdaftar' });
  if (result.error === 'BANNED') return jsonResponse(403, { error: 'Akun ini diblokir' });
  if (result.error) return jsonResponse(500, { error: 'Gagal ambil user', detail: result.detail });

  const user = result.user;

  const { data: referredUsers, error: refError } = await supabase
    .from('referrals')
    .select('bonus_amount, created_at, referred_id, users!referrals_referred_id_fkey(first_name, username)')
    .eq('referrer_id', user.id)
    .order('created_at', { ascending: false });

  if (refError) return jsonResponse(500, { error: 'Gagal ambil data referral', detail: refError.message });

  const totalBonus = (referredUsers || []).reduce((sum, r) => sum + r.bonus_amount, 0);

  return jsonResponse(200, {
    referralCode: user.referral_code,
    totalReferred: (referredUsers || []).length,
    totalBonus,
    referredUsers: referredUsers || [],
  });
};
