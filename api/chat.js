// api/chat.js

const chatMemory = {};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "OPENAI_API_KEY missing" });
  }

  try {
    let body = req.body || {};

    // حالت ۱: فرانت مستقیم فرستاده: { message: "سلام" }
    // حالت ۲: ایتا ارسال کرده: { message: { text: "سلام" } }
    const message =
      typeof body.message === "string"
        ? body.message
        : body.message?.text
        ? body.message.text
        : null;

    if (!message) {
      return res
        .status(400)
        .json({ ok: false, error: "پیام کاربر ارسال نشده است." });
    }

    const chatId = body.chatId || body.user_id || "default";

    if (!chatMemory[chatId]) chatMemory[chatId] = [];

    chatMemory[chatId].push({ role: "user", content: message });

    const history = chatMemory[chatId].slice(-6);

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "پاسخ‌ها را واضح، تمیز و حرفه‌ای بنویس. فارسی روان و منظم بنویس.",
          },
          ...history,
        ],
      }),
    });

    const data = await openaiRes.json();
    const answer = data?.choices?.[0]?.message?.content || "خطا در دریافت پاسخ";

    chatMemory[chatId].push({ role: "assistant", content: answer });

    return res.json({ ok: true, answer });
  } catch (err) {
    return res
      .status(500)
      .json({ ok: false, error: "Internal Error: " + err.message });
  }
}
