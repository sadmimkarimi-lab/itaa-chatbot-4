// api/chat.js
import { Redis } from "@upstash/redis";

// ⚙️ تنظیمات محدودیت پیام
const WINDOW_SECONDS = 6 * 60 * 60; // ۶ ساعت
const MAX_MESSAGES = 10;            // حداکثر ۱۰ پیام در هر ۶ ساعت برای هر IP

// ⚙️ سقف مصرف روزانه‌ی توکن برای کل ربات
const DAILY_TOKEN_LIMIT = 450000;

let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// =======================
//  محدودیت تعداد پیام IP
// =======================
async function checkRateLimit(ip) {
  if (!redis) return { allowed: true };

  const key = `rate:${ip}`;
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
//     سقف روزانه توکن
// =======================
function getTodayKey() {
  const today = new Date().toISOString().slice(0, 10);
  return `tokens:${today}`;
}

async function addTokensUsed(tokens) {
  if (!redis || !tokens) return;
  const key = getTodayKey();
  await redis.incrby(key, tokens);
  await redis.expire(key, 60 * 60 * 27);
}

async function isDailyLimitReached() {
  if (!redis) return false;
  const key = getTodayKey();
  const used = Number((await redis.get(key)) || 0);
  return used >= DAILY_TOKEN_LIMIT;
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
// ⚠️ ۷۰B حذف شد (مصرف بالا، قطع سرویس)
// اکنون فقط مدل‌های پایدار و سبک باقی مانده‌اند
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

  // 1) سلام
  if (t === "سلام" || t.startsWith("سلام ")) {
    return "سلام عزیز دلم 🌹 من ربات هوش مصنوعی هستم. کامل و واضح بگو چی می‌خوای 🤍";
  }

  // 2) معرفی ربات
  if (includesAny(["این ربات چیه","چیکار میکنی","کار تو چیه","برا چی ساختنت"])) {
    return "من یک ربات فارسی‌زبان هستم برای تولید متن، کپشن، ایده، و کمک به کارهای محتوایی 🌹";
  }

  // 3) محدودیت پیام
  if (includesAny(["چند تا پیام","محدودیت پیام","سقف پیام"])) {
    return "هر کاربر می‌تونه در هر ۶ ساعت تا ۱۰ پیام ارسال کنه 💛";
  }

  // 4) تشکر
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

      if (!response.ok) {
        console.error(`Groq model error (${model}) →`, await response.text());
        continue;
      }

      const data = await response.json();
      const answer =
        data?.choices?.[0]?.message?.content?.trim() ||
        "نتوانستم پاسخ مناسب پیدا کنم.";

      const finalText = cleanText(answer);
      const tokensUsed =
        data?.usage?.total_tokens ||
        ((data?.usage?.prompt_tokens || 0) +
          (data?.usage?.completion_tokens || 0));

      return { answer: finalText, tokensUsed };
    } catch (err) {
      console.error(`Groq failed (${model})`, err);
      continue;
    }
  }

  return {
    answer: "در حال حاضر سرویس در دسترس نیست. بعداً دوباره امتحان کن 🌹",
    tokensUsed: 0,
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
    body?.message ||
    body?.message?.text ||
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

  // سقف روزانه
  if (await isDailyLimitReached()) {
    return res.status(200).json({
      ok: true,
      answer:
        "ظرفیت استفاده از ربات برای امروز تکمیل شده است 🌹 لطفاً فردا دوباره امتحان کن.",
    });
  }

  // محدودیت پیام
  const xff = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(xff) ? xff[0] : xff?.split(",")[0]) ||
    req.socket?.remoteAddress ||
    "unknown";

  const limit = await checkRateLimit(ip);
  if (!limit.allowed) {
    return res.status(200).json({
      ok: true,
      answer:
        "در هر ۶ ساعت فقط ۱۰ پیام می‌توانی ارسال کنی. لطفاً کمی بعد دوباره تلاش کن 🌹",
    });
  }

  // تماس با مدل
  const { answer, tokensUsed } = await askGroq(userMessage);

  await addTokensUsed(tokensUsed);

  return res.status(200).json({
    ok: true,
    answer,
  });
}
