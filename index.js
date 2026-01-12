import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import fs from "fs";

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));

app.post("/assess", upload.single("audio"), async (req, res) => {
  try {
    const word = req.body.word;
    const audio = fs.readFileSync(req.file.path);

    const url =
      process.env.AZURE_ENDPOINT +
      `/speech/recognition/conversation/cognitiveservices/v1` +
      `?language=en-US` +
      `&format=detailed` +
      `&pronunciationAssessment.referenceText=${encodeURIComponent(word)}` +
      `&pronunciationAssessment.gradingSystem=HundredMark` +
      `&pronunciationAssessment.phonemeAlphabet=IPA` +
      `&pronunciationAssessment.dimension=Comprehensive`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": process.env.AZURE_KEY,
        "Content-Type": "audio/wav"
      },
      body: audio
    });

    const raw = await r.json();
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
    console.error(e);
    res.status(500).json({ error: "assess failed" });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
