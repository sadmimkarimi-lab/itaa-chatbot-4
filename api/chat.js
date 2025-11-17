// api/chat.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("❌ GROQ_API_KEY در سرور ست نشده");
    return res.status(500).json({
      ok: false,
      error: "کلید Groq روی سرور تنظیم نشده است.",
    });
  }

  // پیام کاربر (استانداردسازی)
  const userMessage =
    req.body?.text ||
    req.body?.message ||
    req.body?.message?.text ||
    null;

  if (!userMessage) {
    return res.status(400).json({
      ok: false,
      error: "پیام کاربر دریافت نشد.",
    });
  }

  try {
    // ——————— ارسال به GROQ ———————
    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama3-8b-chat",   // ❤️ مدل معتبر و رایگان
          messages: [
            {
              role: "system",
              content:
                "تو یک دستیار فارسی‌زبان هستی. واضح، محترمانه و دقیق پاسخ بده.",
            },
            { role: "user", content: userMessage },
          ],
          temperature: 0.5,
        }),
      }
    );

    const data = await groqRes.json();

    // ———— اگر Groq خطا داد ————
    if (!groqRes.ok) {
      console.error("Groq error:", data);
      return res.status(500).json({
        ok: false,
        error: data?.error?.message || "خطا در اتصال به Groq.",
      });
    }

    const answer =
      data?.choices?.[0]?.message?.content ||
      "متاسفانه پاسخی پیدا نکردم.";

    return res.status(200).json({ ok: true, answer });
  } catch (err) {
    console.error("Internal error:", err);
    return res.status(500).json({
      ok: false,
      error: "خطای داخلی سرور.",
    });
  }
}
