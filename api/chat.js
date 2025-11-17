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
  // فقط POST قبول کنیم
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "فقط متد POST مجاز است." });
  }

  const { text } = req.body || {};

  if (!text || typeof text !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: "متن سؤال ارسال نشده است." });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("GROQ_API_KEY تعریف نشده است.");
    return res
      .status(500)
      .json({ ok: false, error: "کلید گروک روی سرور تنظیم نشده است." });
  }

  // ——————— تابع کمکی برای صدا زدن یک مدل ———————
  async function callGroqModel(modelName) {
    console.log("🔎 تست مدل:", modelName);

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: "system",
              content:
                "تو یک دستیار فارسی‌زبان، صبور و مهربان هستی. پاسخ‌ها را کوتاه، دقیق و قابل فهم بنویس.",
            },
            {
              role: "user",
              content: text,
            },
          ],
          temperature: 0.7,
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Groq error for model", modelName, data);
      const msg =
        data?.error?.message || `Groq error with model ${modelName}`;
      throw new Error(msg);
    }

    const answer = data?.choices?.[0]?.message?.content;
    if (!answer) {
      throw new Error("پاسخی از مدل دریافت نشد.");
    }

    return answer;
  }

  // ——————— لیست مدل‌ها: به ترتیب امتحان می‌کنیم ———————
  const modelsToTry = [
    "llama-3.1-8b-instant",  // سریع و عمومی
    "mixtral-8x7b-32768",    // قوی‌تر، اگر اولی خطا داد
    "qwen-2.5-coder-32b"     // fallback سوم
  ];

  try {
    let rawAnswer = null;
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        rawAnswer = await callGroqModel(model);
        console.log("✅ مدل موفق:", model);
        break; // وقتی یک مدل جواب داد، از حلقه خارج می‌شویم
      } catch (err) {
        lastError = err;
        console.error(`❌ خطا در مدل ${model}:`, err.message);
        // می‌ریم سراغ مدل بعدی
      }
    }

    if (!rawAnswer) {
      // هیچ مدلی جواب نداده
      throw lastError || new Error("هیچ مدلی نتوانست پاسخ بدهد.");
    }

    const answer = cleanAnswer(rawAnswer);

    return res.status(200).json({ ok: true, answer });
  } catch (err) {
    console.error("Internal error:", err);
    return res.status(500).json({
      ok: false,
      error: "خطای داخلی سرور. کمی بعد دوباره تلاش کن.",
    });
  }
}
