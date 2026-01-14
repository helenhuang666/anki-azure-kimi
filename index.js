import express from "express";
import fetch from "node-fetch";
import multer from "multer";
import cors from "cors";

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const AZURE_KEY = process.env.AZURE_KEY;
const AZURE_REGION = process.env.AZURE_REGION;

const AZURE_URL =
  `https://${AZURE_REGION}.stt.speech.microsoft.com` +
  `/speech/recognition/conversation/cognitiveservices/v1`;

let latestResult = null;

/* ===== Anki 上传音频并评测 ===== */
app.post("/assess", upload.single("audio"), async (req, res) => {
  try {
    const word = req.body.word?.trim();
    const audio = req.file?.buffer;

    if (!word || !audio) {
      return res.json({ ok: false, error: "missing word or audio" });
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

    const text = await r.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      console.error("❌ Azure non-JSON:", text);
      latestResult = { ok: false, error: "azure non-json" };
      return res.json(latestResult);
    }

    console.log("✅ Azure raw:", JSON.stringify(j));

    const best = j?.NBest?.[0];
    const w = best?.Words?.[0];

    if (!best || !w) {
      latestResult = {
        ok: true,
        word,
        score: 0,
        phonemes: [],
        note: "no pronunciation assessment",
      };
      return res.json(latestResult);
    }

    latestResult = {
      ok: true,
      word,
      score: Math.round(best.AccuracyScore ?? 0),
      phonemes: (w.Phonemes || []).map(p => ({
        ipa: p.Phoneme,          // 原样 IPA（不改 ɹ）
        score: Math.round(p.AccuracyScore ?? 0),
      })),
    };

    res.json(latestResult);
  } catch (e) {
    console.error("❌ assess error", e);
    latestResult = { ok: false, error: "assessment failed" };
    res.json(latestResult);
  }
});

/* ===== iframe 拉最新评测结果 ===== */
app.get("/latest", (req, res) => {
  res.json(latestResult || { ok: false, error: "no result yet" });
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Server running")
);
