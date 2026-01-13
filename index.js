import express from "express";
import fetch from "node-fetch";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const upload = multer();

// ====== 解决 ESM 下路径问题（关键） ======
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== 静态目录（必须是绝对路径） ======
app.use(express.static(path.join(__dirname, "public")));

const AZURE_KEY = process.env.AZURE_KEY;
const AZURE_REGION = process.env.AZURE_REGION;

app.post("/assess", upload.single("audio"), async (req, res) => {
  try {
    const word = req.body.word?.trim();
    const audio = req.file?.buffer;

    if (!word || !audio) {
      return res.status(400).json({ error: "missing word or audio" });
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

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type": "audio/wav",
        "Pronunciation-Assessment": Buffer
          .from(JSON.stringify(paConfig))
          .toString("base64")
      },
      body: audio
    });

    const raw = await r.json();
    console.log("✅ Azure raw:", JSON.stringify(raw));

    const nbest = raw?.NBest?.[0];
    const w = nbest?.Words?.[0];

    if (!w) {
      return res.json({ score: 0, phonemes: [] });
    }

    const phonemes = (w.Phonemes || []).map((p) => ({
      ipa: p.Phoneme,
      score: Math.round(p.AccuracyScore ?? 0)
    }));

    res.json({
      score: Math.round(nbest.AccuracyScore ?? 0),
      phonemes,
      raw
    });

  } catch (e) {
    console.error("❌ assess error", e);
    res.status(500).json({ error: "assessment failed" });
  }
});

// ====== 必须监听 Render 提供的端口 ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
