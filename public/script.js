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
document.getElementById("tip-close").onclick = () => {
  tipOverlay.classList.add("hidden");
};

wordEl.textContent = word;

let mediaRecorder;
let audioChunks = [];

recBtn.onclick = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
  mediaRecorder.start();

  recBtn.disabled = true;
  stopBtn.disabled = false;
  statusEl.textContent = "录音中…";
};

stopBtn.onclick = async () => {
  mediaRecorder.stop();
  statusEl.textContent = "评测中…";

  mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: "audio/wav" });
    const fd = new FormData();
    fd.append("audio", blob);
    fd.append("word", word);

    const res = await fetch("/assess", { method: "POST", body: fd });
    const data = await res.json();

    renderResult(data);
    recBtn.disabled = false;
    stopBtn.disabled = true;
    statusEl.textContent = "";
  };
};

function renderResult(data) {
  barsEl.innerHTML = "";

  scoreEl.textContent = `发音分数：${data.score}`;

  data.phonemes.forEach(p => {
    const bar = document.createElement("div");
    bar.className = "bar" + (p.score < 60 ? " low" : "");

    const inner = document.createElement("div");
    inner.className = "bar-inner";
    inner.style.height = `${Math.max(p.score, 5)}%`;

    inner.innerHTML = `
      <div class="letters">${p.letters || ""}</div>
      <div class="ipa">${p.ipa}</div>
      <div class="p-score">${p.score}</div>
    `;

    bar.appendChild(inner);
    barsEl.appendChild(bar);

    bar.onclick = () => {
      new Audio(`/audio_phoneme/${p.ipa}.mp3`).play();

      tipIpa.textContent = p.ipa;
      tipText.textContent = PHONEME_TIPS[p.ipa] || "暂无纠音提示";
      tipOverlay.classList.remove("hidden");
    };
  });
}
