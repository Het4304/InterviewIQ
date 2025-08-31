const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");

router.post("/session", async (req, res) => {
  try {
    // Create ephemeral token
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-realtime-preview-2024-12-17",
        voice: "verse", // optional, for audio out
      }),
    });

    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("Realtime session error:", err);
    res.status(500).json({ error: "Failed to create realtime session" });
  }
});

module.exports = router;
