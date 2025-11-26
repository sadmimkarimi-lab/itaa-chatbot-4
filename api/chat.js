// api/chat.js
import { Redis } from "@upstash/redis";

// ⚙️ تنظیمات محدودیت پیام
const WINDOW_SECONDS = 6 * 60 * 60; // ۶ ساعت
const MAX_MESSAGES = 5;             // هر کاربر ۵ پیام در ۶ ساعت

let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// =======================
//  محدودیت تعداد پیام برای هر کاربر
// =======================
async function checkRateLimit(keySuffix) {
  if (!redis) return { allowed: true };

  const key = `rate:${keySuffix}`;
  let count = await redis.get(key);

  if (count === null) {
    await redis.set(key, 1, { ex: WINDOW_SECONDS });
    return { allowed: true, remaining: MAX_MESSAGES - 1 };
  }

  count = Number(count);

  if (count >= MAX_MESSAGES) {
    return { allowed: false, remaining: 0 };
  }

  await redis.set(key, count + 1, { ex: WINDOW_SECONDS });
  return { allowed: true, remaining: MAX_MESSAGES - (count + 1) };
}

// =======================
//    پاکسازی خروجی
// =======================
function cleanText(text) {
  return text
    .replace(/[^\u0600-\u06FF\s0-9.,!?؟!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// =======================
//   کلمات و موضوعات ممنوع
// =======================
const BLOCKED_KEYWORDS = [
  "سکس","sex","سکسی","رابطه جنسی","رابطه نامشروع","پورن","porn","پورنو",
  "فیلم مستهجن","مستهجن","برهنه","برهنگی","نیمه برهنه","همخوابی","هم خواب",
  "زناشویی","تحریک جنسی","فانتزی جنسی","ارضاء","ارضا","خودارضایی","خود ارضایی",
  "رابطه نامتعارف","شهوت","لب گرفتن","بوسه جنسی","حریم خصوصی زناشویی",
  "همجنسگرا","لزبین","gay","گی","فحشا","تن فروشی","تن‌فروشی",

  "توهین به دین","توهین به اسلام","توهین به شیعه","توهین به تشیع",
  "توهین به قرآن","توهین به پیامبر","توهین به اهل بیت","اهانت به مقدسات",

  "آموزش خودکشی","نحوه خودکشی","خودکشی","آسیب زدن به خود","آسیب به دیگران",
  "قتل","ساخت مواد مخدر","مصرف مواد مخدر","ساخت بمب","ساخت اسلحه",

  "نفرت از عرب","نفرت از فارس","نفرت از ترک","نفرت از افغان",
  "نژادپرستی","تحقیر قومیت",

  "براندازی","سرنگونی","آشوب","اغتشاش","کودتا","شورش خیابانی",
  "اعتراض خشونت‌آمیز","ضد جمهوری اسلامی","ضد نظام","ضد حکومت"
];

const BLOCKED_PHRASES = [
  /ضد\s+(نظام|حکومت|جمهوری\s+اسلامی)/,
  /(کپشن|متن|پست).*(براندازی|سرنگونی|آشوب|اغتشاش)/,
];

// =======================
//     مدل‌ها — نسخه پایدار
// =======================
const GROQ_MODELS = [
  "llama-3.1-8b-instant",
  "gpt-oss-20b",
];

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// =======================
// پاسخ‌های ساده محلی (بدون توکن)
// =======================
function localSimpleReply(text) {
  if (!text || typeof text !== "string") return null;
  const t = text.trim().toLowerCase();
  const includesAny = (words) => words.some((w) => t.includes(w));

  if (t === "سلام" || t.startsWith("سلام ")) {
    return "سلام عزیز دلم 🌹 من ربات هوش مصنوعی هستم. کامل و واضح بگو چی می‌خوای 🤍";
  }

  if (includesAny(["این ربات چیه","چیکار میکنی","کار تو چیه","برا چی ساختنت"])) {
    return "من یک ربات فارسی‌زبان هستم برای تولید متن، کپشن، ایده، و کمک به کارهای محتوایی 🌹";
  }

  if (includesAny(["چند تا پیام","محدودیت پیام","سقف پیام"])) {
    return "هر کاربر می‌تونه در هر ۶ ساعت تا ۵ پیام ارسال کنه 💛";
  }

  if (t === "مرسی" || includesAny(["ممنون","دمت گرم","خیلی خوبی"])) {
    return "قربانت عزیزم 🌹 خوشحالم که به دردت می‌خورم 🤍";
  }

  return null;
}

// =======================
// تماس با مدل Groq
// =======================
async function askGroq(userMessage) {
  if (!GROQ_API_KEY) {
    return {
      answer: "کلید سرویس هوش مصنوعی تنظیم نشده است.",
      tokensUsed: 0,
    };
  }

  const systemPrompt = `
تو یک دستیار هوش مصنوعی فارسی‌زبان، محترم، دقیق و آرام هستی.
فقط فارسی روان بنویس. از کلمات لاتین یا عجیب خودداری کن.
قوانین اخلاقی، دینی، ملی و امنیتی رعایت شود.
در موضوعات جنسی، خشونت، مواد مخدر، و سیاست تند پاسخ نده.
اگر موضوع سالم بود، بهترین پاسخ کوتاه و کاربردی را بده.
`;

  for (const model of GROQ_MODELS) {
    try {
      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        }),
      });

      if (!response.ok) continue;

      const data = await response.json();
      const answer =
        data?.choices?.[0]?.message?.content?.trim() ||
        "نتوانستم پاسخ مناسب پیدا کنم.";

      const finalText = cleanText(answer);

      return { answer: finalText };
    } catch (err) {
      continue;
    }
  }

  return {
    answer: "در حال حاضر سرویس در دسترس نیست. بعداً دوباره امتحان کن 🌹",
  };
}

