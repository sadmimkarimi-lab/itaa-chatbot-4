// تغییر از import به require
const fetch = require("node-fetch");  // برای استفاده از node-fetch

// تغییرات مربوط به export
module.exports = async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const { text, chatHistory = [] } = req.body || {};
      if (!text) {
        return res.status(400).json({ error: "متن خالی است" });
      }

      // افزودن پیام جدید به تاریخچه چت
      const newChatHistory = [...chatHistory, { role: "user", content: text }];

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4", // استفاده از مدل گپ‌تی برای ارتباطات طبیعی و بهینه
          messages: newChatHistory, // ارسال تاریخچه پیام‌ها
        }),
      });

      const data = await openaiRes.json();
      const answer = data.choices?.[0]?.message?.content?.trim() || "جوابی نگرفتم.";

      // ارسال تاریخچه به همراه پاسخ به کاربر
      return res.status(200).json({
        ok: true,
        answer,
        chatHistory: [...newChatHistory, { role: "assistant", content: answer }],
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "server error" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
