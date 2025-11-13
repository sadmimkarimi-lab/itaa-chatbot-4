// api/chat.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  // پیام کاربر را بگیر
  const userMessage =
    req.body?.text ||
    req.body?.message ||
    req.body?.message?.text ||
    null;

  if (!userMessage) {
    return res.status(400).json({ error: "پیام کاربر ارسال نشده است." });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "تو یک دستیار فارسی‌زبان هستی." },
          { role: "user", content: userMessage },
        ],
      }),
    });

    const data = await response.json();
    const answer =
      data?.choices?.[0]?.message?.content || "پاسخی از OpenAI دریافت نشد.";

    return res.json({ ok: true, answer });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
