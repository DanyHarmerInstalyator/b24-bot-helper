// api/bitrix/index.js
// ✅ ProcurementBot v1.0 — Production Ready
// ✅ Исправлен путь импорта: ../../src/...

import { TRIGGERS } from '../../src/dictionaries/triggers.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'OK', 
      message: 'ProcurementBot is alive 🤖',
      timestamp: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    
    const getMessage = (key) => body[`data[PARAMS][${key}]`];
    const getUser = (key) => body[`data[USER][${key}]`];

    const MESSAGE = getMessage('MESSAGE') || '';
    const DIALOG_ID_RAW = getMessage('DIALOG_ID') || '';
    const FROM_USER_ID = getMessage('FROM_USER_ID') || '';
    const FROM_USER_NAME = getUser('NAME') || 'Сотрудник';
    
    const TO_USER_ID = String(DIALOG_ID_RAW).replace(/^user/, '');
    
    console.log(`[MSG] ${FROM_USER_NAME} (${FROM_USER_ID}): "${MESSAGE}"`);
    console.log(`[REPLY_TO] USER_ID: ${TO_USER_ID}`);

    const text = MESSAGE.toLowerCase().trim();
    let reply = null;
    let matchedTrigger = null;

    for (const [triggerName, config] of Object.entries(TRIGGERS)) {
      if (config.keywords.some(kw => text.includes(kw))) {
        reply = config.reply;
        matchedTrigger = triggerName;
        console.log(`[MATCH] Trigger "${triggerName}" matched`);
        break;
      }
    }

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

    const dmitryId = process.env.DMITRY_USER_ID || '1';
    if (String(FROM_USER_ID) !== String(dmitryId)) {
      const forwardMsg = `❓ <b>Вопрос от сотрудника (бот не понял):</b>\n\n🗣 <b>${FROM_USER_NAME}</b> (ID: ${FROM_USER_ID}):\n<i>"${MESSAGE}"</i>\n\n🤖 <i>Бот не нашёл ответа в базе.</i>`;
      console.log(`[FORWARD] Sending to Dmitry (ID: ${dmitryId})`);
      await sendBitrixMessage(dmitryId, forwardMsg);
    }

    return res.status(200).json({ status: 'forwarded' });

  } catch (error) {
    console.error('[FATAL ERROR]', error.message);
    console.error(error.stack);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function sendBitrixMessage(userId, message) {
  const webhook = process.env.BITRIX_WEBHOOK_URL;
  if (!webhook) throw new Error('BITRIX_WEBHOOK_URL not set');

  const url = `${webhook.replace(/\/$/, '')}/im.message.add.json`;
  const params = {
    USER_ID: parseInt(userId, 10),
    MESSAGE: message,
    MESSAGE_TYPE: 'P'
  };

  console.log(`[SEND] POST ${url} | USER_ID=${params.USER_ID}`);

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