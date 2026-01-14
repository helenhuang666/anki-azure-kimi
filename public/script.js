// ========================
// DOM
// ========================
const recordBtn = document.getElementById("recordBtn");
const scoreEl = document.getElementById("score");
const barsEl = document.getElementById("phoneme-bars");

let mediaRecorder;
let audioChunks = [];

// ========================
// 音素映射（你要求的：ɹ → r）
// ========================
function normalizeIPA(ipa) {
  if (ipa === "ɹ") return "r";
  return ipa;
}

// ========================
// 播放音素音频（音量不衰减）
// ========================
function playPhoneme(ipa) {
  const p = normalizeIPA(ipa);
  const audio = new Audio(`/phonemes/${p}.mp3`);
  audio.volume = 1.0;
  audio.play();
}

// ========================
// 录音
// ========================
async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false   // 🔥 你反复问的点：已关闭自动增益
    }
  });

  mediaRecorder = new MediaRecorder(stream, {
    mimeType: "audio/webm"
  });

  audioChunks = [];

  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

  mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    await assess(blob);
  };

  mediaRecorder.start();
  recordBtn.textContent = "停止录音";
}

function stopRecording() {
  mediaRecorder.stop();
  recordBtn.textContent = "开始录音";
}

// ========================
// 点击录音
// ========================
recordBtn.onclick = () => {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    startRecording();
  } else {
    stopRecording();
  }
};

// ========================
// 评测
// ========================
async function assess(blob) {
  scoreEl.textContent = "正在评测…";
  barsEl.innerHTML = "";

  const word = document.getElementById("word").textContent.trim();

  const form = new FormData();
  form.append("audio", blob);
  form.append("word", word);

  const res = await fetch("/assess", {
    method: "POST",
    body: form
  });

  const data = await res.json();

  console.log("🎯 assess result:", data);

  renderResult(data);
}

// ========================
// 渲染结果（核心）
// ========================
function renderResult(data) {
  barsEl.innerHTML = "";

  if (!data || !Array.isArray(data.phonemes)) {
    scoreEl.textContent = "发音分数：0";
    return;
  }

  scoreEl.textContent = `发音分数：${data.score}`;

  data.phonemes.forEach(p => {
    const ipa = normalizeIPA(p.ipa);
    const score = Number(p.score) || 0;
    const letters = p.letters || "";

    // 外框
    const bar = document.createElement("div");
    bar.className = "phoneme-bar";

    // 高度（以底部为水平线）
    bar.style.height = `${Math.max(score, 5)}%`;

    // 颜色
    if (score >= 85) bar.classList.add("good");
    else if (score >= 60) bar.classList.add("mid");
    else bar.classList.add("bad");

    // 内容：竖向排列（你要求的）
    bar.innerHTML = `
      <div class="bar-score">${score}</div>
      <div class="bar-ipa">${ipa}</div>
      <div class="bar-letters">${letters}</div>
    `;

    // 点击播放 + 纠音
    bar.onclick = () => playPhoneme(ipa);

    barsEl.appendChild(bar);
  });
}
