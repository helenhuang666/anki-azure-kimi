/***********************
 * 基础元素
 ***********************/
const params = new URLSearchParams(location.search);
const word = params.get("word") || "";

const wordEl = document.getElementById("word");
const recBtn = document.getElementById("recBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const scoreEl = document.getElementById("score");
const barsEl = document.getElementById("phoneme-bars");

const tipOverlay = document.getElementById("tip-overlay");
const tipIpa = document.getElementById("tip-ipa");
const tipText = document.getElementById("tip-text");
document.getElementById("tip-close").onclick = () =>
  tipOverlay.classList.add("hidden");

wordEl.textContent = word;

/***********************
 * 录音（稳定版）
 ***********************/
let mediaRecorder;
let audioChunks = [];

recBtn.onclick = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });

  mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  audioChunks = [];

  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
  mediaRecorder.start();

  recBtn.disabled = true;
  stopBtn.disabled = false;
  statusEl.textContent = "录音中…（请读完整）";
};

stopBtn.onclick = () => {
  mediaRecorder.stop();
  statusEl.textContent = "评测中…";

  mediaRecorder.onstop = async () => {
    const webmBlob = new Blob(audioChunks, { type: "audio/webm" });
    const wavBlob = await convertToWav16k(webmBlob);

    const fd = new FormData();
    fd.append("audio", wavBlob);
    fd.append("word", word);

    const res = await fetch("/assess", {
      method: "POST",
      body: fd
    });
    const data = await res.json();

    renderResult(data);

    recBtn.disabled = false;
    stopBtn.disabled = true;
    statusEl.textContent = "";
  };
};

/***********************
 * 16kHz WAV 转换
 ***********************/
async function convertToWav16k(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const channel = audioBuffer.getChannelData(0);
  const wavBuffer = encodeWav(channel, 16000);
  return new Blob([wavBuffer], { type: "audio/wav" });
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(o, s) {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/***********************
 * 音素规则（r / l）
 ***********************/
function isVowel(ipa) {
  return /[aeiouɑɔəɜɪʊ]/.test(ipa);
}

function resolvePhoneme(p, index, phonemes) {
  const ipa = p.Phoneme;
  const next = phonemes[index + 1]?.Phoneme || "";

  if (ipa === "ɹ") {
    return {
      key: isVowel(next) ? "r_initial" : "r_final",
      display: "r"
    };
  }

  if (ipa === "l") {
    return {
      key: isVowel(next) ? "l_light" : "l_dark",
      display: "l"
    };
  }

  return {
    key: ipa,
    display: ipa
  };
}

/***********************
 * 字母切割（工程可用版）
 ***********************/
function splitGrapheme(text, total, index) {
  if (!text) return "";
  const size = Math.ceil(text.length / total);
  return text.slice(index * size, (index + 1) * size);
}

/***********************
 * 渲染结果
 ***********************/
function renderResult(data) {
  barsEl.innerHTML = "";

  if (!data || !data.raw || !data.raw.Words?.length) {
    scoreEl.textContent = "发音分数：0";
    return;
  }

  const wordData = data.raw.Words[0];
  const phonemes = wordData.Phonemes || [];
  const grapheme = wordData.Syllables?.[0]?.Grapheme || "";

  scoreEl.textContent = `发音分数：${data.score}`;

  phonemes.forEach((p, i) => {
    const resolved = resolvePhoneme(p, i, phonemes);
    const letters = splitGrapheme(grapheme, phonemes.length, i);
    const score = Math.round(p.AccuracyScore ?? 0);

    const bar = document.createElement("div");
    bar.className = "bar" + (score < 60 ? " low" : "");

    const inner = document.createElement("div");
    inner.className = "bar-inner";
    inner.style.height = `${Math.max(score, 10)}%`;

    inner.innerHTML = `
      <div class="letters">${letters}</div>
      <div class="ipa">${resolved.display}</div>
      <div class="p-score">${score}</div>
    `;

    bar.appendChild(inner);
    barsEl.appendChild(bar);

    bar.onclick = () => {
      new Audio(`/audio_phoneme/${resolved.key}.mp3`).play();
      tipIpa.textContent = resolved.display;
      tipText.textContent =
        PHONEME_TIPS[resolved.key] || "暂无纠音提示";
      tipOverlay.classList.remove("hidden");
    };
  });
}
