// api/chat.js

// حافظه ساده برای مکالمه‌ها (در حافظه سرور)
// تا وقتی سرور گرم است، چند پیام آخر را نگه می‌دارد
const chatMemory = [];

export default async function handler(req, res) {
  // فقط POST را قبول می‌کنیم
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY تعریف نشده");
    return res
      .status(500)
      .json({ ok: false, error: "کلید OpenAI روی سرور تنظیم نشده است." });
  }

  // پیام کاربر را از بدنه درخواست بخوانیم
  const userMessage =
    req.body?.text ||      // حالتی که ما از فرانت خودمان می‌فرستیم { text: "..." }
    req.body?.message ||   // اگر کسی { message: "..." } فرستاد
    req.body?.message?.text || // حالتی شبیه وبهوک‌های پیام‌رسان‌ها
    null;

  if (!userMessage || typeof userMessage !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: "پیام کاربر ارسال نشده است." });
  }

  try {
    // پیام جدید کاربر را در حافظه اضافه می‌کنیم
    chatMemory.push({ role: "user", content: userMessage });

    // فقط چند پیام آخر را برای مدل می‌فرستیم (برای صرفه‌جویی در توکن)
    const context = chatMemory.slice(-8); // ۸ پیام آخر (۴ رفت‌وبرگشت)

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "تو یک دستیار حرفه‌ای فارسی‌زبان هستی. پاسخ‌ها را منظم، کوتاه، واضح و خوش‌خوان بنویس. اگر لازم بود، از بولت‌پوینت‌ها، پاراگراف‌بندی و ایموجی‌های ملایم استفاده کن. از تکرار بی‌دلیل و پرحرفی پرهیز کن.",
            },
            ...context,
          ],
          temperature: 0.5,
          max_tokens: 400,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);
      const msg =
        data?.error?.message ||
        "پاسخی از OpenAI دریافت نشد، لطفاً دوباره تلاش کنید.";
      return res
        .status(500)
        .json({ ok: false, error: `خطا از سمت OpenAI: ${msg}` });
    }

    const answer =
      data?.choices?.[0]?.message?.content?.trim() ||
      "نتوانستم پاسخی تولید کنم، لطفاً دوباره تلاش کنید.";

    // پاسخ دستیار را هم در حافظه اضافه می‌کنیم
    chatMemory.push({ role: "assistant", content: answer });

    // خروجی‌ای که فرانت و ایتا انتظار دارند
    return res.status(200).json({ ok: true, answer });
  } catch (err) {
    console.error("Internal error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "خطای داخلی سرور. کمی بعد دوباره تلاش کن." });
  }
}
