import express from "express";
import fetch from "node-fetch";
import multer from "multer";

const app = express();
const upload = multer();

const AZURE_KEY = process.env.AZURE_KEY;
const AZURE_REGION = process.env.AZURE_REGION;

app.use(express.static("public"));

app.post("/assess", upload.single("audio"), async (req, res) => {
  try {
    const word = (req.body.word || "").trim();
    if (!word) {
      return res.status(400).json({ error: "Missing word" });
    }

    const url =
      `https://${AZURE_REGION}.stt.speech.microsoft.com` +
      `/speech/recognition/conversation/cognitiveservices/v1` +
      `?language=en-US&format=detailed`;

    const paConfig = {
      ReferenceText: word,
      GradingSystem: "HundredMark",
      PhonemeAlphabet: "IPA",
      Dimension: "Comprehensive"
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type": "audio/wav",
        "Pronunciation-Assessment": Buffer.from(
          JSON.stringify(paConfig)
        ).toString("base64")
      },
      body: req.file.buffer
    });

    const raw = await response.json();
    console.log("✅ Azure raw:", JSON.stringify(raw));

    const nbest = raw?.NBest?.[0];
    const wordInfo = nbest?.Words?.[0];

    res.json({
      ok: true,
      accuracy: nbest?.AccuracyScore ?? null,
      pronScore: nbest?.PronScore ?? null,
      phonemes: wordInfo?.Phonemes ?? [],
      raw
    });
  } catch (e) {
    console.error("❌ assess error", e);
    res.status(500).json({ error: "assessment failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
