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
   Azure Endpoint
========================= */
const AZURE_ENDPOINT =
  `https://${AZURE_REGION}.stt.speech.microsoft.com`;

/* =========================
   CORS（Anki 必须）
========================= */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Pronunciation-Assessment"]
}));
app.options("*", cors());

/* =========================
   Health Check
========================= */
app.get("/", (req, res) => {
  res.send("OK");
});

/* =========================
   Pronunciation Assessment
========================= */
app.post("/assess", upload.single("audio"), async (req, res) => {
  try {
    const word = req.body.word;
    if (!word || !req.file) {
      return res.status(400).json({ error: "missing word or audio" });
    }

    const audioBuffer = fs.readFileSync(req.file.path);

    /* ===== Pronunciation Assessment 配置（关键） ===== */
    const paConfig = {
      ReferenceText: word,
      GradingSystem: "HundredMark",
      PhonemeAlphabet: "IPA",
      Dimension: "Comprehensive"
    };

    const paHeader = Buffer
      .from(JSON.stringify(paConfig))
      .toString("base64");

    const url =
      `${AZURE_ENDPOINT}/speech/recognition/conversation/cognitiveservices/v1` +
      `?language=en-US&format=detailed`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type": "audio/wav",
        "Pronunciation-Assessment": paHeader
      },
      body: audioBuffer
    });

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

    /* ===== 解析发音评测结果 ===== */
    const nbest = raw?.NBest?.[0];
    const wordInfo = nbest?.Words?.[0];

    const score = Math.round(nbest?.AccuracyScore || 0);

    const phonemes =
      wordInfo?.Phonemes?.map(p => ({
        symbol: p.Phoneme,
        score: Math.round(p.AccuracyScore || 0)
      })) || [];

    res.json({
      score,
      phonemes,
      raw
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
