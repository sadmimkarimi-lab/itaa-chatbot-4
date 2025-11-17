import Redis from "@upstash/redis";

// اتصال به دیتابیس Upstash
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// کلید و مدل‌های Groq
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_MODELS = [
  "llama-3.1-70b-versatile",
  "llama-3.1-8b-instant"
];

// System prompt برای لحن ربات
const SYSTEM_PROMPT = `
تو یک دستیار هوشمند فارسی‌زبان هستی.
- با لحن صمیمی، محترمانه و قابل فهم جواب بده.
- جواب‌ها را کوتاه، دقیق و کاربردی بده.
- اگر سؤال مبهم بود، از کاربر بخواه واضح‌تر توضیح بده.
- از پاسخ‌های خشک و رسمی خودداری کن.
`;

// تابع پرسیدن سؤال از Groq با fallback
async function askGroq(userMessage) {
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  let lastError = null;

  for (const model of GROQ_MODELS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.4,
          max_tokens: 700,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        lastError = new Error(data?.error?.message || "Groq error");
        continue;
      }

      const answer = data?.choices?.[0]?.message?.content;
      if (answer) return answer.trim();
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Groq unavailable");
}

// ارسال پیام به ایتا
async function sendMessage(chatId, text, replyTo = null) {
  const url = `https://eitaayar.ir/bot${process.env.EITAA_BOT_TOKEN}/sendMessage`;

  const payload = {
    chat_id: chatId,
    text,
  };

  if (replyTo) payload.reply_to_message_id = replyTo;

  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// هندل وبهوک ایتا
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  try {
    const body = req.body;
    const message = body?.message;
    const text = message?.text;
    const chatId = message?.chat?.id;
    const userId = message?.from?.id;
    const replyToId = message?.message_id;

    if (!text || !chatId || !userId) {
      return res.status(200).json({ ok: true });
    }

    // اگر /start بود
    if (text === "/start") {
      await sendMessage(
        chatId,
        "سلام دوست خوبم 🌿\nمن ربات هوشمند تاویتا هستم 🤖💚\nبرای اینکه سیستم همیشه سریع و دقیق بمونه، هر کاربر روزانه **۱۰ پیام** فرصت داره.\n\nسوالت رو واضح بپرس تا بهترین جواب رو بدم ✨",
        replyToId
      );

      return res.status(200).json({ ok: true });
    }

    // محدودیت پیام (۱۰ پیام در روز)
    const today = new Date().toISOString().slice(0, 10);
    const key = `limit:${userId}:${today}`;

    let count = await redis.get(key);

    if (!count) {
      await redis.set(key, 1, { ex: 60 * 60 * 24 });
      count = 1;
    } else {
      count = Number(count) + 1;
      await redis.set(key, count, { ex: 60 * 60 * 24 });
    }

    if (count > 10) {
      await sendMessage(
        chatId,
        "🌱 دوست خوبم،\nسهمیه امروزت برای استفاده از ربات تکمیل شد (۱۰ پیام).\nلطفاً فردا دوباره برگرد 🌟💚",
        replyToId
      );

      return res.status(200).json({ ok: true });
    }

    // ارسال پیام به Groq
    const answer = await askGroq(text);

    // ارسال پاسخ به ایتا
    await sendMessage(chatId, answer, replyToId);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Internal error:", err);
    return res.status(500).json({ ok: false });
  }
}
