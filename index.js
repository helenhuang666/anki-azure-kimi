import express from "express";
import multer from "multer";
import fs from "fs";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const upload = multer({ dest: "uploads/" });

/* =========================
   环境变量
========================= */
const AZURE_KEY = process.env.AZURE_KEY;
const AZURE_REGION = process.env.AZURE_REGION;

if (!AZURE_KEY || !AZURE_REGION) {
  console.error("❌ Missing AZURE_KEY or AZURE_REGION");
}

/* =========================
   Azure Endpoint（自动拼）
   不需要 AZURE_ENDPOINT
========================= */
const AZURE_ENDPOINT =
  `https://${AZURE_REGION}.stt.speech.microsoft.com`;

/* =========================
   CORS（关键）
========================= */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.options("*", cors());

/* =========================
   Health Check
========================= */
app.get("/", (req, res) => {
  res.send("OK");
});

/* =========================
   Pronunciation Assess
========================= */
app.post("/assess", upload.single("audio"), async (req, res) => {
  try {
    const word = req.body.word;
    if (!word || !req.file) {
      return res.status(400).json({ error: "missing word or audio" });
    }

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

    /* ===== Azure HTTP 错误直接返回 ===== */
    if (!r.ok) {
      const text = await r.text();
      console.error("❌ Azure HTTP Error:", r.status, text);
      return res.status(500).json({
        error: "azure_http_error",
        status: r.status,
        detail: text
      });
    }

    const raw = await r.json();
    console.log("✅ Azure raw:", JSON.stringify(raw));

    /* ===== 解析结果 ===== */
    const nbest = raw?.NBest?.[0];
    const wordInfo = nbest?.Words?.[0];

    const phonemes =
      wordInfo?.Phonemes?.map(p => ({
        symbol: p.Phoneme,
        score: Math.round(p.AccuracyScore || 0)
      })) || [];

    res.json({
      score: Math.round(nbest?.AccuracyScore || 0),
      phonemes,
      raw   // 前端 UI 用得上（音素级）
    });
  } catch (e) {
    console.error("❌ assess exception:", e);
    res.status(500).json({ error: "assess_exception" });
  } finally {
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
  }
});

/* =========================
   Start Server
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
