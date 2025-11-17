// api/chat.js

import { Redis } from "@upstash/redis";

// --- اتصال به Redis از Upstash ---
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// --- تابع ارسال پیام به ایتا ---
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

// --- سوال از Groq ---
async function askGroq(userText) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    console.error("GROQ_API_KEY is missing");
    return "کلید اتصال به هوش مصنوعی تنظیم نشده است.";
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "تو یک دستیار فارسی‌زبان مهربان و دقیق هستی. جواب‌ها را ساده، واضح و بدون حاشیه‌های اضافی بده.",
        },
        {
          role: "user",
          content: userText,
        },
      ],
      temperature: 0.6,
    }),
  });

  if (!res.ok) {
    console.error("Groq error:", res.status, await res.text());
    return "در ارتباط با سرور هوش مصنوعی مشکلی پیش آمد. لطفاً کمی بعد دوباره امتحان کن.";
  }

  const data = await res.json();
  const answer =
    data?.choices?.[0]?.message?.content?.trim() ||
    "نتوانستم پاسخ مناسبی پیدا کنم. لطفاً سؤال را کمی واضح‌تر بپرس 😊";

  return answer;
}

// --- هندلر اصلی وبهوک ایتا ---
export default async function handler(req, res) {
  // فقط POST
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  try {
    const body = req.body || {};
    const message = body.message;

    if (!message) {
      console.log("No message in Eitaa payload");
      return res.status(200).json({ ok: true });
    }

    const text = message.text || "";
    const chatId = message.chat?.id;
    // اگر from.id نبود، از خود chatId استفاده می‌کنیم
    const userId = message.from?.id || chatId;
    const replyToId = message.message_id;

    if (!text || !chatId) {
      console.log("Invalid Eitaa payload (no text or chatId)");
      return res.status(200).json({ ok: true });
    }

    // --- ۱) خوش‌آمدگویی اولین بار ---
    const seenKey = `seen:${userId}`;
    const alreadySeen = await redis.get(seenKey);

    if (!alreadySeen) {
      await redis.set(seenKey, "1");

      const welcome =
        "سلام دوست خوبم 🌿\n" +
        "من ربات هوشمند تاویتا هستم 🤖💚\n" +
        "هر سؤالی درباره زندگی، کار، درس، ایده و… داشتی، می‌تونی ازم بپرسی.\n\n" +
        "فقط یک نکته مهم:\n" +
        "در هر **۶ ساعت** می‌تونی حداکثر **۱۰ پیام** ارسال کنی.\n" +
        "پس سؤالاتت رو واضح و کامل بپرس تا بهترین جواب رو بدم ✨";

      await sendMessage(chatId, welcome, replyToId);
      return res.status(200).json({ ok: true });
    }

    // --- ۲) محدودیت ۱۰ پیام در هر ۶ ساعت ---
    const sixHours = 6 * 60 * 60; // ثانیه
    const windowId = Math.floor(Date.now() / (sixHours * 1000)); // شناسه بازه ۶ ساعته
    const limitKey = `limit:${userId}:${windowId}`;

    let count = await redis.get(limitKey);

    if (!count) {
      await redis.set(limitKey, 1, { ex: sixHours });
      count = 1;
    } else {
      count = Number(count) + 1;
      await redis.set(limitKey, count, { ex: sixHours });
    }

    if (count > 10) {
      const limitMsg =
        "مهربون من 🌿\n" +
        "در هر بازه‌ی **۶ ساعته** می‌تونی حداکثر **۱۰ پیام** بفرستی ⏳\n" +
        "الان سهم این بازه‌ات تموم شده.\n" +
        "چند ساعت دیگه دوباره برگرد، با کمال میل ادامه می‌دیم 💚";

      await sendMessage(chatId, limitMsg, replyToId);
      return res.status(200).json({ ok: true });
    }

    // --- ۳) گرفتن جواب از Groq ---
    const answer = await askGroq(text);

    // --- ۴) ارسال جواب به ایتا ---
    await sendMessage(chatId, answer, replyToId);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Internal error:", err);
    return res.status(500).json({ ok: false });
  }
}
