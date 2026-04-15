// api/bitrix/index.js
// ✅ ProcurementBot v1.1 — Auto-responder for Dmitry
// ✅ Перехватывает ЛС Дмитрию и отвечает автоматически
// ✅ Игнорирует сообщения от самого бота и от Дмитрия

import { TRIGGERS } from '../../src/dictionaries/triggers.js';

// === КОНФИГ ===
const DMITRY_USER_ID = process.env.DMITRY_USER_ID || '1673'; // ID Дмитрия в Битрикс24
const BOT_ID = process.env.BITRIX_BOT_ID || '4341';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // === GET: Health Check ===
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'OK', 
      message: 'ProcurementBot v1.1 alive 🤖',
      mode: 'auto-responder for Dmitry'
    });
  }

  // === POST: События от Битрикс24 ===
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const event = body.event;

    // Логируем тип события для отладки
    console.log(`[EVENT] ${event} | Body keys: ${Object.keys(body).slice(0, 5).join(', ')}...`);

    // Обрабатываем два типа событий:
    // 1. ONIMBOTMESSAGEADD — пишут напрямую боту (старая логика)
    // 2. ONIMMESSAGEADD — пишут в чаты / ЛС (новая логика перехвата)
    if (event === 'ONIMBOTMESSAGEADD') {
      return await handleBotMessage(body, res);
    } 
    else if (event === 'ONIMMESSAGEADD') {
      return await handleChatMessage(body, res);
    }

    // Игнорируем остальные события
    console.log('[SKIP] Unknown event type');
    return res.status(200).json({ status: 'ignored' });

  } catch (error) {
    console.error('[FATAL ERROR]', error.message);
    console.error(error.stack);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// === Обработчик: сообщение напрямую боту (старая логика) ===
async function handleBotMessage(body, res) {
  const { MESSAGE, DIALOG_ID, FROM_USER_ID, FROM_USER_NAME } = parseBitrixBody(body);
  
  console.log(`[BOT MSG] ${FROM_USER_NAME} (${FROM_USER_ID}): "${MESSAGE}"`);
  
  const reply = findReply(MESSAGE);
  if (reply) {
    const result = await sendBitrixMessage(DIALOG_ID.replace('user', ''), reply);
    return res.status(200).json({ status: 'replied', trigger: 'direct_bot', message_id: result.result });
  }
  
  return res.status(200).json({ status: 'no_match' });
}

// === Обработчик: сообщение в чате / ЛС (новая логика перехвата) ===
async function handleChatMessage(body, res) {
  const { MESSAGE, DIALOG_ID, FROM_USER_ID, FROM_USER_NAME, TO_USER_ID } = parseBitrixBody(body, true);
  
  // === ФИЛЬТРЫ: когда НЕ отвечать ===
  
  // 1. Если сообщение от самого бота — игнорируем (защита от бесконечного цикла)
  if (String(FROM_USER_ID) === String(BOT_ID)) {
    console.log('[SKIP] Message from bot itself');
    return res.status(200).json({ status: 'ignored_bot' });
  }
  
  // 2. Если сообщение от Дмитрия — игнорируем (он сам отвечает)
  if (String(FROM_USER_ID) === String(DMITRY_USER_ID)) {
    console.log('[SKIP] Message from Dmitry himself');
    return res.status(200).json({ status: 'ignored_dmitry' });
  }
  
  // 3. Если сообщение НЕ Дмитрию — игнорируем (бот слушает только ЛС Дмитрию)
  if (String(TO_USER_ID) !== String(DMITRY_USER_ID)) {
    console.log(`[SKIP] Message to user ${TO_USER_ID}, not Dmitry (${DMITRY_USER_ID})`);
    return res.status(200).json({ status: 'ignored_wrong_recipient' });
  }

  // === Если прошли фильтры — это сообщение Дмитрию, обрабатываем ===
  console.log(`[INTERCEPT] ${FROM_USER_NAME} → Dmitry: "${MESSAGE}"`);
  
  const reply = findReply(MESSAGE);
  
  if (reply) {
    // Отвечаем в тот же диалог, но от имени бота
    // Формируем DIALOG_ID: user{ID_получателя} = user{ОТПРАВИТЕЛЬ}, чтобы ответ пришёл ему
    const replyDialogId = String(DIALOG_ID).startsWith('user') ? DIALOG_ID : `user${FROM_USER_ID}`;
    
    // Добавляем пометку, что отвечает ассистент
    const prefixedReply = `🤖 <b>Ассистент Дмитрия:</b>\n${reply}`;
    
    console.log(`[REPLY] Sending to ${replyDialogId}: "${prefixedReply.substring(0, 50)}..."`);
    const result = await sendBitrixMessage(replyDialogId.replace('user', ''), prefixedReply);
    
    return res.status(200).json({ 
      status: 'intercepted_and_replied', 
      from: FROM_USER_NAME,
      message_id: result.result 
    });
  }
  
  // Если нет совпадений — молчим (не спамим Дмитрию пересылками, пока не попросит)
  console.log('[NO MATCH] No trigger found, staying silent');
  return res.status(200).json({ status: 'no_match_silent' });
}

// === Парсинг тела запроса от Битрикс24 ===
function parseBitrixBody(body, isChatEvent = false) {
  const getParam = (key) => body[`data[PARAMS][${key}]`];
  const getUser = (key) => body[`data[USER][${key}]`];
  
  const MESSAGE = getParam('MESSAGE') || '';
  const DIALOG_ID = getParam('DIALOG_ID') || '';
  const FROM_USER_ID = getParam('FROM_USER_ID') || '';
  const FROM_USER_NAME = getUser('NAME') || 'Сотрудник';
  
  // Для событий чата добавляем TO_USER_ID (кому адресовано)
  const TO_USER_ID = isChatEvent ? (getParam('TO_USER_ID') || getParam('AUTHOR_ID')) : '';
  
  return { MESSAGE, DIALOG_ID, FROM_USER_ID, FROM_USER_NAME, TO_USER_ID };
}

// === Поиск ответа в словаре ===
function findReply(message) {
  if (!message) return null;
  
  const text = message.toLowerCase().trim();
  
  for (const [triggerName, config] of Object.entries(TRIGGERS)) {
    if (config.keywords.some(kw => text.includes(kw))) {
      console.log(`[MATCH] Trigger "${triggerName}" matched`);
      return config.reply;
    }
  }
  return null;
}

// === Отправка сообщения через Битрикс24 API ===
async function sendBitrixMessage(userId, message) {
  const webhook = process.env.BITRIX_WEBHOOK_URL;
  if (!webhook) throw new Error('BITRIX_WEBHOOK_URL not set');

  const url = `${webhook.replace(/\/$/, '')}/im.message.add.json`;
  const params = {
    USER_ID: parseInt(userId, 10),
    MESSAGE: message,
    MESSAGE_TYPE: 'P',
    FROM_BOT_ID: BOT_ID  // Отправляем от имени бота (не Дмитрия)
  };

  console.log(`[SEND] POST ${url} | USER_ID=${params.USER_ID} | FROM_BOT_ID=${BOT_ID}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Bitrix API error ${response.status}: ${text}`);

  const result = JSON.parse(text);
  if (result.error) throw new Error(`Bitrix error: ${result.error} - ${result.error_description}`);
  
  return result;
}