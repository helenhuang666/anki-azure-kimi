const params = new URLSearchParams(location.search);
const word = params.get("word") || "";

wordEl.textContent = word;

function renderResult(data) {
  barsEl.innerHTML = "";
  scoreEl.textContent = `发音分数：${data.score}`;

  const phonemes = data.raw.Words[0].Phonemes;
  const grapheme = data.raw.Words[0].Syllables[0].Grapheme;

  phonemes.forEach((p, i) => {
    const resolved = resolvePhoneme(p, i, phonemes, word);

    const letters = splitGrapheme(grapheme, phonemes.length, i);
    const score = Math.round(p.AccuracyScore ?? 0);

    const bar = document.createElement("div");
    bar.className = "bar" + (score < 60 ? " low" : "");

    const inner = document.createElement("div");
    inner.className = "bar-inner";
    inner.style.height = `${Math.max(score, 8)}%`;

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
      tipText.textContent = PHONEME_TIPS[resolved.key] || "暂无纠音提示";
      tipOverlay.classList.remove("hidden");
    };
  });
}

function splitGrapheme(text, total, index) {
  const size = Math.ceil(text.length / total);
  return text.slice(index * size, (index + 1) * size);
}
