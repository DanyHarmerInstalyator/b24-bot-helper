import { TRIGGERS, TRIGGER_KEYS } from '../../src/dictionaries/triggers.js';
import { ROUTING } from '../../src/dictionaries/routing.js';
import { sendMessage } from '../../src/services/bitrix.js';
import { normalizeText } from '../../src/utils/textParser.js'; // Создадим чуть ниже

/**
 * Главный обработчик Vercel Serverless Function
 */
export default async function handler(request, response) {
  
  // 1. Разрешаем CORS и отвечаем на GET-запрос (проверка живости от Битрикса)
  if (request.method === 'GET') {
    response.status(200).send('OK');
    return;
  }

  // 2. Обрабатываем только POST (события от Битрикса)
  if (request.method !== 'POST') {
    response.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const event = request.body;
    
    // Проверка: это сообщение от пользователя?
    // Битрикс шлет разные события, нам нужно только ONIMBOTMESSAGEADD
    if (event.event !== 'ONIMBOTMESSAGEADD') {
      response.status(200).send('IGNORED_EVENT');
      return;
    }

    const {
      data: { MESSAGE, DIALOG_ID, FROM_USER_ID, FROM_USER_NAME }
    } = event;

    console.log(`[NEW MSG] From: ${FROM_USER_NAME} | Text: ${MESSAGE}`);

    // 3. Логика обработки текста
    const normalizedMsg = normalizeText(MESSAGE);
    let isMatched = false;

    // Перебираем ключевые слова из словаря
    for (const keyword of TRIGGER_KEYS) {
      if (normalizedMsg.includes(keyword)) {
        // Нашли совпадение!
        const reply = TRIGGERS[keyword];
        await sendMessage(DIALOG_ID, reply);
        
        console.log(`[REPLY] Sent trigger response for: "${keyword}"`);
        isMatched = true;
        break; // Прерываем цикл, чтобы не спамить ответами
      }
    }

    // 4. Если совпадений нет — пересылаем Дмитрию (если нужно)
    if (!isMatched) {
      // Проверяем, не от Дмитрия ли сообщение (чтобы не слать ему его же вопросы)
      if (String(FROM_USER_ID) !== String(CONFIG.bitrix.dmitryId)) {
        
        // Формируем сообщение для пересылки
        const forwardText = `❓ <b>Вопрос от сотрудника:</b>\n🗣 ${FROM_USER_NAME} (${FROM_USER_ID}):\n<i>"${MESSAGE}"</i>\n\n🤖 Бот не нашел ответа в базе.`;
        
        // Отправляем в ЛС Дмитрию
        await sendMessage(`user${CONFIG.bitrix.dmitryId}`, forwardText);
        console.log(`[FORWARD] Sent to Dmitry (ID: ${CONFIG.bitrix.dmitryId})`);
        
        // Опционально: можно ответить пользователю, что вопрос принят
        // await sendMessage(DIALOG_ID, `✅ Вопрос принят, Дмитрий скоро ответит.`);
      }
    }

    // 5. Успешный ответ Битриксу (чтобы он не дублировал событие)
    response.status(200).send('PROCESSED');

  } catch (error) {
    console.error('[FATAL ERROR]:', error);
    response.status(500).send('INTERNAL_ERROR');
  }
}