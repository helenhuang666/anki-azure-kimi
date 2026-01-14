<script>
/* ======================
   全局状态
====================== */
let mediaStream = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

const statusEl = document.getElementById("status");
const scoreEl = document.getElementById("score");
const phonemeEl = document.getElementById("phonemes");
const word = "{{Word}}".trim();

/* ======================
   工具：日志
====================== */
function log(msg) {
  console.log("[REC]", msg);
  statusEl.textContent = msg;
}

/* ======================
   工具：ArrayBuffer → WAV
====================== */
function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function encodeWAV(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.getChannelData(0);
  const pcmBuffer = floatTo16BitPCM(samples);

  const buffer = new ArrayBuffer(44 + pcmBuffer.byteLength);
  const view = new DataView(buffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcmBuffer.byteLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, pcmBuffer.byteLength, true);

  new Uint8Array(buffer, 44).set(new Uint8Array(pcmBuffer));
  return buffer;
}

/* ======================
   开始录音（强制 WAV）
====================== */
async function startRecording() {
  if (isRecording) return;
  if (!word) {
    alert("Word 字段为空");
    return;
  }

  scoreEl.textContent = "";
  phonemeEl.innerHTML = "";
  log("请求麦克风…");

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    /* ===== 关键点：强制 audio/wav ===== */
    mediaRecorder = new MediaRecorder(mediaStream, {
      mimeType: "audio/wav"
    });

  } catch (e) {
    console.error(e);
    alert("当前 Anki 环境不支持 WAV 录音");
    return;
  }

  audioChunks = [];
  mediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) {
      audioChunks.push(e.data);
    }
  };

  mediaRecorder.onstart = () => {
    isRecording = true;
    log("录音中… 再点一次停止");
  };

  mediaRecorder.onstop = handleStop;

  mediaRecorder.start();
}

/* ======================
   停止录音 & 评测
====================== */
async function handleStop() {
  isRecording = false;
  log("处理音频中…");

  mediaStream.getTracks().forEach(t => t.stop());

  const blob = new Blob(audioChunks, { type: "audio/wav" });
  log("WAV 大小: " + blob.size);

  if (blob.size < 1000) {
    log("❌ 录到的是静音（Anki 无法获取声音）");
    return;
  }

  /* ===== 再次 decode 校验是否真有声音 ===== */
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AudioContext();
  let audioBuffer;

  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } catch (e) {
    log("❌ WAV 解码失败（Anki 限制）");
    return;
  }

  const channel = audioBuffer.getChannelData(0);
  const energy = channel.reduce((s, v) => s + Math.abs(v), 0);

  if (energy < 0.01) {
    log("❌ 音频为静音（不是你没说话，是 Anki）");
    return;
  }

  /* ===== 重新编码成 Azure 100% 可用 WAV ===== */
  const wavBuffer = encodeWAV(audioBuffer);
  const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });

  log("上传 Azure 评测…");

  const form = new FormData();
  form.append("audio", wavBlob, "record.wav");
  form.append("word", word);

  try {
    const r = await fetch("/assess", { method: "POST", body: form });
    const j = await r.json();

    if (j.error) {
      log("❌ 评测失败");
      console.error(j);
      return;
    }

    scoreEl.textContent = "分数：" + j.score;
    log("完成");

    (j.phonemes || []).forEach(p => {
      const span = document.createElement("span");
      span.textContent = `${p.ipa} (${p.score}) `;
      phonemeEl.appendChild(span);
    });

  } catch (e) {
    console.error(e);
    log("❌ 网络或解析错误");
  }
}

/* ======================
   按钮绑定
====================== */
document.getElementById("recordBtn").onclick = () => {
  if (!isRecording) {
    startRecording();
  } else {
    mediaRecorder.stop();
  }
};
</script>
