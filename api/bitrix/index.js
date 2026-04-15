// api/bitrix/index.js
// ✅ ProcurementBot v1.2 — Intercepts messages to Dmitry
// ✅ Bot answers automatically when someone writes to Dmitry

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
      message: 'ProcurementBot v1.2 — intercepts messages to Dmitry 🤖',
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
    const body = req.body || {};
    const event = body.event;

    console.log(`[EVENT] ${event}`);

    // Handle ONIMBOTMESSAGEADD (direct messages to bot)
    if (event === 'ONIMBOTMESSAGEADD') {
      return await handleBotMessage(body, res);
    } 
    // Handle ONIMMESSAGEADD (any chat/private message)
    else if (event === 'ONIMMESSAGEADD') {
      return await handlePrivateMessage(body, res);
    }

    console.log('[SKIP] Unknown event type');
    return res.status(200).json({ status: 'ignored' });

  } catch (error) {
    console.error('[FATAL ERROR]', error.message);
    console.error(error.stack);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// === Handle direct messages to bot (old logic) ===
async function handleBotMessage(body, res) {
  const { message, fromUserId, fromUserName } = parseBitrixMessage(body);
  
  console.log(`[BOT DIRECT] ${fromUserName} (${fromUserId}): "${message}"`);
  
  const reply = findReply(message);
  if (reply) {
    const result = await sendMessageToUser(fromUserId, reply);
    return res.status(200).json({ status: 'replied', message_id: result.result });
  }
  
  return res.status(200).json({ status: 'no_match' });
}

// === Handle private messages (intercept messages to Dmitry) ===
async function handlePrivateMessage(body, res) {
  const { message, fromUserId, fromUserName, toUserId, dialogId } = parseBitrixMessage(body, true);
  
  // === FILTERS: when NOT to respond ===
  
  // 1. Ignore messages from bot itself (prevent infinite loop)
  if (String(fromUserId) === String(BOT_ID)) {
    console.log('[SKIP] Message from bot itself');
    return res.status(200).json({ status: 'ignored_bot' });
  }
  
  // 2. Ignore messages from Dmitry (he can speak without bot interference)
  if (String(fromUserId) === String(DMITRY_USER_ID)) {
    console.log('[SKIP] Message from Dmitry himself');
    return res.status(200).json({ status: 'ignored_dmitry' });
  }
  
  // 3. Check if this message is addressed TO DMITRY
  const isMessageToDmitry = String(toUserId) === String(DMITRY_USER_ID);
  
  if (!isMessageToDmitry) {
    console.log(`[SKIP] Message to user ${toUserId}, not Dmitry (${DMITRY_USER_ID})`);
    return res.status(200).json({ status: 'ignored_wrong_recipient' });
  }

  // === INTERCEPTED: This is a message to Dmitry ===
  console.log(`[INTERCEPTED] ${fromUserName} → Dmitry: "${message}"`);
  
  // Find automatic reply from triggers
  const reply = findReply(message);
  
  if (reply) {
    // Send reply from bot to the original sender
    const botReply = `🤖 <b>Ассистент Дмитрия по закупкам:</b><br><br>${reply}`;
    
    console.log(`[AUTO-REPLY] Sending to ${fromUserName} (${fromUserId})`);
    const result = await sendMessageToUser(fromUserId, botReply);
    
    return res.status(200).json({ 
      status: 'auto_replied', 
      to: fromUserName,
      message_id: result.result 
    });
  }
  
  // No trigger match — stay silent (don't forward to Dmitry)
  console.log('[NO MATCH] No trigger found, staying silent');
  return res.status(200).json({ status: 'no_match_silent' });
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
    // For private messages, extract recipient from DIALOG_ID (format: userXXX)
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
      console.log(`[TRIGGER MATCH] "${triggerName}" — replying`);
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
    SYSTEM: 'N'         // Regular message (not system)
  };

  console.log(`[API CALL] Sending to user ${userId}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  const text = await response.text();
  
  if (!response.ok) {
    throw new Error(`Bitrix API error ${response.status}: ${text}`);
  }

  const result = JSON.parse(text);
  
  if (result.error) {
    throw new Error(`Bitrix error: ${result.error} - ${result.error_description}`);
  }
  
  console.log(`[API SUCCESS] Message sent, ID: ${result.result}`);
  return result;
}