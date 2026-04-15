// api/bitrix/index.js
// ✅ Чистый код для Vercel: без dotenv, с native fetch, с обработкой ошибок

export default async function handler(req, res) {
  // CORS заголовки
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // === 1. GET: проверка живости ===
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'OK', 
      message: 'ProcurementBot is alive 🤖',
      timestamp: new Date().toISOString()
    });
  }

  // === 2. POST: обработка событий от Битрикс24 ===
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    console.log('[INCOMING]', JSON.stringify({ 
      event: body.event, 
      dialog: body.data?.DIALOG_ID 
    }));

    // Проверяем, что это сообщение боту
    if (body.event !== 'ONIMBOTMESSAGEADD') {
      console.log('[SKIP] Wrong event type:', body.event);
      return res.status(200).json({ status: 'ignored_event' });
    }

    // Распаковка данных сообщения
    const { MESSAGE, DIALOG_ID, FROM_USER_ID, FROM_USER_NAME } = body.data || {};
    
    if (!MESSAGE || !DIALOG_ID) {
      console.warn('[WARN] Empty message or dialog_id');
      return res.status(200).json({ status: 'empty_payload' });
    }

    console.log(`[MSG] ${FROM_USER_NAME} (${FROM_USER_ID}): "${MESSAGE}"`);

    // === ЛОГИКА СЛОВАРЕЙ (упрощённая для теста) ===
    const text = MESSAGE.toLowerCase().trim();
    let reply = null;

    // Простой поиск по ключевым словам
    if (text.includes('привет') || text.includes('здравствуй')) {
      reply = '👋 Здравствуйте! Я ассистент Дмитрия Бралковского.\nСпросите о статусе объекта, поставке или заказе.';
    } 
    else if (text.includes('событие')) {
      reply = 'ℹ️ По объекту "Событие":\n📦 Статус: В пути (ожидаемая поставка 18.04)\n👤 Ответственный: Иванов А.\n📋 Заказ №4521';
    }
    else if (text.includes('статус') || text.includes('где заказ')) {
      reply = '🔍 Для проверки статуса уточните номер заказа или название объекта.';
    }
    else if (text.includes('приехало') || text.includes('доставк')) {
      reply = '🚚 Информация о прибытии:\nПроверьте накладные в сделке или уточните у логиста.';
    }

    // Если нашли ответ в "словаре" — отправляем
    if (reply) {
      await sendBitrixMessage(DIALOG_ID, reply);
      console.log('[REPLY] Sent auto-response');
      return res.status(200).json({ status: 'replied', reply });
    }

    // === Если нет совпадений — пересылаем Дмитрию ===
    const dmitryId = process.env.DMITRY_USER_ID || '1';
    if (String(FROM_USER_ID) !== String(dmitryId)) {
      const forwardMsg = `❓ <b>Вопрос от сотрудника:</b>\n🗣 ${FROM_USER_NAME}:\n<i>"${MESSAGE}"</i>\n\n🤖 Бот не нашёл ответа.`;
      await sendBitrixMessage(`user${dmitryId}`, forwardMsg);
      console.log(`[FORWARD] Sent to Dmitry (ID: ${dmitryId})`);
    }

    return res.status(200).json({ status: 'forwarded' });

  } catch (error) {
    console.error('[FATAL]', error.message);
    console.error(error.stack);
    return res.status(500).json({ 
      error: 'Function crashed', 
      details: error.message 
    });
  }
}

// === Вспомогательная функция отправки сообщения ===
async function sendBitrixMessage(dialogId, message) {
  const webhook = process.env.BITRIX_WEBHOOK_URL;
  const botId = process.env.BITRIX_BOT_ID || '4341';

  if (!webhook) {
    throw new Error('BITRIX_WEBHOOK_URL not set in Vercel Env Variables');
  }

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

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Bitrix API error: ${response.status} ${errText}`);
  }

  return await response.json();
}