// =======================
//    هندلر اصلی
// =======================
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  const body = req.body || {};
  const userMessage =
    body?.text ||
    body?.message?.text ||
    body?.message ||
    "";

  if (!userMessage || typeof userMessage !== "string") {
    return res.status(400).json({
      ok: false,
      answer: "متن پیام دریافت نشد.",
    });
  }

  const lowered = userMessage.toLowerCase();
  const blockedByKeyword = BLOCKED_KEYWORDS.some((w) =>
    lowered.includes(w.toLowerCase())
  );
  const blockedByPhrase = BLOCKED_PHRASES.some((p) => p.test(lowered));

  if (blockedByKeyword || blockedByPhrase) {
    return res.status(200).json({
      ok: true,
      answer:
        "در این زمینه نمی‌توانم پاسخ بدهم. اگر موضوع دیگری داشتی با عشق کمک می‌کنم 🌹",
    });
  }

  // پاسخ‌های ساده بدون توکن
  const local = localSimpleReply(userMessage);
  if (local) {
    return res.status(200).json({ ok: true, answer: local });
  }

  // محدودیت بر اساس user_id
  const userId =
    body?.message?.from_id ||
    body?.from_id ||
    body?.user_id ||
    body?.chat_id ||
    null;

  let rateKey = "guest";

  if (userId) {
    rateKey = `user:${userId}`;
  } else {
    const xff = req.headers["x-forwarded-for"];
    const fallbackIp =
      (Array.isArray(xff) ? xff[0] : xff?.split(",")[0]) ||
      req.socket?.remoteAddress ||
      "unknown";
    rateKey = `ip:${fallbackIp}`;
  }

  const limit = await checkRateLimit(rateKey);
  if (!limit.allowed) {
    return res.status(200).json({
      ok: true,
      answer:
        "در هر ۶ ساعت فقط ۵ پیام می‌تونی بفرستی عزیزم 🌹 بعد از این مدت دوباره فعال می‌شی.",
    });
  }

  // تماس با مدل
  const { answer } = await askGroq(userMessage);

  return res.status(200).json({
    ok: true,
    answer,
  });
}
