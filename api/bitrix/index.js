// api/bitrix/index.js
// ✅ ProcurementBot v1.3 — Intercepts ALL private messages to Dmitry

import { TRIGGERS } from '../../src/dictionaries/triggers.js';

// === CONFIG ===
const DMITRY_USER_ID = process.env.DMITRY_USER_ID || '1673';
const BOT_ID = process.env.BITRIX_BOT_ID || '4341';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // === GET: Health Check ===
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'OK', 
      message: 'ProcurementBot v1.3 — intercepts private messages to Dmitry 🤖',
      config: {
        dmitry_id: DMITRY_USER_ID,
        bot_id: BOT_ID
      }
    });
  }

  // === POST: Events from Bitrix24 ===
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Логируем ВСЕ входящие данные для отладки
    console.log('[FULL BODY]', JSON.stringify(req.body, null, 2));
    
    const body = req.body || {};
    const event = body.event;

    console.log(`[EVENT RECEIVED] ${event}`);

    // Обрабатываем оба типа событий
    if (event === 'ONIMBOTMESSAGEADD') {
      return await handleBotDirectMessage(body, res);
    } 
    else if (event === 'ONIMESSAGEADD') {
      return await handlePrivateMessage(body, res);
    }
    else if (event === 'ONMESSAGEADD') {
      return await handlePrivateMessage(body, res);
    }

    console.log('[SKIP] Unknown event type:', event);
    return res.status(200).json({ status: 'ignored' });

  } catch (error) {
    console.error('[FATAL ERROR]', error.message);
    console.error(error.stack);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// === Handle direct bot messages ===
async function handleBotDirectMessage(body, res) {
  const { message, fromUserId, fromUserName } = parseBitrixMessage(body);
  
  console.log(`[BOT DIRECT] From ${fromUserName} (${fromUserId}): "${message}"`);
  
  const reply = findReply(message);
  if (reply) {
    const result = await sendMessageToUser(fromUserId, `🤖 ${reply}`);
    return res.status(200).json({ status: 'replied', message_id: result.result });
  }
  
  return res.status(200).json({ status: 'no_match' });
}

// === Handle private messages (this is what you need!) ===
async function handlePrivateMessage(body, res) {
  // Парсим данные из события ONIMESSAGEADD
  // Структура: data[PARAMS][DIALOG_ID], data[PARAMS][MESSAGE], data[PARAMS][FROM_USER_ID]
  
  const params = body['data[PARAMS]'] || {};
  const user = body['data[USER]'] || {};
  
  const message = params.MESSAGE || '';
  const dialogId = params.DIALOG_ID || '';
  const fromUserId = params.FROM_USER_ID || '';
  const toUserId = extractUserIdFromDialog(dialogId);
  const fromUserName = user.NAME || 'Пользователь';
  
  console.log(`[PRIVATE MSG] From: ${fromUserName} (${fromUserId}) → To: ${toUserId}`);
  console.log(`[PRIVATE MSG] Content: "${message}"`);
  console.log(`[PRIVATE MSG] Dialog: ${dialogId}`);
  
  // === FILTERS ===
  
  // Ignore bot's own messages
  if (String(fromUserId) === String(BOT_ID)) {
    console.log('[SKIP] Message from bot itself');
    return res.status(200).json({ status: 'ignored_bot' });
  }
  
  // Ignore Dmitry's own messages (he doesn't need bot to answer himself)
  if (String(fromUserId) === String(DMITRY_USER_ID)) {
    console.log('[SKIP] Message from Dmitry himself');
    return res.status(200).json({ status: 'ignored_dmitry' });
  }
  
  // Check if this message is addressed TO Dmitry
  const isMessageToDmitry = String(toUserId) === String(DMITRY_USER_ID);
  
  if (!isMessageToDmitry) {
    console.log(`[SKIP] Message addressed to ${toUserId}, not Dmitry (${DMITRY_USER_ID})`);
    return res.status(200).json({ status: 'ignored_wrong_recipient' });
  }
  
  // === INTERCEPTED! Message to Dmitry ===
  console.log(`🎯 [INTERCEPTED] ${fromUserName} → Dmitry: "${message}"`);
  
  // Find automatic reply
  const reply = findReply(message);
  
  if (reply) {
    // Send reply from bot to the original sender
    const botReply = `🤖 <b>Ассистент Дмитрия по закупкам</b><br><br>${reply}`;
    
    console.log(`💬 [AUTO-REPLY] Sending to ${fromUserName} (${fromUserId})`);
    const result = await sendMessageToUser(fromUserId, botReply);
    
    return res.status(200).json({ 
      status: 'auto_replied', 
      to: fromUserName,
      message_id: result.result 
    });
  }
  
  // No match - stay silent
  console.log('🔇 [NO MATCH] No trigger found, staying silent');
  return res.status(200).json({ status: 'no_match_silent' });
}

// === Extract user ID from DIALOG_ID (format: user1673) ===
function extractUserIdFromDialog(dialogId) {
  if (!dialogId) return '';
  const match = dialogId.toString().match(/user(\d+)/);
  return match ? match[1] : '';
}

// === Parse Bitrix24 webhook body ===
function parseBitrixMessage(body, isPrivateMessage = false) {
  const getParam = (key) => body[`data[PARAMS][${key}]`];
  const getUser = (key) => body[`data[USER][${key}]`];
  
  const message = getParam('MESSAGE') || '';
  const dialogId = getParam('DIALOG_ID') || '';
  const fromUserId = getParam('FROM_USER_ID') || '';
  const fromUserName = getUser('NAME') || 'Сотрудник';
  
  let toUserId = '';
  if (isPrivateMessage) {
    const match = dialogId.match(/user(\d+)/);
    toUserId = match ? match[1] : '';
  }
  
  return { message, dialogId, fromUserId, fromUserName, toUserId };
}

// === Find reply in triggers dictionary ===
function findReply(message) {
  if (!message) return null;
  
  const text = message.toLowerCase().trim();
  
  for (const [triggerName, config] of Object.entries(TRIGGERS)) {
    if (config.keywords.some(keyword => text.includes(keyword))) {
      console.log(`✅ [TRIGGER MATCH] "${triggerName}" — replying`);
      return config.reply;
    }
  }
  return null;
}

// === Send message to user via Bitrix24 API ===
async function sendMessageToUser(userId, message) {
  const webhook = process.env.BITRIX_WEBHOOK_URL;
  if (!webhook) {
    throw new Error('BITRIX_WEBHOOK_URL environment variable is not set');
  }

  const url = `${webhook.replace(/\/$/, '')}/im.message.add.json`;
  
  const params = {
    USER_ID: parseInt(userId, 10),
    MESSAGE: message,
    MESSAGE_TYPE: 'P',  // Private message
    SYSTEM: 'N'         // Regular message
  };

  console.log(`📤 [API CALL] Sending to user ${userId}`);
  console.log(`📤 [API CALL] URL: ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  const text = await response.text();
  console.log(`📥 [API RESPONSE] Status: ${response.status}, Body: ${text}`);
  
  if (!response.ok) {
    throw new Error(`Bitrix API error ${response.status}: ${text}`);
  }

  const result = JSON.parse(text);
  
  if (result.error) {
    throw new Error(`Bitrix error: ${result.error} - ${result.error_description}`);
  }
  
  console.log(`✅ [API SUCCESS] Message sent, ID: ${result.result}`);
  return result;
}