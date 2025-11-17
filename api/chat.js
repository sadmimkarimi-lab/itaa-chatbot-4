export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // هماهنگ با index.html + eitaa.js
  const message = req.body.text;  
  if (!message) {
    return res.status(400).json({ error: "پیام دریافت نشد عزیزم" });
  }

  const API_KEY = process.env.GROQ_API_KEY;

  const MODELS = [
    "llama-3.1-70b-versatile",
    "gemma2-9b-it",
    "llama-3.1-8b-instant"
  ];

  const SYSTEM_PROMPT = `
تو یک دستیار فارسی‌زبان هستی.
لحن تو صمیمی، ساده و قابل فهم است.
جواب‌ها باید کوتاه، مفید و محترمانه باشند.
اگر سوال پیچیده بود، مرحله‌به‌مرحله توضیح بده.
  `;

  async function ask(modelName) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: modelName,
          temperature: 0.45,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: message }
          ],
        }),
      });

      const data = await r.json().catch(() => ({}));

      if (!r.ok) throw new Error(data?.error?.message);

      return data.choices?.[0]?.message?.content || null;

    } catch (err) {
      console.log("❌ Error model:", modelName, err.message);
      return null;
    }
  }

  for (const model of MODELS) {
    const reply = await ask(model);
    if (reply) {
      return res.status(200).json({ answer: reply });
    }
  }

  return res.status(500).json({
    answer: "الان سرورها شلوغه، چند دقیقه دیگه دوباره امتحان کن عزیزم ❤️"
  });
}
