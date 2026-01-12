/* ========= 音素音频（必须全局预创建，iOS 才能播） ========= */
const phonemeAudio = new Audio();
phonemeAudio.preload = "auto";

/* ========= 渲染评测结果 ========= */
function renderResult(data) {
  const box = document.getElementById("phoneme-bars");
  box.innerHTML = "";

  data.phonemes.forEach(p => {
    const bar = document.createElement("div");
    bar.className = "ph-bar";
    bar.style.background = scoreColor(p.score);

    bar.innerHTML = `
      <div class="char">${p.grapheme}</div>
      <div class="ipa">${p.symbol}</div>
      <div class="score">${p.score}</div>
    `;

    bar.onclick = () => {
      playPhoneme(p.symbol);
      showTip(p.symbol);
    };

    box.appendChild(bar);
  });
}

/* ========= 播放音素 ========= */
function playPhoneme(symbol) {
  phonemeAudio.pause();
  phonemeAudio.currentTime = 0;
  phonemeAudio.src =
    `/audio_phoneme/${encodeURIComponent(symbol)}.mp3`;
  phonemeAudio.play().catch(() => {});
}

/* ========= 显示纠音提示 ========= */
function showTip(symbol) {
  document.getElementById("tip").innerText =
    window.PHONEME_TIPS?.[symbol] || "暂无纠音提示";
}

/* ========= 工具 ========= */
function scoreColor(s) {
  if (s >= 90) return "#9fcd8a";
  if (s >= 70) return "#f2d37c";
  return "#ef8c8c";
}

/* ========= 导出给 Anki 使用 ========= */
window.renderResult = renderResult;
