export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const API_KEY = process.env.GROQ_API_KEY;

  // مدل‌های fallback — از بهترین به بدترین
  const MODELS = [
    "llama-3.1-70b-versatile",  // بهترین کیفیت
    "gemma2-9b-it",             // سریع + خوب
    "llama-3.1-8b-instant"      // اضطراری
  ];

  // دستیار زیبا و خوش‌اخلاق 😍
  const SYSTEM_PROMPT = `
تو یک دستیار هوشمند فارسی‌زبان هستی.
با لحن صمیمی، دقیق و قابل فهم جواب بده.
اگر کاربر سوال مهم داشت، پاسخ کامل بده.
اگر سوال کوتاه بود، جواب کوتاه و تمیز بده.
از کلمات خشک، رسمی یا بی‌روح استفاده نکن.
جوری بنویس که کاربر کیف کنه ❤️
  `;

  // تابعی که مدل‌ها را یکی‌یکی تست می‌کند
  async function askGroq(modelName) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: modelName,
          temperature: 0.55,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: message }
          ],
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error?.message);

      return data.choices[0].message.content;
    } catch (error) {
      console.log("❌ مدل از کار افتاد:", modelName, error.message);
      return null;
    }
  }

  // اجرای fallback
  for (const model of MODELS) {
    const reply = await askGroq(model);
    if (reply) {
      return res.status(200).json({ reply });
    }
  }

  // اگر همه مدل‌ها خراب شدند
  return res.status(500).json({
    reply: "الان سرورهای هوش مصنوعی شلوغه، چند لحظه دیگه دوباره امتحان کن عزیزم ❤️"
  });
}
