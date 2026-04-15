// api/bitrix/index.js
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 1. GET-запрос (проверка живости)
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'OK', message: 'Bot is alive' });
  }

  // 2. POST-запрос (событие от Битрикс24)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    console.log('[INCOMING EVENT]', JSON.stringify(body));

    // Проверяем тип события
    if (body.event !== 'ONIMBOTMESSAGEADD') {
      console.log('[IGNORED] Not ONIMBOTMESSAGEADD');
      return res.status(200).json({ status: 'ignored' });
    }

    // Безопасная распаковка данных
    const data = body.data || {};
    const { MESSAGE, DIALOG_ID, FROM_USER_ID, FROM_USER_NAME } = data;

    console.log(`[MSG] ${FROM_USER_NAME} (${FROM_USER_ID}): "${MESSAGE}"`);

    // Здесь будет логика словарей (пока просто эхо для теста)
    const reply = `🤖 Эхо: Вы написали "${MESSAGE}"\n📩 Если вопрос сложный, он будет передан Дмитрию.`;

    // Отправка ответа через встроенный fetch
    const webhook = process.env.BITRIX_WEBHOOK_URL;
    const botId = process.env.BITRIX_BOT_ID || '4341';

    if (!webhook) throw new Error('BITRIX_WEBHOOK_URL is not set in Vercel Env Variables!');

    const url = `${webhook.replace(/\/$/, '')}/im.message.add.json`;
    const params = new URLSearchParams({
      DIALOG_ID: DIALOG_ID,
      MESSAGE: reply,
      FROM_BOT_ID: botId
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const result = await response.json();
    console.log('[BITRIX RESPONSE]', result);

    return res.status(200).json({ status: 'success', bitrixResult: result });

  } catch (error) {
    console.error('[FATAL ERROR]', error.message, error.stack);
    return res.status(500).json({ error: 'Function crashed', details: error.message });
  }
}