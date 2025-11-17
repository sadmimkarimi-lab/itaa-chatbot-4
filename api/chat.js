// api/chat.js

const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gpt-oss-20b",
];

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function callGroqOnce(model, text) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY تنظیم نشده است");

  const resp = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "تو یک دستیار فارسی‌زبان مهربان و کاربردی هستی. جواب‌ها را واضح، مفید، عملی و بدون حاشیه‌های اضافی بده.",
        },
        { role: "user", content: text },
      ],
      temperature: 0.6,
      max_tokens: 1024,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Groq error (${model}): ${resp.status} - ${t}`);
  }

  const data = await resp.json();

  return (
    data?.choices?.[0]?.message?.content?.trim() ||
    "متأسفم، نتوانستم پاسخ مناسبی پیدا کنم."
  );
}

async function askGroq(text) {
  for (const model of GROQ_MODELS) {
    try {
      return { answer: await callGroqOnce(model, text), model };
    } catch (err) {
      console.error(`خطا با مدل ${model}:`, err.message);
    }
  }

  return {
    answer:
      "در حال حاضر ارتباط با مدل‌های هوش مصنوعی ممکن نیست 😔\nلطفاً چند دقیقه دیگر دوباره امتحان کن.",
    model: null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  try {
    const text =
      req.body?.text ||
      req.body?.message ||
      req.body?.message?.text ||
      "";

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        ok: false,
        error: "ورودی نامعتبر است.",
      });
    }

    const result = await askGroq(text);

    return res.status(200).json({
      ok: true,
      answer: result.answer,
      model: result.model,
    });
  } catch (err) {
    console.error("API /chat error:", err);
    return res.status(500).json({
      ok: false,
      error: "خطای داخلی سرور.",
    });
  }
}
