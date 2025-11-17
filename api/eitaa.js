// /api/eitaa.js

// تو Vercel باید EITAA_BOT_TOKEN رو ست کنی
const BOT_TOKEN = process.env.EITAA_BOT_TOKEN;
const API_BASE = `https://api.eitaa.com/bot${BOT_TOKEN}`;

// ارسال پیام به ایتا
async function sendMessage(chat_id, text) {
  if (!BOT_TOKEN) {
    console.error("EITAA_BOT_TOKEN تعریف نشده است");
    return;
  }

  await fetch(`${API_BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text }),
  });
}

export default async function handler(req, res) {
  // فقط POST از طرف ایتا
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  const update = req.body || {};
  const msg = update.message;
  if (!msg) return res.status(200).json({ ok: true });

  const chatId = msg.chat?.id;
  const text = msg.text || "";

  if (!chatId) {
    return res.status(400).json({ ok: false, error: "chat_id نامعتبر است." });
  }

  // پیام خوش‌آمد
  if (text === "/start") {
    await sendMessage(chatId, "سلام 👋 من چت‌بات هوش مصنوعی هستم.");
    await sendMessage(
      chatId,
      "هر سؤالی داری کامل بنویس، من به صورت مستقل جواب می‌دم 🌿"
    );
    return res.status(200).json({ ok: true });
  }

  // آدرس سرور خودت روی ورسل
  const baseUrl =
    process.env.APP_URL || "https://itaa-chatbot-6.vercel.app";

  try {
    // فرستادن متن به api/chat
    const resp = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const data = await resp.json().catch(() => ({}));

    // اگر پاسخ اوکی نبود
    if (!resp.ok) {
      console.error("chat API error:", data);
      const errMsg =
        data?.error ||
        "❌ خطا در ارتباط با سرور هوش مصنوعی. لطفاً کمی بعد دوباره تلاش کن.";
      await sendMessage(chatId, errMsg);
      return res.status(500).json({ ok: false, error: errMsg });
    }

    const answer =
      data?.answer ||
      "نتونستم جواب مناسبی پیدا کنم، لطفاً دوباره سؤال رو بپرس 🥲";

    await sendMessage(chatId, answer);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Eitaa handler internal error:", err);
    await sendMessage(
      chatId,
      "❌ خطای داخلی سرور. لطفاً چند دقیقه بعد دوباره تلاش کن."
    );
    return res.status(500).json({ ok: false, error: "internal-error" });
  }
}
