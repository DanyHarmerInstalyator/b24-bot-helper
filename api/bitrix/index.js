// api/bitrix/index.js
// ✅ ProcurementBot v1.0 — Production Ready
// ✅ Парсит вебхуки Битрикс24 (ключи с [])
// ✅ Отвечает через im.message.add + USER_ID
// ✅ Словари вынесены в src/dictionaries/triggers.js

import { TRIGGERS } from '../src/dictionaries/triggers.js';

export default async function handler(req, res) {
  // CORS заголовки для совместимости
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // === 1. GET: Health Check (проверка живости) ===
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'OK', 
      message: 'ProcurementBot is alive 🤖',
      timestamp: new Date().toISOString()
    });
  }

  // === 2. POST: Обработка событий от Битрикс24 ===
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    
    // === Парсинг формата Битрикс24 ===
    // Битрикс шлёт ключи вида "data[PARAMS][MESSAGE]", а не вложенный JSON
    const getMessage = (key) => body[`data[PARAMS][${key}]`];
    const getUser = (key) => body[`data[USER][${key}]`];

    const MESSAGE = getMessage('MESSAGE') || '';
    const DIALOG_ID_RAW = getMessage('DIALOG_ID') || '';
    const FROM_USER_ID = getMessage('FROM_USER_ID') || '';
    const FROM_USER_NAME = getUser('NAME') || 'Сотрудник';
    
    // Извлекаем чистый числовой ID для отправки ответа
    const TO_USER_ID = String(DIALOG_ID_RAW).replace(/^user/, '');
    
    console.log(`[MSG] ${FROM_USER_NAME} (${FROM_USER_ID}): "${MESSAGE}"`);
    console.log(`[REPLY_TO] USER_ID: ${TO_USER_ID}`);

    // === Логика обработки: поиск по словарю ===
    const text = MESSAGE.toLowerCase().trim();
    let reply = null;
    let matchedTrigger = null;

    // Перебираем все триггеры из внешнего файла
    for (const [triggerName, config] of Object.entries(TRIGGERS)) {
      // Проверяем, есть ли хотя бы одно ключевое слово в сообщении
      if (config.keywords.some(kw => text.includes(kw))) {
        reply = config.reply;
        matchedTrigger = triggerName;
        console.log(`[MATCH] Trigger "${triggerName}" matched via keyword`);
        break; // Прерываем после первого совпадения
      }
    }

    // === Если нашли ответ в словаре — отправляем ===
    if (reply) {
      console.log('[REPLY] Sending auto-response');
      const result = await sendBitrixMessage(TO_USER_ID, reply);
      console.log('[BITRIX RESULT]', result);
      return res.status(200).json({ 
        status: 'replied', 
        trigger: matchedTrigger,
        message_id: result.result 
      });
    }

    // === Если нет совпадений — пересылаем Дмитрию (эскалация) ===
    const dmitryId = process.env.DMITRY_USER_ID || '1';
    
    // Не пересылаем, если вопрос задал сам Дмитрий
    if (String(FROM_USER_ID) !== String(dmitryId)) {
      const forwardMsg = `❓ <b>Вопрос от сотрудника (бот не понял):</b>\n\n🗣 <b>${FROM_USER_NAME}</b> (ID: ${FROM_USER_ID}):\n<i>"${MESSAGE}"</i>\n\n🤖 <i>Бот не нашёл ответа в базе. Требуется ваше внимание.</i>`;
      
      console.log(`[FORWARD] Sending to Dmitry (ID: ${dmitryId})`);
      await sendBitrixMessage(dmitryId, forwardMsg);
      
      // Опционально: можно ответить пользователю, что вопрос принят
      // await sendBitrixMessage(TO_USER_ID, '✅ Вопрос принят, Дмитрий скоро ответит.');
    }

    return res.status(200).json({ status: 'forwarded' });

  } catch (error) {
    console.error('[FATAL ERROR]', error.message);
    console.error(error.stack);
    
    // В продакшене не отдаём стектрейс пользователю
    return res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// === Функция отправки сообщения через Битрикс24 API ===
async function sendBitrixMessage(userId, message) {
  const webhook = process.env.BITRIX_WEBHOOK_URL;
  
  // Проверка наличия вебхука
  if (!webhook) {
    throw new Error('BITRIX_WEBHOOK_URL not set in Vercel Env Variables');
  }

  // Формируем URL метода im.message.add
  const url = `${webhook.replace(/\/$/, '')}/im.message.add.json`;
  
  // Параметры запроса (Битрикс принимает JSON)
  const params = {
    USER_ID: parseInt(userId, 10),  // Числовой ID получателя (обязательно число!)
    MESSAGE: message,               // Текст сообщения (поддерживает HTML: <b>, <i>, <br>)
    MESSAGE_TYPE: 'P'               // P = Private (личное сообщение)
  };

  console.log(`[SEND] POST ${url}`);
  console.log(`[SEND] Payload: USER_ID=${params.USER_ID}, MESSAGE_LEN=${message.length}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });

  const text = await response.text();
  console.log(`[SEND] Response ${response.status}: ${text.substring(0, 200)}...`);
  
  // Обработка ошибок HTTP
  if (!response.ok) {
    throw new Error(`Bitrix API error ${response.status}: ${text}`);
  }

  // Парсинг JSON ответа
  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse Bitrix response: ${text}`);
  }
  
  // Проверка на логические ошибки в ответе Битрикса
  if (result.error) {
    throw new Error(`Bitrix API error: ${result.error} - ${result.error_description}`);
  }
  
  return result;
}