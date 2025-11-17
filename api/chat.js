// api/chat.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "GROQ_API_KEY تنظیم نشده.",
    });
  }

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

  // ❤️ مدل‌ها به ترتیب تست
  const models = [
    "llama3-8b",
    "mixtral-8x7b-instruct",
    "qwen2-72b"
  ];

  try {
    for (const model of models) {
      try {
        console.log("🔄 تست مدل:", model);

        const groqRes = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content: "تو یک دستیار فارسی‌زبان حرفه‌ای هستی.",
                },
                { role: "user", content: userMessage },
              ],
              temperature: 0.5,
            }),
          }
        );

        const data = await groqRes.json();

        if (!groqRes.ok) {
          console.error(`❌ مدل ${model} خطا داد:`, data);
          continue; // ❤️ برو مدل بعدی
        }

        // اگر اینجا رسید یعنی جواب گرفته
        const answer = data?.choices?.[0]?.message?.content;
        if (answer) {
          return res.status(200).json({ ok: true, answer });
        }
      } catch (modelErr) {
        console.error(`❌ خطا در مدل ${model}:`, modelErr);
        continue; // مدل بعدی تست میشه
      }
    }

    // اگر هیچ مدلی جواب نداد:
    return res.status(500).json({
      ok: false,
      error: "هیچ‌کدام از مدل‌ها پاسخ ندادند.",
    });

  } catch (err) {
    console.error("🔥 خطای مهم:", err);
    return res.status(500).json({
      ok: false,
      error: "خطای داخلی سرور.",
    });
  }
}
