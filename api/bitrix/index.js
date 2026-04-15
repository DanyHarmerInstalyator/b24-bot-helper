// api/bitrix/index.js
// ✅ Исправлено: используем правильный метод для ботов

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

  // === GET: health check ===
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'OK', message: 'ProcurementBot alive 🤖' });
  }

  // === POST: событие от Битрикс24 ===
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    
    // === Парсинг формата Битрикс24 (ключи с квадратными скобками) ===
    const getMessage = (key) => body[`data[PARAMS][${key}]`];
    const getUser = (key) => body[`data[USER][${key}]`];

    const MESSAGE = getMessage('MESSAGE') || '';
    const DIALOG_ID_RAW = getMessage('DIALOG_ID') || '';
    const FROM_USER_ID = getMessage('FROM_USER_ID') || '';
    const FROM_USER_NAME = getUser('NAME') || 'Сотрудник';
    
    // Извлекаем числовой ID пользователя из DIALOG_ID (формат: user1673)
    const TO_USER_ID = DIALOG_ID_RAW.toString().replace('user', '');
    
    console.log(`[MSG] ${FROM_USER_NAME} (${FROM_USER_ID}): "${MESSAGE}"`);
    console.log(`[REPLY_TO] user${TO_USER_ID}`);

    // === Логика словарей ===
    const text = MESSAGE.toLowerCase().trim();
    let reply = null;

    if (text.includes('привет') || text.includes('здравствуй')) {
      reply = '👋 Здравствуйте! Я ассистент Дмитрия Бралковского по закупкам.\nСпросите о статусе объекта, поставке или заказе.';
    } 
    else if (text.includes('событие')) {
      reply = 'ℹ️ По объекту "Событие":\n📦 Статус: В пути (ожидаемая поставка 18.04)\n👤 Ответственный: Иванов А.\n📋 Заказ №4521';
    }
    else if (text.includes('статус') || text.includes('где заказ')) {
      reply = '🔍 Для проверки статуса уточните, пожалуйста, номер заказа или название объекта.';
    }
    else if (text.includes('приехало') || text.includes('доставк')) {
      reply = '🚚 Информация о прибытии:\nПроверьте накладные в сделке или уточните у логиста.';
    }

    // Если нашли ответ — отправляем
    if (reply) {
      console.log('[REPLY] Sending auto-response');
      const result = await sendBitrixMessage(TO_USER_ID, reply);
      console.log('[BITRIX RESULT]', result);
      return res.status(200).json({ status: 'replied', reply });
    }

    // === Нет совпадений — пересылаем Дмитрию ===
    const dmitryId = process.env.DMITRY_USER_ID || '1';
    if (String(FROM_USER_ID) !== String(dmitryId)) {
      const forwardMsg = `❓ <b>Вопрос от сотрудника:</b>\n🗣 ${FROM_USER_NAME}:\n<i>"${MESSAGE}"</i>\n\n🤖 Бот не нашёл ответа.`;
      await sendBitrixMessage(dmitryId, forwardMsg);
      console.log(`[FORWARD] Sent to Dmitry (ID: ${dmitryId})`);
    }

    return res.status(200).json({ status: 'forwarded' });

  } catch (error) {
    console.error('[FATAL]', error.message);
    console.error(error.stack);
    return res.status(500).json({ error: error.message });
  }
}

// === ✅ ОТПРАВКА через im.message.add с USER_ID ===
async function sendBitrixMessage(userId, message) {
  const webhook = process.env.BITRIX_WEBHOOK_URL;
  
  if (!webhook) {
    throw new Error('BITRIX_WEBHOOK_URL not set in Vercel Env Variables');
  }

  // Метод im.message.add требует USER_ID (числовой ID получателя)
  const url = `${webhook.replace(/\/$/, '')}/im.message.add.json`;
  
  const params = {
    USER_ID: parseInt(userId),  // Числовой ID пользователя
    MESSAGE: message,            // Текст сообщения
    MESSAGE_TYPE: 'P'           // P - личное сообщение (private)
  };

  console.log(`[SEND] POST ${url} to USER_ID: ${userId}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });

  const text = await response.text();
  console.log(`[SEND] Response ${response.status}: ${text}`);
  
  if (!response.ok) {
    throw new Error(`Bitrix API error ${response.status}: ${text}`);
  }

  const result = JSON.parse(text);
  
  // Проверяем наличие ошибки в ответе
  if (result.error) {
    throw new Error(`Bitrix API error: ${result.error} - ${result.error_description}`);
  }
  
  return result;
}