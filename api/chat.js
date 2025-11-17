// api/chat.js

// ——————— تمیز کردن متن خروجی ———————
function cleanAnswer(text) {
  if (!text || typeof text !== "string") return "نتوانستم پاسخی تولید کنم.";

  let t = text.trim();
  t = t.replace(/\r\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");

  const lines = t.split("\n").map((line) => line.replace(/\s+$/g, ""));
  return lines.join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  // ———— کلید GROQ ————
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("GROQ_API_KEY تعریف نشده");
    return res.status(500).json({
      ok: false,
      error: "کلید Groq روی سرور تنظیم نشده است.",
    });
  }

  // پیام کاربر
  const userMessage =
    req.body?.text ||
    req.body?.message ||
    req.body?.message?.text ||
    null;

  if (!userMessage || typeof userMessage !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: "پیام کاربر ارسال نشده است." });
  }

  try {
    // ——————— ارسال پیام به Groq ———————
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [
            {
              role: "system",
              content: `
تو یک دستیار حرفه‌ای فارسی‌زبان هستی.
هر سؤال را مستقل جواب بده.
پاسخ‌ها واضح، ساده، دقیق و دوستانه باشند.
اگر سؤال چندبخشی بود مرحله‌ای پاسخ بده.
`.trim(),
            },
            { role: "user", content: userMessage },
          ],
          temperature: 0.5,
          max_tokens: 500,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Groq error:", data);
      const msg =
        data?.error?.message ||
        "پاسخی از Groq دریافت نشد، لطفاً دوباره تلاش کنید.";
      return res.status(500).json({ ok: false, error: msg });
    }

    const rawAnswer =
      data?.choices?.[0]?.message?.content ||
      "نتوانستم پاسخی تولید کنم، لطفاً دوباره تلاش کنید.";

    const answer = cleanAnswer(rawAnswer);

    return res.status(200).json({ ok: true, answer });
  } catch (err) {
    console.error("Internal error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "خطای داخلی سرور. کمی بعد دوباره تلاش کن." });
  }
}
