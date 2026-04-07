// api/webhook.js
// Бот-помощник для личных сообщений в Битрикс24 (Подход А)

const answers = require('../data/answers.json');

// КОНФИГУРАЦИЯ
const CONFIG = {
  BOT_ID: 4331,                                    // Числовой ID бота
  CLIENT_ID: 'ms89kl0mtycrp63se5gu6dhym99urzjz',  // CLIENT_ID бота (строка)
  BITRIX_WEBHOOK: 'https://hdl.bitrix24.ru/rest/1673/yc8pgt6q7i4j90gb/',
  YOUR_USER_ID: 1673                               // Ваш личный ID
};

// Функция отправки сообщения от бота
async function sendMessage(dialogId, message) {
  const url = `${CONFIG.BITRIX_WEBHOOK}imbot.message.add`;
  
  console.log('Отправка сообщения:', {
    BOT_ID: CONFIG.BOT_ID,
    CLIENT_ID: CONFIG.CLIENT_ID,
    DIALOG_ID: dialogId,
    MESSAGE: message.substring(0, 50)
  });
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BOT_ID: CONFIG.BOT_ID,
      CLIENT_ID: CONFIG.CLIENT_ID,                 // ← ДОБАВЛЕНО!
      DIALOG_ID: dialogId,
      MESSAGE: message
    })
  });
  
  const result = await response.json();
  console.log('Результат отправки:', result);
  return result;
}

// Функция извлечения данных из плоского объекта Битрикс24
function extractFromFlatData(data) {
  // Извлекаем сообщение
  const messageText = data['data[PARAMS][MESSAGE]'] || '';
  
  // Извлекаем dialog_id (кто написал боту)
  let dialogId = data['data[PARAMS][DIALOG_ID]'] || data['data[PARAMS][FROM_USER_ID]'] || '';
  
  // Извлекаем user_id отправителя
  const userId = data['data[PARAMS][FROM_USER_ID]'] || data['data[USER][ID]'] || '';
  
  // Если dialogId пустой, берем из других полей
  if (!dialogId) {
    dialogId = data['data[PARAMS][TO_USER_ID]'] || userId;
  }
  
  console.log('Извлечено:', { messageText, dialogId, userId });
  
  return { messageText, dialogId, userId };
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
  
  // Только POST-запросы от Битрикс24
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const data = req.body;
    console.log('Получены ключи:', Object.keys(data).slice(0, 10));
    
    // Извлекаем данные из плоской структуры
    const { messageText, dialogId, userId } = extractFromFlatData(data);
    
    console.log(`Сообщение: "${messageText}", DialogId: ${dialogId}, UserId: ${userId}`);
    
    // Игнорируем сообщения без текста или dialogId
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