// api/chat.js
import { Redis } from "@upstash/redis";

/* ============================
   ⚙️ تنظیمات محدودیت پیام
   ============================ */

const WINDOW_SECONDS = 6 * 60 * 60; // ۶ ساعت
const MAX_MESSAGES = 5;             // هر کاربر ۵ پیام در ۶ ساعت

let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// چک‌کردن ریت‌لیمیت
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

/* ============================
   🧼 پاکسازی ملایم خروجی
   ============================ */

function cleanText(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/\u200c/g, "")    // حذف نیم‌فاصله‌ی یونیکدی
    .replace(/[ \t]+/g, " ")   // چند فاصله → یکی
    .trim();
}

/* ============================
   🚫 کلمات و موضوعات ممنوع
   ============================ */

const BLOCKED_KEYWORDS = [
  // جنسی
  "سکس","sex","سکسی","رابطه جنسی","رابطه نامشروع","پورن","porn","پورنو",
  "فیلم مستهجن","مستهجن","برهنه","برهنگی","نیمه برهنه","همخوابی","هم خواب",
  "زناشویی","تحریک جنسی","فانتزی جنسی","ارضاء","ارضا","خودارضایی","خود ارضایی",
  "رابطه نامتعارف","شهوت","لب گرفتن","بوسه جنسی","حریم خصوصی زناشویی",
  "همجنسگرا","لزبین","gay","گی","فحشا","تن فروشی","تن‌فروشی",

  // توهین به مقدسات
  "توهین به دین","توهین به اسلام","توهین به شیعه","توهین به تشیع",
  "توهین به قرآن","توهین به پیامبر","توهین به اهل بیت","اهانت به مقدسات",

  // خشونت و آسیب
  "آموزش خودکشی","نحوه خودکشی","خودکشی","آسیب زدن به خود","آسیب به دیگران",
  "قتل","ساخت مواد مخدر","مصرف مواد مخدر","ساخت بمب","ساخت اسلحه",

  // نفرت‌پراکنی
  "نفرت از عرب","نفرت از فارس","نفرت از ترک","نفرت از افغان",
  "نژادپرستی","تحقیر قومیت",

  // براندازی و آشوب
  "براندازی","سرنگونی","آشوب","اغتشاش","کودتا","شورش خیابانی",
  "اعتراض خشونت‌آمیز","ضد جمهوری اسلامی","ضد نظام","ضد حکومت"
];

const BLOCKED_PHRASES = [
  /ضد\s+(نظام|حکومت|جمهوری\s+اسلامی)/,
  /(کپشن|متن|پست).*(براندازی|سرنگونی|آشوب|اغتشاش)/,
];

/* ============================
   🤖 تنظیم مدل‌های Groq (ساده‌تر)
   ============================ */

// فقط یک مدل سبک و ارزان:
const GROQ_MODELS = [
  "llama-3.1-8b-instant",
];

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// چرخش بین چند API Key برای پخش فشار
const GROQ_API_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY1,
  process.env.GROQ_API_KEY2,
  process.env.GROQ_API_KEY3,
  process.env.GROQ_API_KEY4,
  process.env.GROQ_API_KEY5,
  process.env.GROQ_API_KEY6,
].filter(Boolean);

// آخرین ایندکس کلید موفق
let lastGroqKeyIndex = 0;
// کلیدهایی که خطای جدی دادند
const badGroqKeyIndexes = new Set();

/* ============================
   💬 پاسخ‌های محلی ساده (بدون توکن)
   ============================ */

function localSimpleReply(text) {
  if (!text || typeof text !== "string") return null;

  const t = text.trim().toLowerCase();
  const len = t.length;
  const includesAny = (words) => words.some((w) => t.includes(w));

  // فقط برای پیام‌های خیلی کوتاه
  if (len <= 25) {
    if (t === "سلام" || t.startsWith("سلام ")) {
      return "سلام عزیز دلم 🌹 من ربات هوش مصنوعی هستم. کامل و واضح بگو چی می‌خوای 🤍";
    }

    if (includesAny(["این ربات چیه","چیکار میکنی","کار تو چیه","برا چی ساختنت"])) {
      return "من یک ربات فارسی‌زبانم برای ایده‌دادن، نوشتن متن، کپشن، و کمک به کارهای محتوایی 🌟";
    }

    if (includesAny(["چند تا پیام","محدودیت پیام","سقف پیام"])) {
      return "هر کاربر می‌تونه در هر ۶ ساعت تا ۵ پیام بفرسته 💛";
    }

    if (t === "مرسی" || includesAny(["ممنون","دمت گرم","خیلی خوبی"])) {
      return "قربانت الهه‌ی عزیزم 🌹 خوشحالم که به دردت می‌خورم 🤍";
    }
  }

  return null;
}

