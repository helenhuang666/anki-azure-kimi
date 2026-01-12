import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public")); // ⭐ 关键：托管前端文件

const upload = multer({ storage: multer.memoryStorage() });

const AZURE_KEY = process.env.AZURE_KEY;
const AZURE_REGION = process.env.AZURE_REGION;

/* 发音评测接口 */
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

    const header = Buffer.from(JSON.stringify(assessment)).toString("base64");

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

    const json = JSON.parse(text);
    const best = json?.NBest?.[0];

    if (!best || !best.Words?.[0]?.Phonemes) {
      return res.json({ success: false, message: "No phoneme data", raw: json });
    }

    res.json({
      success: true,
      word: best.Lexical,
      score: Math.round(best.AccuracyScore),
      phonemes: best.Words[0].Phonemes.map(p => ({
        symbol: p.Phoneme,
        score: Math.round(p.AccuracyScore)
      }))
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
