window.renderResult = function (data) {
  const box = document.getElementById("phoneme-bars");
  box.innerHTML = "";

  if (!data.phonemes || data.phonemes.length === 0) {
    box.innerHTML = "<div style='color:#999'>无音素数据</div>";
    return;
  }

  data.phonemes.forEach(p => {
    const bar = document.createElement("div");
    bar.className = "phoneme-bar";

    const ipa = document.createElement("div");
    ipa.className = "phoneme-ipa";
    ipa.innerText = p.symbol;

    const score = document.createElement("div");
    score.className = "phoneme-score";
    score.innerText = p.score;

    bar.appendChild(ipa);
    bar.appendChild(score);

    /* 点击播放音素音频 */
    bar.onclick = () => {
      const audio = new Audio(
        "https://anki-azure-kimi.onrender.com/audio_phoneme/" +
        encodeURIComponent(p.symbol) +
        ".mp3"
      );
      audio.play();
    };

    box.appendChild(bar);
  });
};
