import Redis from "@upstash/redis";

// اتصال به دیتابیس Upstash
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// تنظیمات Groq
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant"; // مدلی که الان جواب می‌دهد

// ارسال پیام به ایتا
async function sendMessage(chat_id, text) {
  const url = `https://eitaayar.ir/bot${process.env.EITAA_BOT_TOKEN}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id,
      text,
    }),
  });
}

// پرسیدن سؤال از Groq
async function askGroq(userMessage) {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content:
            "تو یک دستیار فارسی‌زبان مهربان و کاربردی هستی. کوتاه، دقیق و شفاف جواب می‌دهی و از توضیحات الکی و حاشیه دوری می‌کنی.",
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
      temperature: 0.6,
    }),
  });

  const data = await response.json();

  const answer =
    data?.choices?.[0]?.message?.content?.trim() ||
    "متأسفم، الان نتونستم پاسخی پیدا کنم. لطفاً بعداً دوباره امتحان کن 🌱";

  return answer;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  try {
    const body = req.body;

    const message = body?.message?.text || "";
    const chat_id = body?.message?.chat?.id;
    const user_id = body?.message?.from?.id;

    if (!message || !chat_id || !user_id) {
      return res.status(200).send("OK");
    }

    // پیام خوش‌آمد
    if (message === "/start") {
      const welcomeText =
        "سلام 👋 خوش اومدی!\n\n" +
        "من دستیار هوشمند chatgpt هستم 😊\n" +
        "برای اینکه سرویس برای همه پایدار بمونه، هر کاربر در هر ۶ ساعت می‌تونه **۱۰ پیام** ارسال کنه.\n\n" +
        "سؤالت رو واضح بنویس تا بهترین جواب رو بدم ✨";

      await sendMessage(chat_id, welcomeText);
      return res.status(200).json({ ok: true });
    }

    // ⏳ محدودیت ۱۰ پیام در هر ۶ ساعت
    const today = new Date().toISOString().slice(0, 10); // فقط برای نظم کلید
    const key = `limit:${user_id}:${today}`;

    let count = await redis.get(key);

    if (count === null || typeof count === "undefined") {
      count = 0;
    } else {
      count = Number(count) || 0;
    }

    // اگر قبلاً سقف پر شده
    if (count >= 10) {
      const limitText =
        "دوست خوبم 🌱\n\n" +
        "در این بازه‌ی حدوداً ۶ ساعته به سقف ۱۰ پیام رسیدی.\n" +
        "برای اینکه ربات برای همه پایدار و رایگان بمونه، لطفاً چند ساعت بعد دوباره برگرد 💚";
      await sendMessage(chat_id, limitText);
      return res.status(200).json({ ok: true });
    }

    // افزایش شمارش و تنظیم انقضا ۶ ساعته (۶ * ۶۰ * ۶۰ ثانیه)
    count += 1;
    await redis.set(key, count, { ex: 60 * 60 * 6 });

    // گرفتن جواب از Groq
    const answer = await askGroq(message);

    // ارسال جواب به کاربر
    await sendMessage(chat_id, answer);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Eitaa webhook error:", error);

    try {
      const chat_id = req.body?.message?.chat?.id;
      if (chat_id) {
        await sendMessage(
          chat_id,
          "متأسفم، یک خطای موقتی رخ داد. لطفاً چند دقیقه‌ی دیگه دوباره امتحان کن 🙏"
        );
      }
    } catch (e) {
      console.error("Error while sending fallback message:", e);
    }

    return res.status(200).json({ ok: false });
  }
}
