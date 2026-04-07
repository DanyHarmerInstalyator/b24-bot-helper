// api/webhook.js
// Бот-помощник для личных сообщений в Битрикс24 (Подход А)

const answers = require('../data/answers.json');

// КОНФИГУРАЦИЯ
const CONFIG = {
  BOT_ID: 4331,
  CLIENT_ID: 'ms89kl0mtycrp63se5gu6dhym99urzjz',
  BITRIX_WEBHOOK: 'https://hdl.bitrix24.ru/rest/1673/yc8pgt6q7i4j90gb/',
  YOUR_USER_ID: 1673
};

// Функция отправки сообщения от бота
async function sendMessage(dialogId, message) {
  const url = `${CONFIG.BITRIX_WEBHOOK}imbot.message.add`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BOT_ID: CONFIG.BOT_ID,
      CLIENT_ID: CONFIG.CLIENT_ID,
      DIALOG_ID: dialogId,
      MESSAGE: message
    })
  });
  
  return await response.json();
}

// Функция извлечения данных из плоского объекта Битрикс24 (с именем пользователя)
function extractFromFlatData(data) {
  const messageText = data['data[PARAMS][MESSAGE]'] || '';
  let dialogId = data['data[PARAMS][DIALOG_ID]'] || data['data[PARAMS][FROM_USER_ID]'] || '';
  const userId = data['data[PARAMS][FROM_USER_ID]'] || data['data[USER][ID]'] || '';
  
  // ИЗВЛЕКАЕМ ИМЯ ПОЛЬЗОВАТЕЛЯ
  const userName = data['data[USER][NAME]'] || '';
  const userLastName = data['data[USER][LAST_NAME]'] || '';
  const fullName = `${userName} ${userLastName}`.trim() || `Пользователь ${userId}`;
  
  if (!dialogId) {
    dialogId = data['data[PARAMS][TO_USER_ID]'] || userId;
  }
  
  console.log('Извлечено:', { messageText, dialogId, userId, fullName });
  
  return { messageText, dialogId, userId, fullName };
}

// Функция поиска ответа в журнале
function findAnswer(messageText) {
  const lowerText = messageText.toLowerCase().trim();
  
  if (answers[lowerText]) {
    return answers[lowerText];
  }
  
  for (const [keyword, answer] of Object.entries(answers)) {
    if (lowerText.includes(keyword)) {
      return answer;
    }
  }
  
  return null;
}

// Главный обработчик вебхука
module.exports = async (req, res) => {
  console.log('=== Webhook вызван ===');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const data = req.body;
    const { messageText, dialogId, userId, fullName } = extractFromFlatData(data);
    
    console.log(`Сообщение: "${messageText}", От: ${fullName} (${userId})`);
    
    if (!messageText || !dialogId) {
      return res.status(200).json({ status: 'ignored' });
    }
    
    const answer = findAnswer(messageText);
    
    if (answer) {
      await sendMessage(dialogId, answer);
      console.log(`[BOT] Ответил ${fullName}`);
    } else {
      // Уведомление с ИМЕНЕМ пользователя
      const notification = `🔔 **${fullName}** (ID: ${userId}) написал боту:\n\nВопрос: "${messageText}"\n\n👉 Пожалуйста, ответьте ему в диалоге с ботом.`;
      await sendMessage(CONFIG.YOUR_USER_ID, notification);
      console.log(`[BOT] Уведомление отправлено Дмитрию о сообщении от ${fullName}`);
      
      await sendMessage(dialogId, 'Я передал ваш вопрос Дмитрию. Он ответит вам в ближайшее время.');
    }
    
    res.status(200).json({ status: 'ok' });
    
  } catch (error) {
    console.error('Ошибка:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};