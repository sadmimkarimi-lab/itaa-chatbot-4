// api/chat.js

// ⏳ تنظیمات محدودیت
const WINDOW_MS = 6 * 60 * 60 * 1000; // ۶ ساعت
const MAX_MESSAGES = 10; // حداکثر ۱۰ پیام در هر بازه

// 🧠 ذخیره‌ی وضعیت کاربران در حافظه‌ی سرور (اینستنس ورسل)
const usageStore =
  globalThis.__eitaaUsageStore || (globalThis.__eitaaUsageStore = {});

// 🔑 مدل‌ها و API کی Groq
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gpt-oss-20b",
];

// ⚙️ ارسال پیام به ایتا
async function sendMessage(chatId, text, replyToId) {
  const url = `https://eitaayar.ir/bot${process.env.EITAA_BOT_TOKEN}/sendMessage`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_to_message_id: replyToId,
      }),
    });
  } catch (err) {
    console.error("خطا در ارسال پیام به ایتا:", err);
  }
}

// 🧠 گرفتن جواب از Groq با چند مدل پشت سر هم
async function askGroq(text) {
  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY تنظیم نشده است");
    return "کلید اتصال به مدل هوش مصنوعی تنظیم نشده است.";
  }

  for (const model of GROQ_MODELS) {
    try {
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
                "تو یک دستیار فارسی‌زبان مهربان و کاربردی هستی. جواب‌ها را واضح، مفید و عملی بده.",
            },
            { role: "user", content: text },
          ],
        }),
      });

      const data = await resp.json();

      const content = data?.choices?.[0]?.message?.content;
      if (content) return content;
    } catch (err) {
      console.error(`خطا در مدل ${model}:`, err);
    }
  }

  return "متأسفانه الان نمی‌توانم جواب بدهم، لطفاً کمی بعد دوباره امتحان کن 🌿";
}

// 📥 هندلر اصلی برای ایتا
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).send("OK");
    }

    const update = req.body;
    const message = update?.message;

    if (!message) {
      console.log("No message in Eitaa payload");
      return res.status(200).json({ ok: true });
    }

    const text = message.text || "";
    const chatId = message.chat?.id;
    const userId = message.from?.id || chatId;
    const replyToId = message.message_id;

    if (!text || !chatId) {
      console.log("Invalid payload (no text or chatId)");
      return res.status(200).json({ ok: true });
    }

    // ⏳ محدودیت ۱۰ پیام در ۶ ساعت برای هر کاربر
    const now = Date.now();
    if (!usageStore[userId]) usageStore[userId] = [];
    usageStore[userId] = usageStore[userId].filter(
      (time) => now - time < WINDOW_MS
    );

    if (usageStore[userId].length >= MAX_MESSAGES) {
      const limitMsg =
        "مهربون من 🌿\n" +
        "برای اینکه سرویس پایدار بمونه، در هر بازه‌ی ۶ ساعته می‌تونی حداکثر ۱۰ پیام بفرستی ⏳\n" +
        "الان سهم این بازه‌ات تموم شده.\n" +
        "چند ساعت دیگه دوباره برگرد، با کمال میل ادامه می‌دیم 💚";

      await sendMessage(chatId, limitMsg, replyToId);
      return res.status(200).json({ ok: true });
    }

    // ثبت این پیام در لیست کاربر
    usageStore[userId].push(now);

    // 🧠 گرفتن جواب از Groq
    const answer = await askGroq(text);

    // 📤 ارسال جواب به خود ایتا
    await sendMessage(chatId, answer, replyToId);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Internal error:", err);
    return res.status(200).json({ ok: true });
  }
}
