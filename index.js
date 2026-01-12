import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import fs from "fs";

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));

/* ===== 用 REGION 生成 Azure Endpoint ===== */
const AZURE_REGION = process.env.AZURE_REGION;
const AZURE_KEY = process.env.AZURE_KEY;

if (!AZURE_REGION || !AZURE_KEY) {
  console.error("❌ Missing AZURE_REGION or AZURE_KEY");
}

const AZURE_ENDPOINT = `https://${AZURE_REGION}.stt.speech.microsoft.com`;

app.post("/assess", upload.single("audio"), async (req, res) => {
  try {
    const word = req.body.word;
    const audioBuffer = fs.readFileSync(req.file.path);

    const url =
      `${AZURE_ENDPOINT}/speech/recognition/conversation/cognitiveservices/v1` +
      `?language=en-US` +
      `&format=detailed` +
      `&pronunciationAssessment.referenceText=${encodeURIComponent(word)}` +
      `&pronunciationAssessment.gradingSystem=HundredMark` +
      `&pronunciationAssessment.phonemeAlphabet=IPA` +
      `&pronunciationAssessment.dimension=Comprehensive`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type": "audio/wav"
      },
      body: audioBuffer
    });

    /* ===== 新增：关键诊断 ===== */
    if (!r.ok) {
      const text = await r.text();
      console.error("❌ Azure HTTP Error:", r.status, text);
      return res.status(500).json({
        error: "azure_error",
        status: r.status,
        detail: text
      });
    }

    const raw = await r.json();
    console.log("✅ Azure raw:", JSON.stringify(raw).slice(0, 300));

    const nbest = raw?.NBest?.[0];
    const w = nbest?.Words?.[0];

    const phonemes =
      w?.Phonemes?.map(p => ({
        symbol: p.Phoneme,
        grapheme: p.Grapheme || "",
        score: Math.round(p.AccuracyScore || 0)
      })) || [];

    res.json({
      score: Math.round(nbest?.AccuracyScore || 0),
      phonemes
    });
  } catch (e) {
    console.error("❌ assess exception:", e);
    res.status(500).json({ error: "assess_exception" });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
