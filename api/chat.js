// api/chat.js

function cleanAnswer(text) {
  if (!text || typeof text !== "string")
    return "متوجه نشدم عزیزم، دوباره بپرس.";

  let t = text.trim();
  t = t.replace(/\r\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");

  const lines = t.split("\n").map((line) => line.replace(/\s+$/g, ""));
  return lines.join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "فقط POST مجاز است." });
  }

  const { text } = req.body || {};

  if (!text || typeof text !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: "متن پیام پیدا نشد عزیزم." });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ ok: false, error: "کلید GROQ تنظیم نشده." });
  }

  // مدل‌های واقعی و سریع Groq
  const models = [
    "llama3-70b-8192",      // قوی‌ترین و بهترین
    "mixtral-8x7b-32768",   // fallback دقیق
    "llama3-8b-8192"        // سریع و سبک
  ];

  async function askModel(modelName) {
    try {
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
                content: `
تو یک دستیار فارسی‌زبان با شخصیت گرم، مودب و قابل اعتماد هستی.
شبیه یک انسان واقعی و فهمیده جواب می‌دهی.
- محتوای پاسخ باید روان، طبیعی و ساده باشد.
- نه خشک باش، نه بیش‌ازحد خودمانی.
- تا می‌توانی واضح، دقیق و خلاصه جواب بده که کاربر راحت بخواند.
- اگر می‌شود حدس منطقی زد، مستقیم جواب بده.
- فقط اگر سؤال خیلی مبهم بود یک سؤال کوچک برای شفاف‌سازی بپرس.
- از گفتن اطلاعات فنی یا اشاره به مدل و API خودداری کن.
- همیشه لحن مثبت، دلنشین و دوستانه داشته باش.
                `.trim(),
              },
              { role: "user", content: text },
            ],
            temperature: 0.55,
            max_tokens: 800,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("❌ Groq Error:", modelName, data);
        throw new Error(data?.error?.message || "خطای مدل");
      }

      return cleanAnswer(
        data?.choices?.[0]?.message?.content ||
          "نتوانستم پاسخ مناسبی پیدا کنم عزیزم."
      );
    } catch (err) {
      throw err;
    }
  }

  try {
    let answer = null;
    let lastErr = null;

    for (const model of models) {
      try {
        console.log("🔄 تست مدل:", model);
        answer = await askModel(model);
        console.log("✅ موفق شد:", model);
        break;
      } catch (err) {
        lastErr = err;
        continue;
      }
    }

    if (!answer) {
      return res
        .status(500)
        .json({ ok: false, error: "مشکلی در پردازش پیام پیش آمد عزیزم." });
    }

    return res.status(200).json({ ok: true, answer });
  } catch (err) {
    console.error("🔥 Internal server error:", err);
    return res.status(500).json({
      ok: false,
      error: "خطای داخلی سرور، لطفاً دوباره تلاش کن عزیزم.",
    });
  }
}
