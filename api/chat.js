// api/chat.js
import { Redis } from "@upstash/redis";

// ⚙️ تنظیمات محدودیت
const WINDOW_SECONDS = 6 * 60 * 60;
const MAX_MESSAGES = 10;

let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

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

// ⭐⭐⭐ پاکسازی خروجی — جلوگیری از کلمات عجیب ⭐⭐⭐
function cleanText(text) {
  return text
    // حذف حروف غیر فارسی + جلوگیری از چینی/روسی/اروپایی
    .replace(/[^\u0600-\u06FF\s0-9.,!?؟!]/g, "")
    // مرتب کردن فاصله‌ها
    .replace(/\s+/g, " ")
    .trim();
}

// 🧠 مدل‌ها
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gpt-oss-20b",
];

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function askGroq(userMessage) {
  if (!GROQ_API_KEY) {
    return "کلید سرویس هوش مصنوعی تنظیم نشده است. لطفاً بعداً امتحان کن.";
  }

  const systemPrompt = `
تو یک دستیار هوش مصنوعی فارسی‌زبان، مهربان، دقیق و عمل‌گرا هستی.

قوانین خیلی مهم:
1) فقط و فقط به زبان فارسی روان جواب بده.
2) از نوشتن کلمات انگلیسی، فینگلیش یا کلمات عجیب (مثل proceso، about، způsob، ng走 و...) کاملاً خودداری کن.
3) اگر کاربر کلمهٔ انگلیسی نوشت (مثل Instagram، Canva، AI)،
   تو فقط همان کلمه را به همان شکل تکرار کن و بقیهٔ جمله را کاملاً فارسی بنویس.
4) اگر در میانهٔ تولید متن احساس کردی کلمهٔ غیر فارسی در حال ساخته شدن است،
   آن را حذف کن و به جایش معادل فارسی طبیعی بنویس.
5) جمله‌ها باید کوتاه، واضح و بدون حاشیه باشند. پرچانگی نکن.
6) از کاربر دربارهٔ هویتش (این‌که کی هستی، شغلت چیه و...) سؤال نپرس؛
   مستقیم سراغ جواب برو.
7) فقط اگر سؤال کاربر خیلی مبهم بود، حداکثر یک سؤال کوتاه برای شفاف‌سازی بپرس؛
   در بقیهٔ موارد خودت یک فرض منطقی انتخاب کن و جواب بده.
8) لحن: محترمانه، صمیمی و کاربردی؛ مثل یک دوست باتجربه، نه مثل متن اداری خشک.
9) اگر کاربر خواست «چند پست» یا «چند ایده» بنویسی:
   - دقیقا همان تعداد را تولید کن (مثلاً ۵ پست)
   - هر پست را با «پست ۱:»، «پست ۲:» و ... جدا کن
   - هر پست شامل ۲ تا ۴ جملهٔ کوتاه باشد (بدون متن طولانی خسته‌کننده).
10) از ایموجی فقط در صورت درخواست کاربر استفاده کن، آن هم حداکثر دو ایموجی در کل پاسخ.
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
      let answer =
        data?.choices?.[0]?.message?.content?.trim() ||
        "نتوانستم پاسخ مناسب پیدا کنم.";

      // 🔥 پاکسازی قبل از خروجی
      const finalText = cleanText(answer);
      return finalText;

    } catch (err) {
      console.error(`Groq failed (${model})`, err);
      continue;
    }
  }

  return "در حال حاضر سرویس در دسترس نیست. کمی بعد دوباره امتحان کن.";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  const body = req.body || {};
  const userMessage =
    body.text ||
    body.message ||
    body?.message?.text ||
    "";

  if (!userMessage || typeof userMessage !== "string") {
    return res.status(400).json({
      ok: false,
      answer: "متن پیام دریافت نشد.",
    });
  }

  // IP برای محدودیت
  const xff = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(xff) ? xff[0] : xff?.split(",")[0]) ||
    req.socket?.remoteAddress ||
    "unknown";

  try {
    const limit = await checkRateLimit(ip);
    if (!limit.allowed) {
      return res.status(200).json({
        ok: true,
        answer:
          "در هر ۶ ساعت فقط ۱۰ پیام می‌توانی ارسال کنی. لطفاً کمی بعد دوباره تلاش کن.",
      });
    }
  } catch (e) {}

  const answer = await askGroq(userMessage);

  return res.status(200).json({
    ok: true,
    answer,
  });
}
