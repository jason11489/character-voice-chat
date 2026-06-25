import React, { useEffect, useRef, useState } from "react";
import AvatarScene from "./avatar/AvatarScene.jsx";
import { askPiLLM } from "./api/llmApi.js";
import { getTTSHealth, prefetchSpeech, synthesizeSpeech } from "./api/ttsApi.js";
import SpeechBubble from "./ui/SpeechBubble.jsx";
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
    modelPath: "/models/human-cute.glb",
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

function getDeviceSignalLabel(status) {
  if (status === "active") return "실행 중";
  if (status === "ready") return "명령 대기";
  return "대기";
}

function estimateSpeechMs(text) {
  return Math.max(2600, text.length * 88);
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
    now: scenario.now,
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

function createSentenceSplitter(onSentence) {
  let buffer = "";
  const boundary = /[.!?。！？\n]/;

  return {
    push(delta) {
      buffer += delta;
      let match;

      while ((match = boundary.exec(buffer))) {
        const sentence = buffer.slice(0, match.index + 1).trim();
        buffer = buffer.slice(match.index + 1);
        if (sentence) onSentence(sentence);
      }
    },
    flush() {
      const tail = buffer.trim();
      buffer = "";
      if (tail) onSentence(tail);
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
  const [activeDemo, setActiveDemo] = useState(initialDemo);
  const [userText, setUserText] = useState(initialDemo.userText);
  const [avatarText, setAvatarText] = useState(initialDemo.assistant.text);
  const [emotion, setEmotion] = useState(initialDemo.assistant.emotion);
  const [action, setAction] = useState("idle");
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const speakingTimerRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef("");
  const audioDoneRef = useRef(null);
  const utteranceRef = useRef(null);
  const ttsQueueRef = useRef([]);
  const ttsPumpRef = useRef(null);
  const ttsGenerationRef = useRef(0);

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

  async function drainTTSQueue(generation) {
    if (ttsPumpRef.current !== null) return;
    ttsPumpRef.current = generation;
    let pendingAudio = null;

    try {
      await getTTSHealth();

      while (
        generation === ttsGenerationRef.current
        && (pendingAudio || ttsQueueRef.current.length > 0)
      ) {
        const blob = pendingAudio
          ? await pendingAudio
          : await synthesizeSpeech(ttsQueueRef.current.shift());
        pendingAudio = null;

        if (generation !== ttsGenerationRef.current) break;
        if (ttsQueueRef.current.length > 0) {
          pendingAudio = synthesizeSpeech(ttsQueueRef.current.shift());
        }

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

      const blob = await synthesizeSpeech(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audioUrlRef.current = url;

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

    setAvatarText(result.text);
    setEmotion(result.emotion);
    setAction(result.action);
    setSpeaking(true);

    const generation = ttsGenerationRef.current;
    const sentences = splitSentences(result.text);
    if (sentences.length === 0) {
      stopSpeakingAfter(estimateSpeechMs(result.text));
      return;
    }
    sentences.forEach((sentence) => enqueueTTS(sentence, generation));
  }

  async function runPrompt(text) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setErrorText("");
    setEmotion("thinking");
    setAction("thinking");
    setSpeaking(false);
    setAvatarText("음... 지금 집 상태랑 일정을 같이 맞춰보는 중이야.");
    stopAudio();
    const ttsGeneration = ttsGenerationRef.current;
    let streamedText = "";
    let queuedSentence = false;
    const sentenceSplitter = createSentenceSplitter((sentence) => {
      queuedSentence = true;
      enqueueTTS(sentence, ttsGeneration);
    });

    const scenario = activeDemo;

    try {
      const apiResult = await askPiLLM(
        trimmed,
        buildScenarioContext({
          ...scenario,
          now: scenario.now,
        }),
        {
        onTextDelta(delta, fullText) {
          streamedText = fullText;
          setAvatarText(fullText);
          sentenceSplitter.push(delta);
        },
        }
      );
      sentenceSplitter.flush();
      const result = normalizeLLMResult(apiResult, scenario.assistant);
      setAvatarText(result.text);
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

  function applyDemo(demo) {
    setActiveDemo(demo);
    setUserText(demo.userText);
    speak(demo.assistant);
  }

  const selectedAvatar = avatarModels.find((model) => model.id === selectedAvatarId) || avatarModels[0];
  const displayTime = parseTimeParts(activeDemo.now);
  const usedDataCount = activeDemo.data.filter((item) => item.used).length;

  return (
    <div className="app-shell">
      <section className="demo-panel" aria-label="사용 데이터와 스케줄러">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Boss Home Command</p>
            <h1>{activeDemo.sceneTitle}</h1>
            <p className="panel-subtitle">찐보스의 마음과 데이터를 읽는 홈솔루션</p>
          </div>
          <AnalogClock time={displayTime} />
        </div>

        <form className="prompt-row" onSubmit={handleSubmit}>
          <input
            className="input-box"
            value={userText}
            onChange={(e) => setUserText(e.target.value)}
            placeholder="예: 나 집에 왔어"
          />
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "분석 중" : "실행"}
          </button>
        </form>

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
      </section>

      <SpeechBubble text={avatarText} />

      {errorText && <div className="error-box">{errorText}</div>}
    </div>
  );
}
