// api/chat.js

// حافظه‌ی ساده برای چند پیام آخر هر گفتگو
// key = chatId (یا "default")، value = آرایه‌ای از { role, content }
const chatMemory = {};

export default async function handler(req, res) {
  // فقط POST مجاز است
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("OPENAI_API_KEY is missing");
    return res
      .status(500)
      .json({ ok: false, error: "کلید OpenAI روی سرور تنظیم نشده است." });
  }

  try {
    // در Next/Vercel بدنه‌ی JSON در req.body می‌آید
    const { message, chatId } = req.body || {};

    if (!message || typeof message !== "string") {
      return res
        .status(400)
        .json({ ok: false, error: "پیام کاربر ارسال نشده است." });
    }

    const id = chatId || "default";

    // اگر برای این کاربر قبلا چیزی نداشتیم، بسازیم
    if (!chatMemory[id]) {
      chatMemory[id] = [];
    }

    // پیام کاربر را به حافظه اضافه کن
    chatMemory[id].push({ role: "user", content: message });

    // فقط چند پیام آخر را برای مدل بفرستیم که هم زمینه را داشته باشد، هم توکن نسوزد
    const historyToSend = chatMemory[id].slice(-6);

    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
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
                "تو یک دستیار فارسی‌زبان مهربان و حرفه‌ای هستی. پاسخ‌ها را واضح، منظم و کاربردی بنویس. جملات را تمیز و قابل فهم بنویس، اگر لازم شد از بولت‌پوینت استفاده کن و از حاشیه‌ رفتن زیاد خودداری کن.",
            },
            ...historyToSend,
          ],
          temperature: 0.5,
          max_tokens: 400,
        }),
      }
    );

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error("OpenAI API error:", data);

      const msg =
        data?.error?.message ||
        "پاسخی از OpenAI دریافت نشد، لطفاً دوباره تلاش کنید.";

      return res.status(openaiRes.status).json({
        ok: false,
        error: `خطا از سمت OpenAI: ${msg}`,
      });
    }

    const answer =
      data?.choices?.[0]?.message?.content?.trim() ||
      "نتوانستم پاسخی تولید کنم، لطفاً دوباره تلاش کنید.";

    // جواب دستیار را هم در حافظه نگه می‌داریم
    chatMemory[id].push({ role: "assistant", content: answer });

    // پاسخی که فرانت انتظار دارد: ok + answer
    return res.status(200).json({ ok: true, answer });
  } catch (err) {
    console.error("Internal server error:", err);
    return res.status(500).json({
      ok: false,
      error: "خطای داخلی سرور. لطفاً کمی بعد دوباره تلاش کنید.",
    });
  }
}
