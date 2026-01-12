import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

const AZURE_KEY = process.env.AZURE_KEY;
const AZURE_REGION = process.env.AZURE_REGION; // e.g. eastasia

app.post("/assess", upload.single("audio"), async (req, res) => {
  try {
    const word = req.body.word;
    const audioBuffer = req.file?.buffer;

    if (!word || !audioBuffer) {
      return res.status(400).json({ error: "Missing word or audio" });
    }

    console.log("Received word:", word);
    console.log("Audio size:", audioBuffer.length);

    // 1️⃣ Pronunciation Assessment Header
    const assessment = {
      ReferenceText: word,
      GradingSystem: "HundredMark",
      Granularity: "Phoneme",
      PhonemeAlphabet: "IPA"
    };

    const assessmentHeader = Buffer
      .from(JSON.stringify(assessment))
      .toString("base64");

    // 2️⃣ Azure endpoint
    const url = `https://${AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`;

    const azureRes = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type": "audio/wav",
        "Pronunciation-Assessment": assessmentHeader
      },
      body: audioBuffer
    });

    // 3️⃣ 永远先 text()，防炸
    const text = await azureRes.text();
    console.log("Azure raw response:", text);

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "Azure did not return JSON",
        raw: text
      });
    }

    // 4️⃣ 判断是否真的有分
    const pa = result?.NBest?.[0]?.PronunciationAssessment;

    if (!pa) {
      return res.json({
        success: false,
        message: "No pronunciation score returned",
        raw: result
      });
    }

    // 5️⃣ 正常返回
    res.json({
      success: true,
      accuracy: pa.AccuracyScore,
      fluency: pa.FluencyScore,
      completeness: pa.CompletenessScore,
      pronunciation: pa.PronScore,
      detail: pa
    });

  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
