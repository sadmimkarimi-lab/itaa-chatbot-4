import { Redis } from "@upstash/redis";

// اتصال به دیتابیس Upstash
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// کلید و مدل‌های Groq
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_MODELS = [
  "llama-3.1-70b-versatile",
  "llama-3.1-8b-instant",
];

// تابع پرسیدن سؤال از Groq
async function askGroq(question) {
  const systemPrompt =
    "تو یک دستیار فارسی‌زبان مهربان و دقیق هستی. واضح، دوستانه و قابل‌فهم جواب بده.";

  const payload = {
    model: GROQ_MODELS[0],
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ],
    temperature: 0.7,
    max_tokens: 2048,
  };

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error("Groq error status:", response.status);
    throw new Error("Groq API error");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "نتونستم جواب مناسبی پیدا کنم.";
}

// ارسال پیام به ایتا
async function sendMessage(chatId, text, replyToId) {
  const url = `https://eitaayar.ir/bot${process.env.EITAA_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    reply_to_message_id: replyToId,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error("Eitaa sendMessage error:", await res.text());
  }
}

// هندلر وبهوک ایتا
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  try {
    const body = req.body;
    const message = body?.message?.text;
    const chatId = body?.message?.chat?.id;
    const userId = body?.message?.from?.id;
    const replyToId = body?.message?.message_id;

    if (!message || !chatId || !userId) {
      return res.status(200).json({ ok: true });
    }

    const text = message.trim();

    // 🔐 محدودیت: ۱۰ پیام در هر ۶ ساعت برای هر کاربر
    const key = `limit:${userId}:${new Date().toISOString().slice(0, 10)}`;
    let count = await redis.get(key);

    if (!count) {
      // اولین پیام در این بازه
      count = 1;
      await redis.set(key, count, { ex: 60 * 60 * 6 }); // ۶ ساعت
      await sendMessage(
        chatId,
        "سلام 👋 خوش اومدی!\nمن دستیار هوشمند chatgpt هستم.\nبرای هر کاربر در هر ۶ ساعت، **۱۰ پیام** فرصت داری 🌿\nسؤال‌هاتو واضح بپرس تا بهترین جواب رو بدم ✨",
        replyToId
      );
    } else {
      count = Number(count) + 1;

      if (count > 10) {
        await sendMessage(
          chatId,
          "دوست خوبم 🌿\nسهم پیام‌هات در این ۶ ساعت تموم شد.\nلطفاً چند ساعت دیگه دوباره برگرد تا با هم ادامه بدیم 💚",
          replyToId
        );
        return res.status(200).json({ ok: true });
      }

      await redis.set(key, count, { ex: 60 * 60 * 6 }); // تمدید تا ۶ ساعت
    }

    // بعد از خوش‌آمد / محدودیت، جواب اصلی رو از Groq می‌گیریم
    const answer = await askGroq(text);
    await sendMessage(chatId, answer, replyToId);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Internal error:", err);
    return res.status(500).json({ ok: false });
  }
}
