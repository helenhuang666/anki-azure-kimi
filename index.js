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
  `https://${AZURE_REGION}.stt.speech.microsoft.com` +
  `/speech/recognition/conversation/cognitiveservices/v1`;

app.post("/assess", upload.single("audio"), async (req, res) => {
  try {
    const word = req.body.word?.trim();
    const audio = req.file?.buffer;

    if (!word || !audio) {
      return res.json({ error: "missing word or audio" });
    }

    const url =
      `${AZURE_URL}?language=en-US&format=detailed` +
      `&pronunciationAssessment.referenceText=${encodeURIComponent(word)}` +
      `&pronunciationAssessment.gradingSystem=HundredMark` +
      `&pronunciationAssessment.phonemeAlphabet=IPA` +
      `&pronunciationAssessment.dimension=Comprehensive`;

    const az = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type": "audio/wav"
      },
      body: audio
    });

    const j = await az.json();
    console.log("Azure raw:", JSON.stringify(j));

    const nbest = j?.NBest?.[0];
    const w = nbest?.Words?.[0];

    // Azure 没听到
    if (!nbest || !nbest.Lexical) {
      return res.json({
        score: 0,
        phonemes: [],
        noSpeech: true
      });
    }

    const grapheme = w?.Syllables?.[0]?.Grapheme || word;
    const rawPhonemes = w?.Phonemes || [];

    // 启发式字母切割（教学用）
    const per = Math.max(1, Math.floor(grapheme.length / rawPhonemes.length));
    let cursor = 0;

    const phonemes = rawPhonemes.map((p, i) => {
      const letters =
        i === rawPhonemes.length - 1
          ? grapheme.slice(cursor)
          : grapheme.slice(cursor, cursor + per);

      cursor += per;

      return {
        ipa: p.Phoneme,
        score: Math.round(p.AccuracyScore ?? 0),
        letters
      };
    });

    res.json({
      score: Math.round(nbest.AccuracyScore ?? 0),
      phonemes
    });

  } catch (e) {
    console.error("assess error", e);
    res.json({ error: "assessment failed" });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Server running")
);
