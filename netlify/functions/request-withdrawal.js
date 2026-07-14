// =====================================================================
// netlify/functions/request-withdrawal.js  ->  ENDPOINT: /api/request-withdrawal
// =====================================================================

const { supabase, jsonResponse, handleOptionsPreflight, getUserFromInitData } = require('./_shared');

const MIN_WITHDRAWAL_AMOUNT = 500; // minimal koin buat bisa ditarik, boleh diubah

exports.handler = async (event) => {
  const preflight = handleOptionsPreflight(event);
  if (preflight) return preflight;
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body); } catch { return jsonResponse(400, { error: 'Body tidak valid' }); }

  const { initData, amount, method, accountInfo } = body;
  if (!initData  !amount  !method || !accountInfo) {
    return jsonResponse(400, { error: 'initData, amount, method, dan accountInfo wajib dikirim' });
  }

  const result = await getUserFromInitData(initData);
  if (result.error === 'INVALID_INIT_DATA') return jsonResponse(401, { error: 'Data tidak valid' });
  if (result.error === 'USER_NOT_FOUND') return jsonResponse(404, { error: 'User belum terdaftar' });
  if (result.error === 'BANNED') return jsonResponse(403, { error: 'Akun ini diblokir' });
  if (result.error) return jsonResponse(500, { error: 'Gagal ambil user', detail: result.detail });

  const user = result.user;

  if (amount < MIN_WITHDRAWAL_AMOUNT) {
    return jsonResponse(400, { error: Minimal penarikan adalah ${MIN_WITHDRAWAL_AMOUNT} koin });
  }
  if (amount > user.balance) {
    return jsonResponse(400, { error: 'Saldo kamu tidak cukup untuk penarikan ini' });
  }

  // Kurangi saldo langsung saat pengajuan dibuat, biar user gak bisa ajukan dobel
  // melebihi saldo yang sebenarnya dia punya (saldo baru dikembalikan kalau ditolak admin)
  const newBalance = user.balance - amount;

  const { data: withdrawal, error: insertError } = await supabase
    .from('withdrawals')
    .insert({ user_id: user.id, amount, method, account_info: accountInfo, status: 'pending' })
    .select().single();

  if (insertError) return jsonResponse(500, { error: 'Gagal membuat pengajuan', detail: insertError.message });

  await supabase.from('reward_ledger').insert({
    user_id: user.id, source: 'withdrawal', amount: -amount,
    description: Pengajuan penarikan #${withdrawal.id},
  });

  const { error: updateError } = await supabase.from('users').update({ balance: newBalance }).eq('id', user.id);
  if (updateError) return jsonResponse(500, { error: 'Gagal update saldo', detail: updateError.message });

  return jsonResponse(200, { withdrawal, newBalance });
};
