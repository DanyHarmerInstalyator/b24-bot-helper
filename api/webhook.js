// api/webhook.js
// Бот-помощник с диалоговыми сценариями и словарём исключений

const fs = require('fs');
const path = require('path');

// Пути к файлам
const answersPath = path.join(__dirname, '../data/answers.json');
const exceptionsPath = path.join(__dirname, '../data/exceptions.json');
const objectsPath = path.join(__dirname, '../data/objects.json');
const sessionsPath = path.join(__dirname, '../data/sessions.json');

// Функции для работы с файлами
function readJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Ошибка чтения ${filePath}:`, error);
    return {};
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Ошибка записи ${filePath}:`, error);
  }
}

// Загружаем данные
let answers = readJSON(answersPath);
let exceptions = readJSON(exceptionsPath);
let objects = readJSON(objectsPath);
let sessions = readJSON(sessionsPath);

// КОНФИГУРАЦИЯ
const CONFIG = {
  BOT_ID: 4331,
  CLIENT_ID: 'ms89kl0mtycrp63se5gu6dhym99urzjz',
  BITRIX_WEBHOOK: 'https://hdl.bitrix24.ru/rest/1673/yc8pgt6q7i4j90gb/',
  YOUR_USER_ID: 1673
};

// Функция отправки сообщения
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

// Функция извлечения данных
function extractFromFlatData(data) {
  const messageText = data['data[PARAMS][MESSAGE]'] || '';
  let dialogId = data['data[PARAMS][DIALOG_ID]'] || data['data[PARAMS][FROM_USER_ID]'] || '';
  const userId = data['data[PARAMS][FROM_USER_ID]'] || data['data[USER][ID]'] || '';
  const userName = data['data[USER][NAME]'] || '';
  const userLastName = data['data[USER][LAST_NAME]'] || '';
  const fullName = `${userName} ${userLastName}`.trim() || `Пользователь ${userId}`;
  
  if (!dialogId) {
    dialogId = data['data[PARAMS][TO_USER_ID]'] || userId;
  }
  
  return { messageText, dialogId, userId, fullName };
}

// Функция получения статуса по объекту
function getObjectStatus(objectName) {
  const key = objectName.toLowerCase().trim();
  const obj = objects[key];
  
  if (!obj) {
    return null;
  }
  
  let response = `📋 *Информация по объекту "${objectName}"*:\n\n`;
  response += `📌 Статус: ${obj.status}\n`;
  if (obj.equipment) response += `📦 Оборудование: ${obj.equipment}\n`;
  if (obj.delivery_date) response += `📅 Ожидаемая дата: ${obj.delivery_date}\n`;
  if (obj.notes) response += `💬 Примечание: ${obj.notes}\n`;
  
  return response;
}

// Функция проверки исключений (отвлечённые вопросы)
function checkException(messageText) {
  const lowerText = messageText.toLowerCase().trim();
  
  // Проверяем точное совпадение
  if (exceptions[lowerText]) {
    return exceptions[lowerText];
  }
  
  // Проверяем по вхождению ключевой фразы
  for (const [keyword, answer] of Object.entries(exceptions)) {
    if (lowerText.includes(keyword)) {
      return answer;
    }
  }
  
  return null;
}

// Функция поиска ответа с учетом контекста диалога и исключений
function findAnswerWithContext(messageText, dialogId) {
  const lowerText = messageText.toLowerCase().trim();
  
  // Получаем текущую сессию диалога
  const session = sessions[dialogId] || { state: 'idle', awaitingObject: false };
  
  // Сценарий: ждем название объекта
  if (session.awaitingObject === true) {
    sessions[dialogId] = { state: 'idle', awaitingObject: false };
    writeJSON(sessionsPath, sessions);
    
    const status = getObjectStatus(lowerText);
    if (status) {
      return status;
    } else {
      return `❌ Объект "${messageText}" не найден в базе.\n\nПожалуйста, уточните название или напишите "статус по объекту" ещё раз.\n\nИли я могу передать ваш вопрос Дмитрию.`;
    }
  }
  
  // ПРОВЕРКА ИСКЛЮЧЕНИЙ (отвлечённые вопросы)
  const exceptionAnswer = checkException(messageText);
  if (exceptionAnswer) {
    return exceptionAnswer;
  }
  
  // Проверка запроса статуса объекта
  const statusKeywords = ['статус по объекту', 'статус объекта', 'информация по объекту', 'расскажи про объект'];
  for (const keyword of statusKeywords) {
    if (lowerText.includes(keyword)) {
      sessions[dialogId] = { state: 'waiting_for_object', awaitingObject: true };
      writeJSON(sessionsPath, sessions);
      return "🔍 Какой объект вас интересует? Напишите название (например: Павлово, Солнечный)";
    }
  }
  
  // Проверка прямого запроса "статус по объекту X"
  const directMatch = lowerText.match(/статус по объекту\s+(.+)/i);
  if (directMatch) {
    const objectName = directMatch[1];
    const status = getObjectStatus(objectName);
    if (status) {
      return status;
    } else {
      return `❌ Объект "${objectName}" не найден в базе.\n\nПроверьте название или напишите "статус по объекту" без указания объекта — я попрошу уточнить.`;
    }
  }
  
  // Обычный поиск по журналу answers.json
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

// Главный обработчик
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
    
    // Ищем ответ с учетом контекста и исключений
    const answer = findAnswerWithContext(messageText, dialogId);
    
    if (answer) {
      await sendMessage(dialogId, answer);
      console.log(`[BOT] Ответил ${fullName}`);
    } else {
      // Неизвестный вопрос — уведомляем Дмитрия
      const notification = `🔔 **${fullName}** (ID: ${userId}) написал боту:\n\n❓ Вопрос: "${messageText}"\n\n👉 Пожалуйста, ответьте ему в диалоге с ботом.`;
      await sendMessage(CONFIG.YOUR_USER_ID, notification);
      console.log(`[BOT] Уведомление отправлено Дмитрию`);
      
      await sendMessage(dialogId, '🤔 Я не совсем понял ваш вопрос. Я умею отвечать на вопросы по статусу объектов.\n\nЕсли вам нужна помощь Дмитрия — он получил уведомление и скоро ответит.\n\n📌 Попробуйте написать "статус по объекту" или "помощь"');
    }
    
    res.status(200).json({ status: 'ok' });
    
  } catch (error) {
    console.error('Ошибка:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};