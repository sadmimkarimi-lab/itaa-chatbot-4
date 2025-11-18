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
