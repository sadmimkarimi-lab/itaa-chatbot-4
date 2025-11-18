// api/chat.js
import { Redis } from "@upstash/redis";

// ⚙️ تنظیمات محدودیت
const WINDOW_SECONDS = 6 * 60 * 60; // ۶ ساعت
const MAX_MESSAGES = 10;            // حداکثر ۱۰ پیام در هر ۶ ساعت

// ✅ اتصال به Upstash Redis (اگر تنظیم نشده باشد، محدودیت غیرفعال می‌شود)
let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// 🧮 بررسی محدودیت استفاده بر اساس IP
async function checkRateLimit(ip) {
  if (!redis) {
    // اگر رِدیس تنظیم نشده، محدودیت را نادیده بگیر
    return { allowed: true };
  }

  const key = `rate:${ip}`;
  let count = await redis.get(key);

  if (count === null) {
    // اولین پیام در این بازه
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

// 🧠 مدل‌های Groq به ترتیب اولویت
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gpt-oss-20b",
];

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// 📨 پرسیدن از Groq با فallback بین مدل‌ها
async function askGroq(userMessage) {
  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY تعریف نشده است.");
    return "کلید اتصال به سرویس هوش مصنوعی تنظیم نشده است. لطفاً بعداً دوباره امتحان کن.";
  }

const systemPrompt = `
تو یک دستیار هوش مصنوعی فارسی‌زبان، مهربان، دقیق و عمل‌گرا هستی.

قواعد مهم:
- مستقیم برو سر جواب؛ اول یک پاسخ واضح و خلاصه بده، بعد اگر لازم بود نکات تکمیلی را اضافه کن.
- از کاربر نپرس «چه کسی هستی»، نام، سن، شغل و هیچ سؤال شخصی مشابهی.
- فقط وقتی سؤال کاربر خیلی مبهم بود، حداکثر یک سؤال کوتاه برای شفاف شدن بپرس؛
  در بقیهٔ موارد خودت یک فرض منطقی انتخاب کن و بر همان اساس جواب بده.
- لحن: محترمانه، صمیمی و خودمانی، اما حرفه‌ای و بدون پرچانگی.
- جواب‌ها را کاربردی و تا حد امکان مرحله‌به‌مرحله بده؛
  اما متن را الکی طولانی نکن و سر اصل موضوع برو.
- اگر حس کردی کاربر خسته یا ناامید است، در حد یکی دو جمله کوتاه به او انگیزه بده؛
  می‌توانی حداکثر دو اموجی مناسب استفاده کنی (نه بیشتر).
- اگر موضوع سؤال مربوط به تولید محتوا، آموزش، کسب‌وکار، ایتا یا طاویتا بود،
  مثل یک مربی کاربلد و عمل‌گرا راهنمایی‌اش کن.
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
        console.error(`Groq error (${model}):`, await response.text());
        continue; // برو مدل بعدی
      }

      const data = await response.json();
      const answer =
        data?.choices?.[0]?.message?.content?.trim() ||
        "نتوانستم پاسخ مناسبی پیدا کنم، لطفاً سؤال را کمی واضح‌تر بپرس.";

      return answer;
    } catch (err) {
      console.error(`Groq request failed (${model}):`, err);
      // مدل بعدی
    }
  }

  // اگر همه مدل‌ها خطا دادند
  return "در حال حاضر به سرویس هوش مصنوعی دسترسی ندارم. لطفاً چند دقیقه بعد دوباره تلاش کن.";
}

export default async function handler(req, res) {
  // فقط POST
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  // پیام کاربر را از بدنه پیدا کن (حالت‌های مختلف)
  const body = req.body || {};
  const userMessage =
    body.text ||            // فرانت فعلی: { text: "..." }
    body.message ||         // اگر جایی { message: "..." } بفرستی
    body?.message?.text ||  // ساختارهای شبیه وبهوک
    "";

  if (!userMessage || typeof userMessage !== "string") {
    console.log("No user message in payload:", body);
    return res.status(400).json({
      ok: false,
      answer: "متن پیام دریافت نشد. لطفاً دوباره امتحان کن.",
    });
  }

  // IP کاربر برای محدودیت (حدسی، بر اساس X-Forwarded-For)
  const xff = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(xff) ? xff[0] : xff?.split(",")[0]) ||
    req.socket?.remoteAddress ||
    "unknown-ip";

  // ⏱ اعمال محدودیت
  try {
    const limit = await checkRateLimit(ip);
    if (!limit.allowed) {
      return res.status(200).json({
        ok: true,
        answer:
          "برای اینکه سرویس پایدار بماند، در هر بازه‌ی ۶ ساعته فقط می‌توانی ۱۰ پیام بفرستی. " +
          "الان به سقف این تعداد رسیده‌ای. لطفاً بعد از مدتی دوباره امتحان کن 🌿",
      });
    }
  } catch (err) {
    console.error("Rate limit check failed:", err);
    // اگر محدودیت خراب شد، اجازه می‌دیم ادامه بده تا کاربر اذیت نشه
  }

  // 🧠 گرفتن پاسخ از Groq
  const answer = await askGroq(userMessage);

  // پاسخ طبق قرارداد فرانت: { ok: true, answer: "..." }
  return res.status(200).json({
    ok: true,
    answer,
  });
}
