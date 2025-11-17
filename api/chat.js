// api/chat.js

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-70b-versatile"; // همون مدلی که قبلاً جواب می‌داد

// کمک‌کننده برای ارسال پیام به ایتا
async function sendToEitaa(chat_id, text) {
  try {
    await fetch(
      `https://eitaayar.ir/bot${process.env.EITAA_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, text }),
      }
    );
  } catch (err) {
    console.error("Error sending to Eitaa:", err);
  }
}

export default async function handler(req, res) {
  // فقط POST قبول کن، ولی به ایتا همیشه 200 برگردون
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  const body = req.body || {};
  const msg = body.message || {};
  const message = msg.text;
  const chat_id = msg.chat?.id;
  const user_id = msg.from?.id;

  // اگر ساختار پیام درست نبود، ساکت رد شو
  if (!message || !chat_id || !user_id) {
    return res.status(200).send("NO_MESSAGE");
  }

  // 🔢 محدودیت: هر کاربر حداکثر 10 پیام در هر 6 ساعت
  const windowKey = `limit:${user_id}:${new Date()
    .toISOString()
    .slice(0, 10)}`; // بر اساس روز + کاربر
  let count = await redis.get(windowKey);

  if (!count) {
    count = 1;
  } else {
    count = Number(count) + 1;
  }

  // ست با TTL شش‌ساعته
  await redis.set(windowKey, count, { ex: 60 * 60 * 6 });

  // اگر از 10 تا بیشتر شد، پیام محدودیت بفرست
  if (count > 10) {
    await sendToEitaa(
      chat_id,
      "💡 دوست خوبم، تعداد پیام‌هات در این ۶ ساعت تکمیل شده.\n\n" +
        "برای اینکه ربات برای همه منصفانه کار کنه، هر کاربر در هر **۶ ساعت** می‌تونه حداکثر **۱۰ پیام** بفرسته.\n\n" +
        "چند ساعت دیگه دوباره برگرد، با کمال میل جواب‌گو هستم 🤍"
    );
    return res.status(200).send("LIMIT_REACHED");
  }

  // 🎯 پرامپت سیستمی برای گروک
  const systemPrompt =
    "تو یک دستیار فارسی مهربان و دقیق هستی. " +
    "جواب‌ها را واضح، کوتاه و قابل فهم برای یک کاربر عادی بنویس. " +
    "اگر سؤال مبهم بود، یک‌بار خیلی کوتاه سؤال را شفاف کن.";

  // تماس با Groq
  async function askGroq() {
    try {
      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          temperature: 0.7,
          max_tokens: 800,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error("Groq error:", response.status, errText);
        return null;
      }

      const data = await response.json();
      return data?.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
      console.error("Groq fetch error:", err);
      return null;
    }
  }

  let answer = await askGroq();
  if (!answer) {
    answer =
      "الان سرورها کمی شلوغ شده، لطفاً چند دقیقه دیگه دوباره امتحان کن عزیزم 🤍";
  }

  // ✨ اگر اولین پیام این کاربر است، خوش‌آمد + توضیح محدودیت را هم اضافه کن
  let finalText = answer;
  if (count === 1) {
    finalText =
      "سلام 👋 خوش اومدی!\n" +
      "من دستیار هوشمند *chatgpt* هستم و سعی می‌کنم تا حد ممکن دقیق و قابل فهم جواب بدم 🌿\n\n" +
      "🔢 برای اینکه ربات برای همه منصفانه کار کنه:\n" +
      "هر کاربر در هر **۶ ساعت** می‌تونه حداکثر **۱۰ پیام** بفرسته.\n\n" +
      "حالا بریم سراغ سؤال اولت:\n\n" +
      answer;
  }

  await sendToEitaa(chat_id, finalText);

  return res.status(200).send("OK");
}
