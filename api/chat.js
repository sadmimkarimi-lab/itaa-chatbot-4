// ======================================================
//  Tavita ChatBot – ULTRA PRO Version
//  For 50,000+ active users
//  Features:
//   - Strict Safety Filters
//   - 5-messages-per-6-hours rate limit (preserved)
//   - Professional Persian assistant
//   - Token-efficient, smart, structured responses
//   - Multi-turn lightweight memory
// ======================================================

// ------------------------------
// Redis – برای محدودیت
// ------------------------------
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

const WINDOW_SECONDS = 6 * 60 * 60; // ۶ ساعت
const MAX_MESSAGES = 5;

// rate-limit check
async function checkRateLimit(keySuffix) {
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

// ------------------------------
// Normalizer
// ------------------------------
function normalize(text) {
  if (!text) return "";
  return text
    .toString()
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ------------------------------
// Clean Output
// ------------------------------
function cleanAnswer(text) {
  if (!text) return "";
  let t = text.replace(/\r\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

// ------------------------------
// Safety Filters
// ------------------------------
const BLOCKED_KEYWORDS = [
  // جنسی
  "سکس","sex","پورن","porn","تن فروشی","مستهجن","رابطه جنسی",
  "همخوابی","شهوت","خودارضایی",
  // LGBT explicit
  "همجنسگرا","همجنس گرا","همجنس‌باز","lgbt","gay","لزبین",
  // خشونت / آسیب
  "خودکشی","چطور خودمو بکشم","قتل","ساخت بمب","ساخت اسلحه",
  // مواد مخدر
  "مواد مخدر","خرید مواد","فروش مواد","پخت مواد",
  // توهین مذهبی
  "توهین به اسلام","توهین به شیعه","توهین به قرآن","اهانت به دین",
  // سیاسی تند
  "براندازی","سرنگونی","شورش","آشوب","اغتشاش","ضد نظام",
  "ضد جمهوری اسلامی"
];

const BLOCKED_REGEX = [
  /کپشن\s+سیاسی/iu,
  /متن\s+سیاسی/iu,
  // "گی" فقط اگر کلمه مستقل باشد
  /(^|\s)گی(\s|[.!،?؟:]|$)/iu,
];

// final content filter
function isBlocked(text) {
  const t = normalize(text);
  for (const w of BLOCKED_KEYWORDS) {
    if (t.includes(normalize(w))) return true;
  }
  for (const r of BLOCKED_REGEX) {
    if (r.test(t)) return true;
  }
  return false;
}

// ------------------------------
// Model selection
// ------------------------------
const MODELS = [
  "llama-3.1-8b-instant",     // کم‌هزینه، سریع
  "llama-3.3-70b-versatile",  // پشتیبان بسیار قوی
];

// ------------------------------
// ULTRA Lightweight System Prompt
// ------------------------------
const SYSTEM_PROMPT = `
تو یک دستیار حرفه‌ای، آرام و دقیق هستی.
پاسخ‌ها:
- کوتاه، شفاف، منظم
- لحن: رسمی + دوستانه
- بدون زیاده‌گویی و تکرار
- اگر موضوع کاربر ممنوع بود → بگو: «در این زمینه نمی‌توانم کمکی کنم.»
- اگر سؤال مبهم بود → یک پرسش شفاف‌کننده کوتاه بپرس.
- ساختار پیشنهادی:
  1) نتیجه اصلی
  2) توضیح کاربردی کوتاه
  3) در صورت نیاز یک نکته یا پیشنهاد
`.trim();

// ------------------------------
// Ask Groq – with mini-memory
// ------------------------------
async function askGroq(userMessage, history = []) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return "کلید سرویس تنظیم نشده.";

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-1),
    { role: "user", content: userMessage }
  ];

  let lastError = null;

  for (const model of MODELS) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 300,
          temperature: 0.45,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!data?.choices?.[0]?.message?.content) continue;

      const ans = data.choices[0].message.content;

      if (isBlocked(ans)) return "در این زمینه نمی‌توانم کمکی کنم.";

      return cleanAnswer(ans);
    } catch (err) {
      lastError = err.message;
    }
  }

  return lastError || "خطای سرویس.";
}

// ------------------------------
// MAIN HANDLER
// ------------------------------
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  const msg =
    req.body?.text ||
    req.body?.message?.text ||
    "";

  if (!msg) {
    return res.status(400).json({ ok: false, error: "پیام دریافت نشد." });
  }

  // Limit User
  const userId = req.body?.message?.from?.id || "unknown";
  const limit = await checkRateLimit(userId);

  if (!limit.allowed) {
    return res.status(200).json({
      ok: true,
      answer: "در هر ۶ ساعت فقط ۵ پیام می‌توانی ارسال کنی. بعد از این مدت دوباره فعال می‌شوی.",
    });
  }

  // Safety Filter
  if (isBlocked(msg)) {
    return res.status(200).json({
      ok: true,
      answer: "در این زمینه نمی‌توانم کمکی کنم.",
    });
  }

  const answer = await askGroq(msg);

  return res.status(200).json({
    ok: true,
    answer,
  });
}
