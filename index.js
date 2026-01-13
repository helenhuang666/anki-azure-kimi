import express from "express";
import fetch from "node-fetch";
import multer from "multer";
import cors from "cors";

const app = express();
const upload = multer();

app.use(cors({ origin: "*", methods: ["GET","POST","OPTIONS"] }));
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
    const wordInfo = nbest?.Words?.[0];

    if (!wordInfo) {
      return res.json({ score: 0, phonemes: [] });
    }

    const grapheme = wordInfo.Syllables?.[0]?.Grapheme || word;
    const phonemesRaw = wordInfo.Phonemes || [];

    // 🔧 启发式切割 grapheme
    const per = Math.floor(grapheme.length / phonemesRaw.length) || 1;
    let cursor = 0;

    const phonemes = phonemesRaw.map((p, i) => {
      let letters;
      if (i === phonemesRaw.length - 1) {
        letters = grapheme.slice(cursor);
      } else {
        letters = grapheme.slice(cursor, cursor + per);
      }
      cursor += per;

      return {
        ipa: p.Phoneme,
        score: Math.round(p.AccuracyScore ?? 0),
        letters
      };
    });

    res.json({
      score: Math.round(nbest.AccuracyScore ?? 0),
      phonemes,
      shortAudio: wordInfo.Duration < 1_000_000 // <0.1s
    });

  } catch (e) {
    console.error(e);
    res.json({ error: "assessment failed" });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Server running")
);
