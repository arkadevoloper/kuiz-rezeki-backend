// =====================================================================
// netlify/functions/_shared.js
// Kode yang DIPAKAI BERSAMA oleh semua fungsi backend lain.
// Ini BUKAN endpoint sendiri, cuma "gudang alat" internal.
// =====================================================================

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObj),
  };
}

function handleOptionsPreflight(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  return null;
}

function verifyTelegramInitData(initData) {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');

  const dataCheckArr = [];
  for (const [key, value] of [...urlParams.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    dataCheckArr.push(${key}=${value});
  }
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const userJson = urlParams.get('user');
  if (!userJson) return null;

  return {
    user: JSON.parse(userJson),
    startParam: urlParams.get('start_param') || null,
  };
}

async function getUserFromInitData(initData) {
  const verified = verifyTelegramInitData(initData);
  if (!verified) return { error: 'INVALID_INIT_DATA' };

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', verified.user.id)
    .maybeSingle();

  if (error) return { error: 'DB_ERROR', detail: error.message };
  if (!user) return { error: 'USER_NOT_FOUND' };
  if (user.is_banned) return { error: 'BANNED' };

  return { user };
}

function needsDailyReset(dailyResetDate) {
  const today = new Date().toISOString().slice(0, 10);
  return dailyResetDate !== today;
}

function generateReferralCode() {
  return 'RF' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

module.exports = {
  supabase,
  jsonResponse,
  handleOptionsPreflight,
  verifyTelegramInitData,
  getUserFromInitData,
  needsDailyReset,
  generateReferralCode,
};
