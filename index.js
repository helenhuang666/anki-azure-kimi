import express from "express";
import fetch from "node-fetch";
import multer from "multer";
import cors from "cors";

const app = express();
const upload = multer();

app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
app.options("*", cors());
app.use(express.static("public"));

const AZURE_KEY = process.env.AZURE_KEY;
const AZURE_REGION = process.env.AZURE_REGION;

const AZURE_URL =
  `https://${AZURE_REGION}.stt.speech.microsoft.com/` +
  `speech/recognition/conversation/cognitiveservices/v1`;

app.post("/assess", upload.single("audio"), async (req, res) => {
  try {
    const word = req.body.word?.trim();
    const audio = req.file?.buffer;

    if (!word || !audio) {
      return res.json({ score: 0, phonemes: [], error: "missing data" });
    }

    const url =
      `${AZURE_URL}?language=en-US&format=detailed` +
      `&pronunciationAssessment.referenceText=${encodeURIComponent(word)}` +
      `&pronunciationAssessment.gradingSystem=HundredMark` +
      `&pronunciationAssessment.phonemeAlphabet=IPA` +
      `&pronunciationAssessment.dimension=Comprehensive`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type": "audio/wav",
      },
      body: audio,
    });

    const rawText = await r.text();

    // 🔴 关键修复点
    if (!rawText.startsWith("{")) {
      console.warn("⚠ Azure non-JSON:", rawText);
      return res.json({ score: 0, phonemes: [] });
    }

    const j = JSON.parse(rawText);
    console.log("✅ Azure raw:", JSON.stringify(j));

    const best = j?.NBest?.[0];
    const wordData = best?.Words?.[0];

    if (!best || !wordData) {
      return res.json({ score: 0, phonemes: [] });
    }

    const phonemes = (wordData.Phonemes || []).map((p) => ({
      ipa: p.Phoneme,
      score: Math.round(p.AccuracyScore ?? 0),
    }));

    res.json({
      score: Math.round(best.AccuracyScore ?? 0),
      phonemes,
    });
  } catch (e) {
    console.error("❌ assess error", e);
    res.json({ score: 0, phonemes: [], error: "assessment failed" });
  }
});

app.listen(process.env.PORT || 10000, () =>
  console.log("Server running")
);
