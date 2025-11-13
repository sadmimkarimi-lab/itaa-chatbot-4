// api/chat.js

// حافظه ساده برای مکالمه‌ها (در حافظه سرور)
// تا وقتی سرور گرم است، چند پیام آخر را نگه می‌دارد
const chatMemory = [];

// تمیز کردن خروجی: حذف فاصله‌های اضافه، مرتب کردن خط‌ها و فاصله بین پاراگراف‌ها
function cleanAnswer(text) {
  if (!text || typeof text !== "string") return "نتوانستم پاسخی تولید کنم.";

  let t = text.trim();

  // نرمال‌سازی خط‌ها
  t = t.replace(/\r\n/g, "\n");

  // حداکثر دو خط خالی پشت سر هم
  t = t.replace(/\n{3,}/g, "\n\n");

  // حذف فاصله‌های اضافه در انتهای هر خط
  const lines = t.split("\n").map((line) => line.replace(/\s+$/g, ""));
  return lines.join("\n");
}

export default async function handler(req, res) {
  // فقط POST را قبول می‌کنیم
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY تعریف نشده");
    return res
      .status(500)
      .json({ ok: false, error: "کلید OpenAI روی سرور تنظیم نشده است." });
  }

  // پیام کاربر را از بدنه درخواست بخوانیم (چند حالت مختلف را پشتیبانی می‌کنیم)
  const userMessage =
    req.body?.text || // حالت فرانت خودت { text: "..." }
    req.body?.message || // اگر کسی { message: "..." } بفرستد
    req.body?.message?.text || // حالت شبیه وبهوک
    null;

  if (!userMessage || typeof userMessage !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: "پیام کاربر ارسال نشده است." });
  }

  try {
    // پیام جدید کاربر را در حافظه اضافه می‌کنیم
    chatMemory.push({ role: "user", content: userMessage });

    // فقط چند پیام آخر را برای مدل می‌فرستیم
    const context = chatMemory.slice(-8); // ۸ پیام آخر (۴ رفت‌وبرگشت)

    const response = await fetch(
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
              content: `
تو یک دستیار حرفه‌ای فارسی‌زبان هستی.

قوانین نوشتن پاسخ:
- کوتاه، واضح و کاربردی بنویس.
- متن را تمیز و خوش‌خوان بنویس (پاراگراف‌بندی، خط‌های جدا بین بخش‌ها).
- اگر مناسب بود، از بولت‌پوینت (با - در ابتدای خط) استفاده کن.
- از تکرار بی‌دلیل و مقدمه‌چینی زیاد خودداری کن.
- اگر سؤال کاربر چند بخش دارد، پاسخ را مرحله‌به‌مرحله و منظم بنویس.
- لحن: محترمانه، صمیمی، حرفه‌ای.
            `.trim(),
            },
            ...context,
          ],
          temperature: 0.5,
          max_tokens: 400,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);
      const msg =
        data?.error?.message ||
        "پاسخی از OpenAI دریافت نشد، لطفاً دوباره تلاش کنید.";
      return res
        .status(500)
        .json({ ok: false, error: `خطا از سمت OpenAI: ${msg}` });
    }

    const rawAnswer =
      data?.choices?.[0]?.message?.content ||
      "نتوانستم پاسخی تولید کنم، لطفاً دوباره تلاش کنید.";

    // تمیز کردن متن خروجی برای نمایش بهتر در حباب چت
    const answer = cleanAnswer(rawAnswer);

    // پاسخ دستیار را هم در حافظه اضافه می‌کنیم
    chatMemory.push({ role: "assistant", content: answer });

    // خروجی‌ای که فرانت و ایتا انتظار دارند
    return res.status(200).json({ ok: true, answer });
  } catch (err) {
    console.error("Internal error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "خطای داخلی سرور. کمی بعد دوباره تلاش کن." });
  }
}
