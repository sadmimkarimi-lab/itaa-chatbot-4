// api/eitaa.js
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// مدل‌های Groq به ترتیب اولویت
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gpt-oss-20b",
];

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ارسال پیام به ایتا
async function sendMessage(chat_id, text, replyToId) {
  const url = `https://eitaayar.ir/bot${process.env.EITAA_BOT_TOKEN}/sendMessage`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text,
        reply_to_message_id: replyToId,
      }),
    });
  } catch (err) {
    console.error("خطا در ارسال پیام به ایتا:", err);
  }
}

// تست یک مدل Groq
async function callGroqOnce(model, userMessage) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY تنظیم نشده است");

  const resp = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "تو یک دستیار فارسی‌زبان مهربان و دقیق هستی. جواب‌ها را واضح، مفید، کاربردی و بدون حاشیه‌های اضافی بده.",
        },
        { role: "user", content: userMessage },
      ],
      temperature: 0.6,
      max_tokens: 1024,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Groq error (${model}): ${resp.status} - ${t}`);
  }

  const data = await resp.json();

  return (
    data?.choices?.[0]?.message?.content?.trim() ||
    "نتوانستم پاسخ مناسبی پیدا کنم. لطفاً سؤال را واضح‌تر بپرس 😊"
  );
}

// fallback بین مدل‌ها
async function askGroq(userMessage) {
  for (const model of GROQ_MODELS) {
    try {
      return await callGroqOnce(model, userMessage);
    } catch (err) {
      console.error(`خطا با مدل ${model}:`, err.message);
    }
  }

  return (
    "در حال حاضر دسترسی به مدل‌های هوش مصنوعی ممکن نیست 😔\n" +
    "لطفاً چند دقیقه‌ی دیگر تلاش کن."
  );
}

// محدودیت ۱۰ پیام / ۶ ساعت
async function checkRateLimit(userId) {
  const sixHours = 6 * 60 * 60;
  const windowId = Math.floor(Date.now() / (sixHours * 1000));

  const key = `limit:${userId}:${windowId}`;
  let count = await redis.get(key);

  if (!count) {
    await redis.set(key, 1, { ex: sixHours });
    return { allowed: true };
  }

  count = Number(count);

  if (count >= 10) return { allowed: false };

  await redis.set(key, count + 1, { ex: sixHours });
  return { allowed: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  try {
    const msg = req.body?.message;
    if (!msg) return res.status(200).json({ ok: true });

    const text = msg.text || "";
    const chatId = msg.chat?.id;
    const userId = msg.from?.id || chatId;
    const replyToId = msg.message_id;

    if (!text || !chatId) return res.status(200).json({ ok: true });

    // /start
    if (text === "/start") {
      await sendMessage(
        chatId,
        "سلام 👋 خوش اومدی!\n" +
          "من دستیار chatgpt هستم.\n" +
          "هر سؤالی درباره زندگی، کار، درس ایده و... داری بپرس 🌿\n" +
          "برای اینکه سرویس پایدار بمونه در هر بازه ی ۶ ساعته میتونی حداکثر ۱۰ پیام ارسال کنی. پس در هر پیامت کامل و با جزئیات درخواستت رو بیان کن.",
        replyToId
      );
      return res.status(200).json({ ok: true });
    }

    // محدودیت
    const limit = await checkRateLimit(userId);
    if (!limit.allowed) {
      await sendMessage(
        chatId,
        "دوست خوبم 🌱\n" +
          "در هر بازه ۶ ساعته فقط می‌تونی ۱۰ پیام ارسال کنی.\n" +
          "الان سقف این بازه پر شده. چند ساعت دیگه برگرد ❤️",
        replyToId
      );
      return res.status(200).json({ ok: true });
    }

    // پاسخ Groq
    const answer = await askGroq(text);

    await sendMessage(chatId, answer, replyToId);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ ok: false });
  }
}
