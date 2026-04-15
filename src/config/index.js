import { config } from 'dotenv';

// Для локальной разработки подгружаем .env
// В Vercel переменные задаются в панели управления проектом
config({ path: '.env' });

export const CONFIG = {
  bitrix: {
    webhook: process.env.BITRIX_WEBHOOK_URL,
    botId: process.env.BITRIX_BOT_ID,
    dmitryId: process.env.DMITRY_USER_ID
  },
  server: {
    port: process.env.PORT || 3000
  }
};