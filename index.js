import express from "express";
import multer from "multer";
import fs from "fs";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const upload = multer({ dest: "uploads/" });

const AZURE_KEY = process.env.AZURE_KEY;
const AZURE_REGION = process.env.AZURE_REGION;

const AZURE_ENDPOINT =
  `https://${AZURE_REGION}.stt.speech.microsoft.com`;

app.use(cors());
app.options("*", cors());

app.get("/", (_, res) => res.send("OK"));

app.post("/assess", upload.single("audio"), async (req, res) => {
  try {
    const word = req.body.word;
    const audioBuffer = fs.readFileSync(req.file.path);

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

    const raw = await r.json();
    console.log("Azure raw:", JSON.stringify(raw));

    const nbest = raw?.NBest?.[0];
    const wordInfo = nbest?.Words?.[0];

    res.json({
      score: Math.round(nbest?.AccuracyScore || 0),
      phonemes: (wordInfo?.Phonemes || []).map(p => ({
        symbol: p.Phoneme,
        score: Math.round(p.AccuracyScore || 0)
      }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "assess failed" });
  } finally {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
