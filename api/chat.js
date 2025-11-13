// api/chat.js

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// مدل قوی‌تر
const MODEL = "gpt-4o-mini";

// پرومپت سیستم برای جواب‌های مرتب و خوش‌خوان
const SYSTEM_PROMPT = `
تو یک چت‌بات هوش مصنوعی برای پیام‌رسان ایتا هستی که باید به کاربران کمک کنی.

قواعد کلی:
1. زبان کاربر را تشخیص بده و تا وقتی خودش عوض نکرده، در همان زبان جواب بده (فارسی، انگلیسی، عربی و…).
2. متن‌ها را **مرتب و خوانا** بنویس:
   - جمله‌های کوتاه و واضح
   - پاراگراف‌بندی درست
   - علائم نگارشی تمیز
3. وقتی توضیح مرحله‌به‌مرحله می‌دهی، از **لیست شماره‌دار** یا بولت‌پوینت استفاده کن.
4. اگر کاربر چیزی خواست که می‌شود خلاصه گفت، اول جواب کوتاه بده، بعد اگر لازم بود توضیح بیشتر اضافه کن.
5. از اموجی کم ولی مناسب استفاده کن (مثلاً 😊✨📌)، نه در هر جمله.
6. اگر سؤال مبهم است، سعی کن از روی متن حدس بزنی منظور چیست؛ فقط اگر خیلی نامعلوم بود، محترمانه یک سوال کوتاه برای شفاف‌سازی بپرس.
7. از لحن محترمانه، صمیمی و مودب استفاده کن، طوری که برای مخاطب خوشایند و انگیزه‌بخش باشد.
`;

export default async function handler(req, res) {
  // فقط POST
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { message, history } = req.body || {};

    if (!message || typeof message !== "string") {
      return res
        .status(400)
        .json({ ok: false, error: "پیام کاربر ارسال نشده است." });
    }

    // فقط ۱۰ پیام آخر برای کانتکست
    const trimmedHistory = Array.isArray(history)
      ? history.slice(-10)
      : [];

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...trimmedHistory,
      { role: "user", content: message },
    ];

    // درخواست به OpenAI (Responses API)
    const response = await client.responses.create({
      model: MODEL,
      input: messages,
      max_output_tokens: 400,
      temperature: 0.7,
    });

    // درآوردن متن جواب از ساختار جدید Responses
    let replyText = "";
    const firstOutput = response.output?.[0];

    if (firstOutput?.type === "message") {
      replyText = firstOutput.content
        .filter(
          (part) =>
            part.type === "output_text" || part.type === "text"
        )
        .map((part) => part.text)
        .join("\n");
    } else if (firstOutput?.type === "output_text") {
      replyText = firstOutput.text;
    }

    if (!replyText) {
      replyText =
        "متأسفم، در تولید پاسخ مشکلی پیش آمد. لطفاً دوباره تلاش کنید.";
    }

    return res.status(200).json({
      ok: true,
      reply: replyText,
      usage: response.usage || null,
    });
  } catch (err) {
    console.error("OpenAI API error:", err);

    // محدودیت نرخ (429)
    if (
      err?.status === 429 ||
      err?.code === "rate_limit_exceeded"
    ) {
      return res.status(429).json({
        ok: false,
        error:
          "محدودیت درخواست‌های OpenAI پر شده است. چند لحظه‌ی دیگر دوباره تلاش کنید.",
      });
    }

    return res.status(500).json({
      ok: false,
      error: "خطا در ارتباط با OpenAI.",
      details: err?.message || String(err),
    });
  }
}
