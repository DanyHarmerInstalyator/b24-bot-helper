import fetch from 'node-fetch';
import { CONFIG } from '../config/index.js';

/**
 * Отправка сообщения в чат Битрикс24
 * @param {string} dialogId - ID чата (из события)
 * @param {string} message - Текст сообщения
 * @param {string} senderId - От чьего имени (BOT_ID или USER_ID)
 */
export const sendMessage = async (dialogId, message, senderId = CONFIG.bitrix.botId) => {
  const url = `${CONFIG.bitrix.webhook}im.message.add.json`;
  
  const payload = new URLSearchParams({
    'DIALOG_ID': dialogId,
    'MESSAGE': message,
    'FROM_BOT_ID': senderId // Если передать ID пользователя, бот ответит "за него"
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('[Bitrix API Error]:', error);
    return null;
  }
};