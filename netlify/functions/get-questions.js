// =====================================================================
// netlify/functions/get-questions.js  ->  ENDPOINT: /api/get-questions
// =====================================================================

const { supabase, jsonResponse, handleOptionsPreflight, getUserFromInitData } = require('./_shared');

const DEFAULT_DAILY_QUOTA = 30; // sesuai plan free di brief
const MAX_QUESTIONS_PER_SESSION = 5;

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
  if (result.error === 'USER_NOT_FOUND') return jsonResponse(404, { error: 'User belum terdaftar, panggil /api/auth dulu' });
  if (result.error === 'BANNED') return jsonResponse(403, { error: 'Akun ini diblokir' });
  if (result.error) return jsonResponse(500, { error: 'Gagal ambil user', detail: result.detail });

  const user = result.user;

  let dailyQuota = DEFAULT_DAILY_QUOTA;
  const membershipActive = user.membership_expires_at && new Date(user.membership_expires_at) > new Date();

  let allowPremium = false;
  if (membershipActive && user.membership_tier !== 'free') {
    const { data: plan } = await supabase
      .from('membership_plans')
      .select('extra_daily_quota, unlocks_premium_quiz')
      .eq('name', user.membership_tier).maybeSingle();
    if (plan) {
      dailyQuota += plan.extra_daily_quota;
      allowPremium = !!plan.unlocks_premium_quiz;
    }
  }

  const remainingQuota = dailyQuota - user.daily_quiz_count;
  if (remainingQuota <= 0) {
    return jsonResponse(200, { questions: [], remainingQuota: 0, message: 'Kuota harian sudah habis, coba lagi besok' });
  }

  const howMany = Math.min(MAX_QUESTIONS_PER_SESSION, remainingQuota);

  let query = supabase
    .from('quiz_questions')
    .select('id, question_text, options, base_reward, is_premium')
    .eq('is_active', true)
    .limit(howMany);

  if (!allowPremium) query = query.eq('is_premium', false);

  const { data: questions, error: qError } = await query;
  if (qError) return jsonResponse(500, { error: 'Gagal ambil soal', detail: qError.message });

  return jsonResponse(200, { questions, remainingQuota });
};
