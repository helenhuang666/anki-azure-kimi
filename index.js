import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

const AZURE_KEY = process.env.AZURE_KEY;
const AZURE_REGION = process.env.AZURE_REGION;

app.post("/assess", upload.single("audio"), async (req, res) => {
  try {
    const word = req.body.word || req.body["单词"];
    const audio = req.file;

    console.log("Word:", word);
    console.log("Audio:", audio?.mimetype, audio?.size);

    if (!word || !audio) {
      return res.status(400).json({ error: "Missing word or audio" });
    }

    const assessment = {
      ReferenceText: word,
      GradingSystem: "HundredMark",
      Granularity: "Phoneme",
      PhonemeAlphabet: "IPA"
    };

    const header = Buffer
      .from(JSON.stringify(assessment))
      .toString("base64");

    const url =
      `https://${AZURE_REGION}.stt.speech.microsoft.com/` +
      `speech/recognition/conversation/cognitiveservices/v1?language=en-US`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type": "audio/wav",
        "Pronunciation-Assessment": header
      },
      body: audio.buffer
    });

    const text = await r.text();
    console.log("Azure raw:", text);

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.json({ success: false, message: "Azure non-JSON", raw: text });
    }

    const best = json?.NBest?.[0];

if (!best || best.AccuracyScore == null) {
  return res.json({
    success: false,
    message: "No score",
    raw: json
  });
}

res.json({
  success: true,
  pronunciation: best.AccuracyScore,   // ⭐ 核心分数
  confidence: best.Confidence,
  word: best.Lexical,
  phonemes: best.Words?.[0]?.Phonemes || [],
  syllables: best.Words?.[0]?.Syllables || []
});

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