/* ============================
   🔁 انتخاب کلید بعدی (Round-robin)
   ============================ */

function getNextGroqKeyIndex() {
  if (!GROQ_API_KEYS.length) return null;

  const total = GROQ_API_KEYS.length;
  for (let step = 0; step < total; step++) {
    const idx = (lastGroqKeyIndex + step) % total;
    if (!badGroqKeyIndexes.has(idx)) {
      return idx;
    }
  }
  return null; // همه کلیدها موقتاً خراب
}

/* ============================
   📡 تماس با Groq
   ============================ */

async function askGroq(userMessage) {
  if (!GROQ_API_KEYS.length) {
    return {
      answer: "هیچ کلید سرویس Groq تنظیم نشده است.",
      tokensUsed: 0,
    };
  }

  const systemPrompt = `
تو یک دستیار هوش مصنوعی فارسی‌زبان هستی.
فقط فارسی روان و قابل‌فهم بنویس، مگر اینکه کاربر صراحتاً متن انگلیسی بخواهد.

قوانین:
- در موضوعات جنسی، خشونت شدید، مواد مخدر، براندازی و موارد حساس سیاسی پاسخ نده
  و محترمانه بگو نمی‌توانی کمک کنی.
- توهین، تمسخر، تحقیر، نژادپرستی و نفرت‌پراکنی ممنوع است.

لحن:
- محترم، صمیمی و گرم مثل یک دوست مهربان.
- می‌توانی اموجی ملایم استفاده کنی، اما افراط نکن.

طول پاسخ:
- پیش‌فرض: ۲ تا ۵ جمله‌ی واضح، کاربردی و مستقیم.
- اگر کاربر گفت "کامل توضیح بده"، "مفصل"، "قدم به قدم" یا "تحلیل علمی"،
  می‌توانی طولانی‌تر و جزئی‌تر توضیح بدهی.

اگر سوال مبهم بود، کوتاه و مؤدبانه از کاربر بخواه دقیق‌تر توضیح بده.
`;

  const totalKeys = GROQ_API_KEYS.length;

  // حداکثر به تعداد کلیدها تلاش می‌کنیم
  for (let keyTry = 0; keyTry < totalKeys; keyTry++) {
    const keyIndex = getNextGroqKeyIndex();
    if (keyIndex === null) break;

    const apiKey = GROQ_API_KEYS[keyIndex];

    for (const model of GROQ_MODELS) {
      try {
        const response = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
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
          // خطای جدی → این کلید رو موقتاً کنار بگذار
          if ([401, 403, 429].includes(response.status)) {
            badGroqKeyIndexes.add(keyIndex);
            break; // می‌رویم سراغ کلید بعدی
          }
          // خطای دیگر → مدل بعدی
          continue;
        }

        const data = await response.json();
        const answerRaw =
          data?.choices?.[0]?.message?.content?.trim() ||
          "نتوانستم پاسخ مناسب پیدا کنم.";

        const finalText = cleanText(answerRaw);

        // این کلید موفق بود → ایندکس را اینجا نگه دار
        lastGroqKeyIndex = keyIndex;

        return { answer: finalText };
      } catch (err) {
        // مشکل شبکه‌ای → مدل بعدی یا کلید بعدی
        continue;
      }
    }
  }

  // اگر هیچ کلیدی جواب نداد
  return {
    answer: "در حال حاضر سرویس هوش مصنوعی در دسترس نیست. کمی بعد دوباره امتحان کن عزیزم 🌹",
  };
}

/* ============================
   🧠 هندلر اصلی API
   ============================ */

export default async function handler(req, res) {
  // اجازه می‌دیم GET زنده‌بودن رو چک کنه
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

  // ۱) فیلتر محتواهای ممنوع
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

  // ۲) پاسخ‌های محلی بدون مصرف توکن
  const local = localSimpleReply(userMessage);
  if (local) {
    return res.status(200).json({ ok: true, answer: local });
  }

  // ۳) ساخت کلید ریت‌لیمیت (user یا IP)
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

  // ۴) محدودیت ۵ پیام در ۶ ساعت
  const limit = await checkRateLimit(rateKey);
  if (!limit.allowed) {
    return res.status(200).json({
      ok: true,
      answer:
        "در هر ۶ ساعت فقط ۵ پیام می‌تونی بفرستی عزیزم 🌹 بعد از این مدت دوباره فعال می‌شی.",
    });
  }

  // ۵) تماس با Groq
  const { answer } = await askGroq(userMessage);

  return res.status(200).json({
    ok: true,
    answer,
  });
}
