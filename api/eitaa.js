// api/eitaa.js
// ❗ نسخه تستی فقط برای این‌که مطمئن بشیم همین فایل اجرا می‌شه

async function sendMessage(chat_id, text, replyToId) {
  const url = `https://eitaayar.ir/bot${process.env.EITAA_BOT_TOKEN}/sendMessage`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text,
        reply_to_message_id: replyToId,
      }),
    });
  } catch (err) {
    console.error("خطا در ارسال پیام به ایتا:", err);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  const msg = req.body?.message;
  if (!msg) return res.status(200).json({ ok: true });

  const text = msg.text || "";
  const chatId = msg.chat?.id;
  const replyToId = msg.message_id;

  if (!text || !chatId) return res.status(200).json({ ok: true });

  // اگر /start بود، یه خوش‌آمد ساده بده
  if (text === "/start") {
    await sendMessage(
      chatId,
      "سلام 👋 من نسخه تستی ربات هستم.\nاگر این پیام رو می‌بینی یعنی /api/eitaa.js جدید داره درست کار می‌کنه ✅",
      replyToId
    );
    return res.status(200).json({ ok: true });
  }

  // برای هر پیام دیگه، فقط یک جمله ثابت برگردون
  await sendMessage(
    chatId,
    "این یک پاسخ تستی از نسخه جدید کد هست ✅\nیعنی دقیقاً همین فایل /api/eitaa.js اجرا شده.",
    replyToId
  );

  return res.status(200).json({ ok: true });
}
