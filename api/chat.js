// اگر قبلاً بالای فایل import OpenAI ... داشتی، کامل حذفش کن

// اگر در پروژه‌ات node-fetch را قبلاً نصب کرده‌ای (که از لاگ‌ها معلومه نصب هست):
const fetchFn = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(400).json({ ok: false, error: "Method not allowed" });
  }

  const userText = req.body?.text;

  if (!userText || userText.trim() === "") {
    return res.status(400).json({
      ok: false,
      error: "پیام کاربر ارسال نشده است."
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "کلید OpenAI تنظیم نشده است."
    });
  }

  try {
    const payload = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
تو یک دستیار فارسی‌زبان هستی.
سبک پاسخ‌دهی:
- جمله‌ها کوتاه و روان باشند.
- توضیح اضافی نده.
- از ایموجی و بولد زیاد استفاده نکن.
- پاسخ شبیه یک ربات حرفه‌ای و مینیمال باشد.
- فقط وقتی لازم است از لیست استفاده کن.
`.trim()
        },
        { role: "user", content: userText }
      ],
      temperature: 0.5
    };

    const response = await fetchFn("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", data);
      return res.status(500).json({
        ok: false,
        error: "خطا از سمت OpenAI."
      });
    }

    const botReply =
      data.choices?.[0]?.message?.content?.trim() || "پاسخی دریافت نشد.";

    return res.status(200).json({
      ok: true,
      answer: botReply
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({
      ok: false,
      error: "خطا از سمت سرور."
    });
  }
}
