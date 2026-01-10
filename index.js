import express from "express";
import multer from "multer";
import cors from "cors";
import fetch from "node-fetch";
import fs from "fs-extra";

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());

/**
 * POST /api/assess
 * form-data:
 *  - audio: Blob
 *  - text: string
 */
app.post("/api/assess", upload.single("audio"), async (req, res) => {
  try {
    const audioPath = req.file.path;
    const referenceText = req.body.text || "";

    const audioBuffer = await fs.readFile(audioPath);

    const azureRes = await fetch(
      `https://${process.env.AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": process.env.AZURE_KEY,
          "Content-Type": "audio/webm; codecs=opus",
          "Pronunciation-Assessment":
            Buffer.from(
              JSON.stringify({
                ReferenceText: referenceText,
                GradingSystem: "HundredMark",
                Granularity: "Word",
                Dimension: "Pronunciation"
              })
            ).toString("base64")
        },
        body: audioBuffer
      }
    );

    const data = await azureRes.json();

    const score =
      data?.NBest?.[0]?.PronunciationAssessment?.PronunciationScore ?? 0;

    res.json({
      pronunciationScore: score
    });

    fs.remove(audioPath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "assessment failed" });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
