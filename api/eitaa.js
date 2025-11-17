// api/eitaa.js

// ✅ تنظیمات محدودیت
const WINDOW_MS = 6 * 60 * 60 * 1000; // ۶ ساعت
const MAX_MESSAGES = 10; // حداکثر ۱۰ پیام در هر بازه

// ✅ ذخیره وضعیت کاربران در حافظه سرور
const usageStore =
  globalThis.__eitaaUsageStore || (globalThis.__eitaaUsageStore = new Map());

// مدل‌های Groq به ترتیب اولویت
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gpt-oss-20b",
];

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// 📨 ارسال پیام به ایتا
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

// 💚 تبدیل میلی‌ثانیه به متن خوانا
function formatRemaining(ms) {
  if (ms <= 0) return "کمتر از یک دقیقه";

  const totalMinutes = Math.ceil(ms / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} دقیقه`;
  if (minutes === 0) return `${hours} ساعت`;
  return `${hours} ساعت و ${minutes} دقیقه`;
}

// ⏳ چک‌کردن و به‌روزرسانی محدودیت
function checkAndUpdateLimit(userId) {
  const now = Date.now();
  let usage = usageStore.get(userId);

  if (!usage) {
    usage = { windowStart: now, count: 0 };
  }

  const elapsed = now - usage.windowStart;

  // اگر ۶ ساعت گذشته، پنجره جدید
  if (elapsed > WINDOW_MS) {
    usage = { windowStart: now, count: 0 };
  }

  if (usage.count >= MAX_MESSAGES) {
    const remainingMs = WINDOW_MS - (now - usage.windowStart);
    return {
      allowed: false,
      remainingMs: remainingMs > 0 ? remainingMs : 0,
    };
  }

  usage.count += 1;
  usageStore.set(userId, usage);

  return { allowed: true, remainingMs: 0, count: usage.count };
}

// 🧠 صدا زدن Groq با یک مدل
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
            "تو یک دستیار فارسی‌زبان مهربان و کاربردی هستی. جواب‌ها را واضح، مفید، عملی و بدون حاشیه‌های اضافی بده.",
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

// 🔁 fallback بین مدل‌های مختلف Groq
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

    // ✅ /start
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

    // ✅ اول محدودیت را چک کنیم
    const limit = checkAndUpdateLimit(userId);

    if (!limit.allowed) {
      const remainingText = formatRemaining(limit.remainingMs);

      await sendMessage(
        chatId,
        "دوست خوبم 🌱\n" +
          `در هر بازه‌ی ۶ ساعته فقط می‌تونی ${MAX_MESSAGES} پیام ارسال کنی.\n` +
          `الان سقف این بازه‌ات پر شده.\n` +
          `زمان تقریبی باقی‌مانده تا فعال شدن دوباره: ${remainingText} ⏳`,
        replyToId
      );

      return res.status(200).json({ ok: true, limited: true });
    }

    // 🧠 گرفتن جواب از Groq
    const answer = await askGroq(text);

    await sendMessage(chatId, answer, replyToId);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    try {
      const chatId = req.body?.message?.chat?.id;
      const replyToId = req.body?.message?.message_id;
      if (chatId) {
        await sendMessage(
          chatId,
          "متأسفم، یک خطای موقتی رخ داد. چند دقیقه‌ی دیگر دوباره امتحان کن 🙏",
          replyToId
        );
      }
    } catch (e) {
      console.error("خطا در ارسال پیام خطا:", e);
    }

    return res.status(500).json({ ok: false });
  }
}
