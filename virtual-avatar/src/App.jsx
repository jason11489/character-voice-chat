import React, { useEffect, useRef, useState } from "react";
import AvatarScene from "./avatar/AvatarScene.jsx";
import { askPiLLM, getApiBase, warmupLLM, resetLLMSession } from "./api/llmApi.js";
import { getTTSHealth, getTTSVoices, prefetchSpeech, synthesizeSpeech } from "./api/ttsApi.js";
import { transcribeAudio } from "./api/sttApi.js";
import { connectAudioElement } from "./avatar/audioLipSync.js";
import { demoEvents } from "./mock/demoEvents.js";

const avatarModels = [
  {
    id: "round",
    label: "보스 치킨",
    name: "보스 치킨",
    modelPath: "/models/untitled-colored.glb",
    verticalOffset: 0.1,
  },
  {
    id: "human",
    label: "보스베이비",
    name: "보스베이비",
    modelPath: "/models/chat_character.glb",
  },
];

function parseTimeParts(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return {
    hours: Number.isFinite(hours) ? hours : 0,
    minutes: Number.isFinite(minutes) ? minutes : 0,
    label: value,
  };
}

function AnalogClock({ time }) {
  const hourRotation = (time.hours % 12) * 30 + time.minutes * 0.5;
  const minuteRotation = time.minutes * 6;

  return (
    <div className="analog-clock" aria-label={`현재 시각 ${time.label}`}>
      <span className="clock-mark mark-12">12</span>
      <span className="clock-mark mark-3">3</span>
      <span className="clock-mark mark-6">6</span>
      <span className="clock-mark mark-9">9</span>
      <span className="clock-hand hour-hand" style={{ transform: `rotate(${hourRotation}deg)` }} />
      <span className="clock-hand minute-hand" style={{ transform: `rotate(${minuteRotation}deg)` }} />
      <span className="clock-pin" />
      <span className="clock-digital">{time.label}</span>
    </div>
  );
}

