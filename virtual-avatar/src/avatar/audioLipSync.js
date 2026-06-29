// TTS 재생 오디오의 진폭(RMS)을 공유해 아바타 입 모양(MouthOpen)을 구동한다.
// App 쪽에서 재생하는 <audio> 엘리먼트를 connectAudioElement로 그래프에 물리고,
// AvatarScene이 매 프레임 sampleAudioLevel()로 레벨을 읽어간다.
let audioCtx = null;
let analyser = null;
let timeData = null;
let connectedDestination = false;

function ensureGraph() {
  if (audioCtx) return true;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return false;
  audioCtx = new AudioCtx();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  timeData = new Uint8Array(analyser.frequencyBinCount);
  return true;
}

export function connectAudioElement(el) {
  try {
    if (!ensureGraph()) return;
    audioCtx.resume?.();
    // 엘리먼트 출력을 분석기 → 스피커로 흘린다. (분석기는 한 번만 destination에 연결)
    const source = audioCtx.createMediaElementSource(el);
    source.connect(analyser);
    if (!connectedDestination) {
      analyser.connect(audioCtx.destination);
      connectedDestination = true;
    }
  } catch (error) {
    // 이미 연결된 엘리먼트면 createMediaElementSource가 throw — 무시한다.
  }
}

export function audioGraphReady() {
  return connectedDestination;
}

export function sampleAudioLevel() {
  if (!analyser) return 0;
  analyser.getByteTimeDomainData(timeData);
  let sum = 0;
  for (let i = 0; i < timeData.length; i += 1) {
    const v = (timeData[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / timeData.length); // RMS ~0..1
}
