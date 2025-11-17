// api/chat.js

function cleanAnswer(text) {
  if (!text || typeof text !== "string")
    return "نتونستم درست متوجه بشم عزیزم، دوباره بپرس.";

  let t = text.trim().replace(/\r\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");

  return t;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "فقط POST مجازه." });
  }

  const { text } = req.body || {};
  if (!text) {
    return res.status(400).json({ ok: false, error: "متن پیام خالیه عزیزم." });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "کلید GROQ تنظیم نشده." });
  }

  // مدل‌های فعّال و جدید Groq
  const models = [
    "llama3.1-70b-versatile",
    "mixtral-8x22b",
    "llama3.1-8b-instant"
  ];

  async function ask(modelName) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
تو یک دستیار فارسی‌زبان هستی با لحن محترمانه، گرم و روان.
ساده، دقیق، قابل فهم و صمیمی جواب بده.
از پیچوندن جواب یا خشک حرف‌زدن پرهیز کن.
جواب‌ها رو کوتاه و تمیز تحویل بده.
اگر سؤال خیلی مبهم بود، فقط یک سؤال کوتاه بپرس.
            `.trim(),
          },
          { role: "user", content: text }
        ],
        temperature: 0.55,
        max_tokens: 800,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.log("❌ Groq error:", modelName, data);
      throw new Error(data?.error?.message || "خطای مدل");
    }

    return cleanAnswer(data?.choices?.[0]?.message?.content);
  }

  try {
    let answer = null;

    for (const m of models) {
      try {
        console.log("🔄 تست مدل:", m);
        answer = await ask(m);
        console.log("✅ موفق:", m);
        break;
      } catch (e) {
        continue;
      }
    }

    if (!answer) {
      return res.status(500).json({ ok: false, error: "همه مدل‌ها خطا دادن." });
    }

    return res.status(200).json({ ok: true, answer });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "خطای داخلی سرور. لطفاً دوباره امتحان کن.",
    });
  }
}
