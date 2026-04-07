// api/webhook.js
// Бот-помощник для личных сообщений в Битрикс24 (Подход А)

const answers = require('../data/answers.json');

// КОНФИГУРАЦИЯ - ИСПРАВЛЕНА
const CONFIG = {
  BOT_ID: 4331,                                    
  BITRIX_WEBHOOK: 'https://hdl.bitrix24.ru/rest/1673/yc8pgt6q7i4j90gb/',
  YOUR_USER_ID: 1673                               
};

// Функция отправки сообщения от бота
async function sendMessage(dialogId, message) {
  const url = `${CONFIG.BITRIX_WEBHOOK}imbot.message.add`;
  
  console.log('Отправка сообщения:', {
    url: url,
    BOT_ID: CONFIG.BOT_ID,
    DIALOG_ID: dialogId,
    MESSAGE: message.substring(0, 50)
  });
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BOT_ID: CONFIG.BOT_ID,                       // ← ИСПРАВЛЕНО
      DIALOG_ID: dialogId,
      MESSAGE: message
    })
  });
  
  const result = await response.json();
  console.log('Результат отправки:', result);
  return result;
}

// Функция поиска ответа в журнале
function findAnswer(messageText) {
  const lowerText = messageText.toLowerCase().trim();
  
  // Точное совпадение с ключом
  if (answers[lowerText]) {
    return answers[lowerText];
  }
  
  // Поиск по вхождению ключевого слова
  for (const [keyword, answer] of Object.entries(answers)) {
    if (lowerText.includes(keyword)) {
      return answer;
    }
  }
  
  return null; // Ответ не найден
}

// Главный обработчик вебхука
module.exports = async (req, res) => {
  console.log('=== Webhook вызван ===');
  console.log('Method:', req.method);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  // Только POST-запросы от Битрикс24
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const data = req.body;
    
    // Извлекаем данные о сообщении
    const messageText = data?.data?.PARAMS?.MESSAGE || '';
    const dialogId = data?.data?.PARAMS?.DIALOG_ID;
    const userId = data?.data?.PARAMS?.USER_ID;
    
    console.log(`Сообщение: "${messageText}", DialogId: ${dialogId}, UserId: ${userId}`);
    
    // Игнорируем сообщения без текста
    if (!messageText || !dialogId) {
      console.log('Нет текста или dialogId, игнорируем');
      return res.status(200).json({ status: 'ignored' });
    }
    
    // Ищем ответ в журнале
    const answer = findAnswer(messageText);
    
    if (answer) {
      // Ответ найден — бот отвечает сам
      console.log(`Найден ответ: ${answer}`);
      await sendMessage(dialogId, answer);
      console.log(`[BOT] Ответил пользователю ${userId}`);
    } else {
      // Ответ не найден — отправляем уведомление Дмитрию
      console.log('Ответ не найден, отправляем уведомление');
      const notification = `🔔 Пользователь написал боту:\n\nВопрос: "${messageText}"\n\nПожалуйста, ответьте ему в диалоге с ботом.`;
      await sendMessage(CONFIG.YOUR_USER_ID, notification);
      console.log(`[BOT] Уведомление отправлено Дмитрию`);
      
      // Также можно ответить пользователю, что вопрос передан
      await sendMessage(dialogId, 'Я передал ваш вопрос Дмитрию. Он ответит вам в ближайшее время.');
    }
    
    res.status(200).json({ status: 'ok' });
    
  } catch (error) {
    console.error('Ошибка:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};