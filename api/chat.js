// api/chat.js

const MODEL = "gpt-4o-mini";

// پرومپت سیستم برای جواب‌های مرتب و خوش‌خوان
const SYSTEM_PROMPT = `
تو یک چت‌بات هوش مصنوعی برای پیام‌رسان ایتا هستی که باید به کاربران کمک کنی.

قواعد کلی:
1. زبان کاربر را تشخیص بده و تا وقتی خودش عوض نکرده، در همان زبان جواب بده (فارسی، انگلیسی، عربی و…).
2. متن‌ها را مرتب و خوانا بنویس:
   - جمله‌های کوتاه و واضح
   - پاراگراف‌بندی درست
   - علائم نگارشی تمیز
3. وقتی آموزش مرحله‌به‌مرحله می‌دهی، از لیست شماره‌دار یا بولت‌پوینت استفاده کن.
4. اگر می‌شود خلاصه جواب داد، اول یک جواب کوتاه بده، بعد در صورت نیاز توضیح بیشتر اضافه کن.
5. از اموجی کم ولی مناسب استفاده کن (مثلاً 😊✨📌)، نه در هر جمله.
6. اگر سؤال مبهم است، سعی کن از روی متن حدس بزنی منظور چیست؛ فقط اگر خیلی نامعلوم بود، محترمانه یک سوال کوتاه برای شفاف‌سازی بپرس.
7. لحن تو محترمانه، صمیمی و انگیزه‌بخش باشد.
`;

export default async function handler(req, res) {
  // فقط POST اجازه بدیم
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "کلید OPENAI_API_KEY روی سرور تنظیم نشده است.",
    });
  }

  try {
    const body = req.body || {};

    // 👇 این‌جا چند اسم مختلف را پشتیبانی می‌کنیم
    const message =
      body.message ||
      body.text ||
      body.prompt ||
      body.content ||
      body.q ||
      "";

    const history =
      body.history ||
      body.messages ||
      body.chatHistory ||
      [];

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        error: "پیام کاربر ارسال نشده است.",
      });
    }

    // فقط ۱۰ پیام آخر برای حافظه
    const trimmedHistory = Array.isArray(history)
      ? history.slice(-10)
      : [];

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...trimmedHistory,
      { role: "user", content: message },
    ];

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          input: messages,
          max_output_tokens: 400,
          temperature: 0.7,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const msg =
        data?.error?.message ||
        "خطا در ارتباط با OpenAI.";

      // محدودیت نرخ
      if (
        response.status === 429 ||
        data?.error?.code === "rate_limit_exceeded"
      ) {
        return res.status(429).json({
          ok: false,
          error:
            "محدودیت درخواست‌های OpenAI پر شده است. چند لحظه‌ی دیگر دوباره تلاش کنید.",
          details: msg,
        });
      }

      return res.status(500).json({
        ok: false,
        error: "خطا در ارتباط با OpenAI.",
        details: msg,
      });
    }

    // درآوردن متن جواب از ساختار Responses API
    let replyText = "";
    const firstOutput = data.output && data.output[0];

    if (firstOutput && Array.isArray(firstOutput.content)) {
      replyText = firstOutput.content
        .filter(
          (part) =>
            part.type === "output_text" || part.type === "text"
        )
        .map((part) => part.text)
        .join("\n");
    }

    if (!replyText) {
      replyText =
        "متأسفم، در تولید پاسخ مشکلی پیش آمد. لطفاً دوباره تلاش کنید.";
    }

    return res.status(200).json({
      ok: true,
      reply: replyText,
      usage: data.usage || null,
    });
  } catch (err) {
    console.error("OpenAI API error:", err);
    return res.status(500).json({
      ok: false,
      error: "خطای غیرمنتظره در سرور.",
      details: err?.message || String(err),
    });
  }
}
