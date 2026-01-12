/* 从 URL 获取参数（Anki 复用用） */
const params = new URLSearchParams(location.search);
const word = params.get("word") || "important";

/* 示例：真实项目中用 fetch /assess 的返回 */
const result = window.__ASSESS_RESULT__; // 可替换成真实接口

document.getElementById("word").innerText = word;
document.getElementById("score").innerText = result.score + " 分";

const phonemeBox = document.getElementById("phonemes");

result.phonemes.forEach(p => {
  const div = document.createElement("div");
  div.className = "phoneme " + level(p.score);
  div.innerHTML = `
    <div>${p.symbol}</div>
    <div>${p.score}</div>
  `;
  div.onclick = () => {
    playPhoneme(p.symbol);
    showTip(p.symbol);
  };
  phonemeBox.appendChild(div);
});

function level(score) {
  if (score >= 90) return "good";
  if (score >= 70) return "mid";
  return "bad";
}

function playPhoneme(symbol) {
  new Audio(`audio_phoneme/${symbol}.mp3`).play();
}

function showTip(symbol) {
  document.getElementById("tip").innerText =
    window.PHONEME_TIPS?.[symbol] || "暂无纠音提示";
}