function ChatWindow({ messages, liveAvatarText }) {
  const scrollRef = useRef(null);
  const items = liveAvatarText
    ? [...messages, { id: "live", role: "avatar", text: liveAvatarText }]
    : messages;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, liveAvatarText]);

  if (items.length === 0) return null;

  return (
    <div className="chat-window">
      <div className="chat-scroll" ref={scrollRef}>
        {items.map((message) => (
          <div className={`chat-msg chat-${message.role}`} key={message.id}>
            <div className="chat-bubble">{message.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getDeviceSignalLabel(status) {
  if (status === "active") return "실행 중";
  if (status === "ready") return "명령 대기";
  return "대기";
}

function estimateSpeechMs(text) {
  return Math.max(2600, text.length * 88);
}

function formatClock(date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getInitialAvatarId() {
  if (typeof window === "undefined") return "round";
  return new URLSearchParams(window.location.search).get("avatar") === "human" ? "human" : "round";
}

function getInitialSunglasses() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("sunglasses") === "1";
}

function getInitialDemo() {
  if (typeof window === "undefined") return demoEvents[0];
  const mode = new URLSearchParams(window.location.search).get("mode");
  return demoEvents.find((demo) => demo.id === mode) || demoEvents[0];
}

function buildScenarioContext(scenario) {
  return {
    scene: scenario.sceneTitle,
    now: formatClock(new Date()),
    data: scenario.data,
    devices: scenario.devices,
  };
}

function normalizeLLMResult(result, fallback) {
  return {
    text: result?.text || fallback.text,
    emotion: result?.emotion || fallback.emotion || "thinking",
    action: result?.action || fallback.action || "thinking",
  };
}

function createSentenceSplitter(onSentence, { eagerFirstChunk = false } = {}) {
  let buffer = "";
  let firstEmitted = false;
  const boundary = /[.!?。！？\n]/;
  const comma = /[,，、]/;
  // 합성 시간 ∝ 글자 수(고정 floor ~0.5s)라, 첫 조각만 최대한 짧게 끊어 첫 음성을 앞당긴다.
  // MIN=3 이면 "좋아,"/"그래," 같은 선두 추임새 쉼표에서 바로 끊긴다(이후 조각은 문장 단위).
  const FIRST_CHUNK_MIN = 3; // 너무 짧은 첫 조각 방지(최소 글자)
  const FIRST_CHUNK_MAX = 14; // 쉼표가 없으면 이 길이에서 끊어 첫 음성을 앞당김

  const emit = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSentence(trimmed);
    firstEmitted = true;
  };

  return {
    push(delta) {
      buffer += delta;
      let match;

      while ((match = boundary.exec(buffer))) {
        emit(buffer.slice(0, match.index + 1));
        buffer = buffer.slice(match.index + 1);
      }

      // 첫 조각만: 문장이 아직 안 끝났어도 쉼표나 일정 길이에서 미리 끊어 합성을 시작한다.
      if (eagerFirstChunk && !firstEmitted) {
        const c = comma.exec(buffer);
        if (c && c.index + 1 >= FIRST_CHUNK_MIN) {
          emit(buffer.slice(0, c.index + 1));
          buffer = buffer.slice(c.index + 1);
        } else if (buffer.trim().length >= FIRST_CHUNK_MAX) {
          const slice = buffer.slice(0, FIRST_CHUNK_MAX);
          const lastSpace = slice.lastIndexOf(" ");
          const cut = lastSpace >= FIRST_CHUNK_MIN ? lastSpace : FIRST_CHUNK_MAX;
          emit(buffer.slice(0, cut));
          buffer = buffer.slice(cut);
        }
      }
    },
    flush() {
      const tail = buffer.trim();
      buffer = "";
      emit(tail);
    },
  };
}

function splitSentences(text) {
  return text
    .match(/[^.!?。！？\n]+[.!?。！？]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) || [];
}

export default function App() {
  const initialDemoRef = useRef(getInitialDemo());
  const initialDemo = initialDemoRef.current;
  const [selectedAvatarId, setSelectedAvatarId] = useState(getInitialAvatarId);
  const [bossBabySunglasses, setBossBabySunglasses] = useState(getInitialSunglasses);
  const [panelOpen, setPanelOpen] = useState(true);
  const [messages, setMessages] = useState(() => [
    { id: 0, role: "user", text: initialDemo.userText },
  ]);
  const messageIdRef = useRef(1);
  const [activeDemo, setActiveDemo] = useState(initialDemo);
  const [userText, setUserText] = useState(initialDemo.userText);
  const [avatarText, setAvatarText] = useState(initialDemo.assistant.text);
  const [emotion, setEmotion] = useState(initialDemo.assistant.emotion);
  const [action, setAction] = useState("idle");
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [warming, setWarming] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [llmState, setLlmState] = useState("ready");
  const [ttsState, setTtsState] = useState("idle");
  const [ttsBackend, setTtsBackend] = useState("");
  const [ttsVoices, setTtsVoices] = useState([]);
  const [ttsVoice, setTtsVoice] = useState("");
  const [ttsRate, setTtsRate] = useState(1);
  const [ttsSdp, setTtsSdp] = useState(0.6);
  const [ttsNoise, setTtsNoise] = useState(1.0);
  const speakingTimerRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef("");
  const audioDoneRef = useRef(null);
  const utteranceRef = useRef(null);
  const ttsQueueRef = useRef([]);
  const ttsPumpRef = useRef(null);
  const ttsGenerationRef = useRef(0);
  const ttsOptionsRef = useRef({ rate: 1, voice: "", sdpRatio: 0.5, noiseScaleW: 0.9 });
  const spokenTextRef = useRef("");
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const [clock, setClock] = useState(() => formatClock(new Date()));

  useEffect(() => {
    let cancelled = false;
    const fixedTexts = demoEvents.map((demo) => demo.assistant.text);

    async function prefetchFixedSpeech() {
      try {
        await getTTSHealth();
        const sentenceGroups = fixedTexts.map(splitSentences);

        for (const sentences of sentenceGroups) {
          if (cancelled) return;
          if (sentences[0]) await prefetchSpeech(sentences[0]);
        }

        for (const sentences of sentenceGroups) {
          for (const sentence of sentences.slice(1)) {
            if (cancelled) return;
            await prefetchSpeech(sentence);
          }
        }
      } catch (error) {
        console.info("TTS prefetch skipped.", error);
      }
    }

    prefetchFixedSpeech();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setLlmState("warming");
    warmupLLM(buildScenarioContext(demoEvents[0])).finally(() => {
      setWarming(false);
      setLlmState("ready");
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadTtsConfig() {
      try {
        const health = await getTTSHealth();
        if (!cancelled) {
          setTtsBackend(health.backend || "");
          if (typeof health.melo_sdp_ratio === "number") setTtsSdp(health.melo_sdp_ratio);
          if (typeof health.melo_noise_scale_w === "number") setTtsNoise(health.melo_noise_scale_w);
        }
      } catch (error) {
        console.info("TTS health unavailable.", error);
      }
      try {
        const voices = await getTTSVoices();
        if (!cancelled) setTtsVoices(voices);
      } catch (error) {
        console.info("TTS voices unavailable.", error);
      }
    }
    loadTtsConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    ttsOptionsRef.current = {
      rate: ttsRate,
      voice: ttsVoice,
      sdpRatio: ttsSdp,
      noiseScaleW: ttsNoise,
    };
  }, [ttsRate, ttsVoice, ttsSdp, ttsNoise]);

  function stopAudio() {
    ttsGenerationRef.current += 1;
    ttsQueueRef.current = [];

    if (window.speechSynthesis && utteranceRef.current) {
      utteranceRef.current.onstart = null;
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
      window.speechSynthesis.cancel();
      utteranceRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.onplay = null;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = "";
      audioDoneRef.current?.();
      audioRef.current = null;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = "";
    }
  }

  function playAudioBlob(blob, generation) {
    return new Promise((resolve, reject) => {
      if (generation !== ttsGenerationRef.current) {
        resolve();
        return;
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audioUrlRef.current = url;
      connectAudioElement(audio);
      let settled = false;

      const cleanup = () => {
        if (audioRef.current === audio) audioRef.current = null;
        if (audioUrlRef.current === url) audioUrlRef.current = "";
        URL.revokeObjectURL(url);
      };
      const finish = (error) => {
        if (settled) return;
        settled = true;
        if (audioDoneRef.current === finish) audioDoneRef.current = null;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      audioDoneRef.current = finish;

      audio.onplay = () => {
        setSpeaking(true);
      };
      audio.onended = () => finish();
      audio.onerror = () => finish(new Error("TTS audio playback failed"));

      audio.play().catch((error) => finish(error));
    });
  }

  function revealSpokenSentence(sentence) {
    spokenTextRef.current = spokenTextRef.current
      ? `${spokenTextRef.current} ${sentence}`
      : sentence;
    setAvatarText(spokenTextRef.current);
  }

  async function drainTTSQueue(generation) {
    if (ttsPumpRef.current !== null) return;
    ttsPumpRef.current = generation;
    let pending = null;

    const dequeue = () => {
      const text = ttsQueueRef.current.shift();
      return { text, audio: synthesizeSpeech(text, ttsOptionsRef.current) };
    };

    try {
      await getTTSHealth();

      while (
        generation === ttsGenerationRef.current
        && (pending || ttsQueueRef.current.length > 0)
      ) {
        const current = pending || dequeue();
        pending = null;
        const blob = await current.audio;

        if (generation !== ttsGenerationRef.current) break;
        if (ttsQueueRef.current.length > 0) {
          pending = dequeue();
        }

        // Reveal this sentence's text exactly as its audio starts playing.
        revealSpokenSentence(current.text);
        await playAudioBlob(blob, generation);
      }

      if (generation === ttsGenerationRef.current) {
        setSpeaking(false);
        setAction("idle");
      }
    } catch (error) {
      console.info("Streaming TTS unavailable.", error);
      if (generation === ttsGenerationRef.current) {
        const remaining = ttsQueueRef.current.join(" ");
        ttsQueueRef.current = [];
        if (remaining) {
          revealSpokenSentence(remaining);
          playBrowserTTS(remaining, estimateSpeechMs(remaining));
        }
      }
    } finally {
      if (ttsPumpRef.current === generation) {
        ttsPumpRef.current = null;
      }
      if (ttsQueueRef.current.length > 0) {
        drainTTSQueue(ttsGenerationRef.current);
      }
    }
  }

  function enqueueTTS(sentence, generation) {
    const cleaned = sentence.replace(/\s+/g, " ").trim();
    if (!cleaned || generation !== ttsGenerationRef.current) return;
    ttsQueueRef.current.push(cleaned);
    drainTTSQueue(generation);
  }

  function stopSpeakingAfter(ms) {
    if (speakingTimerRef.current) {
      window.clearTimeout(speakingTimerRef.current);
    }

    speakingTimerRef.current = window.setTimeout(() => {
      setSpeaking(false);
      setAction("idle");
    }, ms);
  }

  function playBrowserTTS(text, fallbackMs) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      stopSpeakingAfter(fallbackMs);
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const koreanVoice = voices.find((voice) => voice.lang?.toLowerCase().startsWith("ko"));

    if (koreanVoice) {
      utterance.voice = koreanVoice;
    }

    utterance.lang = "ko-KR";
    utterance.rate = 1.02;
    utterance.pitch = 1.16;
    utterance.volume = 1;
    utteranceRef.current = utterance;

    utterance.onstart = () => {
      setSpeaking(true);
      if (speakingTimerRef.current) {
        window.clearTimeout(speakingTimerRef.current);
        speakingTimerRef.current = null;
      }
      stopSpeakingAfter(fallbackMs + 1200);
    };

    utterance.onend = () => {
      if (speakingTimerRef.current) {
        window.clearTimeout(speakingTimerRef.current);
        speakingTimerRef.current = null;
      }
      setSpeaking(false);
      setAction("idle");
      utteranceRef.current = null;
    };

    utterance.onerror = () => {
      utteranceRef.current = null;
      stopSpeakingAfter(fallbackMs);
    };

    window.speechSynthesis.speak(utterance);
  }

  async function playTTS(text, fallbackMs) {
    stopAudio();

    try {
      await getTTSHealth();

      const blob = await synthesizeSpeech(text, ttsOptionsRef.current);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audioUrlRef.current = url;
      connectAudioElement(audio);

      audio.onplay = () => {
        setSpeaking(true);
        if (speakingTimerRef.current) {
          window.clearTimeout(speakingTimerRef.current);
          speakingTimerRef.current = null;
        }
      };

      audio.onended = () => {
        setSpeaking(false);
        setAction("idle");
        audioRef.current = null;
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = "";
        }
      };

      audio.onerror = () => {
        stopSpeakingAfter(fallbackMs);
      };

      await audio.play();
    } catch (error) {
      console.info("TTS unavailable. Falling back to browser/timer lip sync.", error);
      stopSpeakingAfter(fallbackMs);
    }
  }

  function speak(result) {
    if (speakingTimerRef.current) {
      window.clearTimeout(speakingTimerRef.current);
    }
    stopAudio();
    spokenTextRef.current = "";

    setEmotion(result.emotion);
    setAction(result.action);
    setSpeaking(true);

    const generation = ttsGenerationRef.current;
    const sentences = splitSentences(result.text);
    if (sentences.length === 0) {
      setAvatarText(result.text);
      stopSpeakingAfter(estimateSpeechMs(result.text));
      return;
    }
    sentences.forEach((sentence) => enqueueTTS(sentence, generation));
  }

  // 새 발화를 시작할 때, 직전 아바타 답변을 히스토리에 굳히고 사용자 말을 쌓는다.
  function pushUserTurn(userMessage) {
    const previousReply = avatarText;
    setMessages((prev) => {
      const next = [...prev];
      if (previousReply) {
        next.push({ id: (messageIdRef.current += 1), role: "avatar", text: previousReply });
      }
      next.push({ id: (messageIdRef.current += 1), role: "user", text: userMessage });
      return next;
    });
  }

  async function runPrompt(text) {
    const trimmed = text.trim();
    if (!trimmed || loading || warming || resetting) return;

    pushUserTurn(trimmed);
    setLoading(true);
    setErrorText("");
    setEmotion("thinking");
    setAction("thinking");
    setSpeaking(false);
    setAvatarText("음... 지금 집 상태랑 일정을 같이 맞춰보는 중이야.");
    stopAudio();
    spokenTextRef.current = "";
    const ttsGeneration = ttsGenerationRef.current;
    let streamedText = "";
    let queuedSentence = false;
    const sentenceSplitter = createSentenceSplitter((sentence) => {
      queuedSentence = true;
      enqueueTTS(sentence, ttsGeneration);
    }, { eagerFirstChunk: true });

    const scenario = activeDemo;

    try {
      const apiResult = await askPiLLM(
        trimmed,
        buildScenarioContext(scenario),
        {
        onTextDelta(delta, fullText) {
          streamedText = fullText;
          sentenceSplitter.push(delta);
        },
        }
      );
      sentenceSplitter.flush();
      const result = normalizeLLMResult(apiResult, scenario.assistant);
      setEmotion(result.emotion);
      setAction(result.action);
      if (!queuedSentence) {
        enqueueTTS(result.text, ttsGeneration);
      }
    } catch (error) {
      sentenceSplitter.flush();
      console.info("LLM API unavailable. Falling back to demo scenario.", error);
      setErrorText(`LLM API fallback: ${error.message}`);
      if (!streamedText) {
        speak(scenario.assistant);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    runPrompt(userText);
  }

  // 말이 끝나면(일정 시간 침묵) 자동으로 녹음을 멈춰 버튼 재클릭 없이 바로 전사로 넘긴다.
  function startSilenceDetection(stream) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    audioContextRef.current = ctx;
    ctx.resume?.().catch(() => {});
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);

    const SPEAK_RMS = 0.015; // 이 이상이면 발화로 간주
    const SILENCE_MS = 1200; // 발화 후 이만큼 조용하면 종료
    const MAX_MS = 15000; // 안전 상한
    const startedAt = Date.now();
    let speechStarted = false;
    let lastLoudAt = Date.now();

    silenceTimerRef.current = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = Date.now();
      if (rms > SPEAK_RMS) {
        speechStarted = true;
        lastLoudAt = now;
      }
      const silentLongEnough = speechStarted && now - lastLoudAt > SILENCE_MS;
      if (silentLongEnough || now - startedAt > MAX_MS) {
        stopRecording();
      }
    }, 100);
  }

  function stopSilenceDetection() {
    if (silenceTimerRef.current) {
      window.clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }

  async function startRecording() {
    if (loading || warming || resetting || transcribing) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorText("마이크는 localhost 또는 HTTPS에서만 켜집니다. (현재 주소가 http LAN IP면 막힙니다)");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        stopSilenceDetection();
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        if (blob.size === 0) return;

        setTranscribing(true);
        try {
          const text = await transcribeAudio(blob);
          if (text) {
            setUserText(text);
            runPrompt(text);
          }
        } catch (error) {
          console.info("STT unavailable.", error);
          setErrorText(`STT 실패: ${error.message}`);
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      startSilenceDetection(stream);
      setRecording(true);
    } catch (error) {
      console.info("Microphone unavailable.", error);
      setErrorText(`마이크 사용 불가: ${error.message}`);
    }
  }

  function stopRecording() {
    stopSilenceDetection();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  function toggleRecording() {
    if (recording) stopRecording();
    else startRecording();
  }

  async function handleResetSession() {
    if (loading || resetting) return;
    setResetting(true);
    stopAudio();
    setLlmState("warming");
    try {
      await resetLLMSession(buildScenarioContext(activeDemo));
      setErrorText("");
      setLlmState("ready");
    } finally {
      setResetting(false);
    }
  }

  function applyDemo(demo) {
    setActiveDemo(demo);
    pushUserTurn(demo.userText);
    setAvatarText("");
    setUserText(demo.userText);
    speak(demo.assistant);
  }

  const selectedAvatar = avatarModels.find((model) => model.id === selectedAvatarId) || avatarModels[0];
  const displayTime = parseTimeParts(clock);
  const usedDataCount = activeDemo.data.filter((item) => item.used).length;

  return (
    <div className={panelOpen ? "app-shell" : "app-shell panel-collapsed"}>
      <button
        className="panel-toggle"
        type="button"
        onClick={() => setPanelOpen((open) => !open)}
        aria-expanded={panelOpen}
        aria-label="정보 패널 열기/닫기"
      >
        {panelOpen ? "✕" : "☰"}
      </button>

      <section className={panelOpen ? "demo-panel" : "demo-panel is-hidden"} aria-label="사용 데이터와 스케줄러">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Boss Home Command</p>
            <h1>{activeDemo.sceneTitle}</h1>
            <p className="panel-subtitle">찐보스의 마음과 데이터를 읽는 홈솔루션</p>
          </div>
          <AnalogClock time={displayTime} />
        </div>

        <div className="mode-tabs" role="tablist" aria-label="대화 모드">
          {demoEvents.map((demo) => (
            <button
              className={demo.id === activeDemo.id ? "mode-tab is-active" : "mode-tab"}
              key={demo.id}
              onClick={() => applyDemo(demo)}
              role="tab"
              aria-selected={demo.id === activeDemo.id}
            >
              {demo.label}
            </button>
          ))}
        </div>

        <div className="decision-strip">
          <div>
            <span className="decision-pulse" />
            <strong>보스의 상황 판단 완료</strong>
          </div>
          <span>{usedDataCount}개 단서 · 0.8초</span>
        </div>

        <div className="section-block">
          <div className="section-title">음성 설정{ttsBackend ? ` · ${ttsBackend}` : ""}</div>
          <div className="tts-settings">
            <label className="tts-row">
              <span>음성</span>
              <select value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)}>
                <option value="">기본</option>
                {ttsVoices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.lang ? `${voice.name} (${voice.lang})` : voice.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="tts-row">
              <span>속도 {ttsRate.toFixed(2)}</span>
              <input
                type="range"
                min="0.5"
                max="1.8"
                step="0.05"
                value={ttsRate}
                onChange={(e) => setTtsRate(parseFloat(e.target.value))}
              />
            </label>
            {ttsBackend === "melo" && (
              <>
                <label className="tts-row">
                  <span>억양 sdp {ttsSdp.toFixed(2)}</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={ttsSdp}
                    onChange={(e) => setTtsSdp(parseFloat(e.target.value))}
                  />
                </label>
                <label className="tts-row">
                  <span>리듬 noise_w {ttsNoise.toFixed(2)}</span>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={ttsNoise}
                    onChange={(e) => setTtsNoise(parseFloat(e.target.value))}
                  />
                </label>
              </>
            )}
          </div>
        </div>

        <div className="timeline-section" aria-label="캘린더 타임라인">
          <div className="timeline-heading">
            <span>보스가 읽은 오늘의 흐름</span>
            <strong>{activeDemo.now}</strong>
          </div>
          <div className="timeline-track">
            {activeDemo.timeline.map((event) => (
              <div className={event.current ? "timeline-event is-current" : "timeline-event"} key={`${event.time}-${event.title}`}>
                <span className="timeline-dot" />
                <strong>{event.time}</strong>
                <span>{event.title}</span>
                <small>{event.meta}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="section-block data-section">
          <div className="section-heading">
            <div>
              <div className="section-title">보스가 파악한 단서</div>
              <p>찐보스를 이해하는 데 쓰인 정보만 켜집니다.</p>
            </div>
            <span className="usage-count">
              {usedDataCount}/{activeDemo.data.length} 포착
            </span>
          </div>
          <div className="data-grid">
            {activeDemo.data.map((item) => (
              <div className={item.used ? "data-tile is-used" : "data-tile"} key={item.id}>
                <div className="data-tile-label">
                  <span className="data-status-dot" />
                  <span>{item.label}</span>
                </div>
                <strong>{item.used ? item.value : "이번 판단에는 미사용"}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="section-block solution-section">
          <div className="solution-header">
            <div className="solution-check" aria-hidden="true">✓</div>
            <div>
              <span className="section-kicker">가전 작전 배치 · 실행 결과</span>
              <div className="section-title">{activeDemo.solutionTitle}</div>
              <p>{activeDemo.solutionSummary}</p>
            </div>
          </div>
          <div className="solution-grid">
            {activeDemo.devices.map((device) => (
              <div className={`solution-item is-${device.status}`} key={device.name}>
                <div>
                  <span>{device.name}</span>
                  <strong>{device.state}</strong>
                </div>
                <span className="solution-status">
                  {device.status === "active" ? "실행" : device.status === "ready" ? "준비" : "대기"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="avatar-stage" aria-label="3D 홈솔루션비서">
        <div className="command-backdrop" aria-hidden="true">
          <span className="command-ring ring-one" />
          <span className="command-ring ring-two" />
          <span className="command-core" />
        </div>

        <AvatarScene
          emotion={emotion}
          action={action}
          speaking={speaking}
          modelPath={selectedAvatar.modelPath}
          verticalOffset={selectedAvatar.verticalOffset || 0}
          sunglasses={selectedAvatar.id === "human" && bossBabySunglasses}
        />

        <div className="device-network" aria-label="보스의 가전 명령 상태">
          {activeDemo.devices.slice(0, 4).map((device, index) => (
            <div className={`device-signal signal-${index} is-${device.status}`} key={device.name}>
              <span className="device-signal-index">0{index + 1}</span>
              <div>
                <strong>{device.name}</strong>
                <span>{getDeviceSignalLabel(device.status)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="avatar-toolbar">
          {avatarModels.map((model) => (
            <button
              className={model.id === selectedAvatar.id ? "chip is-active" : "chip"}
              key={model.id}
              onClick={() => setSelectedAvatarId(model.id)}
            >
              {model.label}
            </button>
          ))}
          {selectedAvatar.id === "human" && (
            <button
              className={bossBabySunglasses ? "icon-option is-active" : "icon-option"}
              onClick={() => setBossBabySunglasses((enabled) => !enabled)}
              aria-pressed={bossBabySunglasses}
              title="선글라스"
            >
              <span aria-hidden="true">⌐■-■</span>
              선글라스
            </button>
          )}
        </div>

        <div className="assistant-label">
          <span>홈 커맨더</span>
          <strong>{selectedAvatar.name}</strong>
          <small>{activeDemo.devices.length}개 가전 지휘 중</small>
        </div>

        <ChatWindow messages={messages} liveAvatarText={avatarText} />

        <div className="avatar-dock">
          <form className="prompt-row" onSubmit={handleSubmit}>
            <input
              className="input-box"
              value={userText}
              onChange={(e) => setUserText(e.target.value)}
              placeholder="예: 나 집에 왔어"
            />
            <button
              className={recording ? "mic-button is-recording" : "mic-button"}
              type="button"
              onClick={toggleRecording}
              disabled={loading || warming || resetting || transcribing}
              aria-pressed={recording}
              title="음성으로 말하기"
            >
              {transcribing ? "인식 중" : recording ? "■ 정지" : "🎤 말하기"}
            </button>
            <button className="primary-button" type="submit" disabled={loading || warming || resetting}>
              {warming ? "준비 중" : loading ? "분석 중" : "실행"}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={handleResetSession}
              disabled={loading || warming || resetting}
            >
              {resetting ? "초기화 중" : "세션 초기화"}
            </button>
          </form>
        </div>
      </section>

      {errorText && <div className="error-box">{errorText}</div>}
    </div>
  );
}
