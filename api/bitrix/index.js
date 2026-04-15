// api/bitrix/index.js — DEBUG: покажи всё, что пришло
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'OK', message: 'Bot alive 🤖' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // === ЛОГИРУЕМ ВСЁ ПОДРОБНО ===
    console.log('=== RAW BODY ===');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('================');

    const body = req.body || {};

    // Проверяем, есть ли data и какого оно типа
    if (!body.data) {
      console.log('[DEBUG] body.data is MISSING');
    } else if (typeof body.data === 'string') {
      console.log('[DEBUG] body.data is STRING, trying to parse...');
      try {
        body.data = JSON.parse(body.data);
      } catch (e) {
        console.log('[DEBUG] Failed to parse data as JSON');
      }
    }

    // Пробуем разные варианты извлечения полей
    const data = body.data || body.params || {};
    const MESSAGE = data.MESSAGE || data.message || data.text || '';
    const DIALOG_ID = data.DIALOG_ID || data.dialog_id || data.chat_id || '';
    const FROM_USER_ID = data.FROM_USER_ID || data.user_id || '';
    const FROM_USER_NAME = data.FROM_USER_NAME || data.user_name || 'Unknown';

    console.log(`[PARSED] MESSAGE: "${MESSAGE}", DIALOG_ID: "${DIALOG_ID}", USER: ${FROM_USER_NAME} (${FROM_USER_ID})`);

    // Если всё ещё пусто — отвечаем и выходим
    if (!MESSAGE || !DIALOG_ID) {
      console.log('[WARN] Still empty after parsing — check Bitrix payload format');
      return res.status(200).json({ 
        status: 'empty', 
        debug: { bodyKeys: Object.keys(body), dataKeys: Object.keys(data) } 
      });
    }

    // === Простая логика ответов ===
    const text = MESSAGE.toLowerCase();
    let reply = null;

    if (text.includes('привет')) {
      reply = '👋 Привет! Я бот Дмитрия. Спроси о статусе заказа.';
    } else if (text.includes('событие')) {
      reply = 'ℹ️ Объект "Событие": статус — В пути.';
    }

    if (reply) {
      console.log('[REPLY] Sending:', reply);
      const result = await sendBitrixMessage(DIALOG_ID, reply);
      console.log('[BITRIX RESULT]', result);
      return res.status(200).json({ status: 'replied' });
    }

    return res.status(200).json({ status: 'no_match' });

  } catch (error) {
    console.error('[FATAL]', error.message, error.stack);
    return res.status(500).json({ error: error.message });
  }
}

async function sendBitrixMessage(dialogId, message) {
  const webhook = process.env.BITRIX_WEBHOOK_URL;
  const botId = process.env.BITRIX_BOT_ID || '4341';

  if (!webhook) throw new Error('BITRIX_WEBHOOK_URL not set');

  const url = `${webhook.replace(/\/$/, '')}/im.message.add.json`;
  const params = new URLSearchParams({
    DIALOG_ID: dialogId,
    MESSAGE: message,
    FROM_BOT_ID: botId
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  const text = await response.text();
  return JSON.parse(text);
}