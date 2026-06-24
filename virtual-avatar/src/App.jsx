import React, { useEffect, useRef, useState } from "react";
import AvatarScene from "./avatar/AvatarScene.jsx";
import { askPiLLM, getApiBase } from "./api/llmApi.js";
import { getTTSHealth, prefetchSpeech, synthesizeSpeech } from "./api/ttsApi.js";
import SpeechBubble from "./ui/SpeechBubble.jsx";
import { demoEvents } from "./mock/demoEvents.js";

const avatarPresets = [
  {
    label: "먼저 말걸기",
    emotion: "happy",
    action: "wave",
    text: "왔어? 오늘 데이터 보니까 바로 쉬고 싶을 것 같아서 집을 먼저 맞춰두고 있었어.",
  },
  {
    label: "설명",
    emotion: "thinking",
    action: "explain",
    text: "캘린더, 위치, 날씨, 결제 내역을 같이 보고 지금 필요한 홈솔루션을 고르는 중이야.",
  },
  {
    label: "밤 모드",
    emotion: "sleepy",
    action: "idle",
    text: "밤이 늦었으니까 말은 짧게 하고, 소리 나는 기기는 조용하게 낮춰둘게.",
  },
];

const avatarModels = [
  {
    id: "round",
    label: "동글이 캐릭터",
    name: "홈솔루션비서",
    modelPath: "/models/untitled-colored.glb",
  },
  {
    id: "human",
    label: "사람 캐릭터",
    name: "휴먼비서",
    modelPath: "/models/human-cute.glb",
  },
];

function estimateSpeechMs(text) {
  return Math.max(2600, text.length * 88);
}

function getInitialAvatarId() {
  if (typeof window === "undefined") return "round";
  return new URLSearchParams(window.location.search).get("avatar") === "human" ? "human" : "round";
}

function pickScenario(prompt) {
  const text = prompt.replace(/\s/g, "");

  if (text.includes("운동") || text.includes("헬스") || text.includes("샤워")) {
    return demoEvents.find((demo) => demo.id === "workout");
  }

  if (text.includes("조용") || text.includes("발표") || text.includes("회의")) {
    return demoEvents.find((demo) => demo.id === "quiet-mode");
  }

  return demoEvents.find((demo) => demo.id === "company-dinner");
}

function buildScenarioContext(scenario) {
  return {
    scene: scenario.sceneTitle,
    now: scenario.now,
    calendar: scenario.calendar,
    data: scenario.data,
    devices: scenario.devices,
    flow: scenario.flow,
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
  const [selectedAvatarId, setSelectedAvatarId] = useState(getInitialAvatarId);
  const [activeDemo, setActiveDemo] = useState(demoEvents[0]);
  const [userText, setUserText] = useState(demoEvents[0].userText);
  const [avatarText, setAvatarText] = useState(demoEvents[0].assistant.text);
  const [emotion, setEmotion] = useState(demoEvents[0].assistant.emotion);
  const [action, setAction] = useState("idle");
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [llmState, setLlmState] = useState("ready");
  const [ttsState, setTtsState] = useState("idle");
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
    const fixedTexts = [
      demoEvents[0].assistant.text,
      avatarPresets[0].text,
      ...demoEvents.slice(1).map((demo) => demo.assistant.text),
      ...avatarPresets.slice(1).map((preset) => preset.text),
    ];

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
        setTtsState("streaming");
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
        setTtsState("done");
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
        } else {
          setTtsState("fallback");
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
    setTtsState("synthesizing");
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
      setTtsState("fallback");
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
      setTtsState(koreanVoice ? "browser-ko" : "browser-ko-requested");
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
      setTtsState("done");
      setSpeaking(false);
      setAction("idle");
      utteranceRef.current = null;
    };

    utterance.onerror = () => {
      setTtsState("fallback");
      utteranceRef.current = null;
      stopSpeakingAfter(fallbackMs);
    };

    window.speechSynthesis.speak(utterance);
  }

  async function playTTS(text, fallbackMs) {
    stopAudio();
    setTtsState("loading");

    try {
      await getTTSHealth();

      const blob = await synthesizeSpeech(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audioUrlRef.current = url;

      audio.onplay = () => {
        setTtsState("playing");
        setSpeaking(true);
        if (speakingTimerRef.current) {
          window.clearTimeout(speakingTimerRef.current);
          speakingTimerRef.current = null;
        }
      };

      audio.onended = () => {
        setTtsState("done");
        setSpeaking(false);
        setAction("idle");
        audioRef.current = null;
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = "";
        }
      };

      audio.onerror = () => {
        setTtsState("error");
        stopSpeakingAfter(fallbackMs);
      };

      await audio.play();
    } catch (error) {
      console.info("TTS unavailable. Falling back to browser/timer lip sync.", error);
      setTtsState("fallback");
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
    setLlmState("calling");
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

    const scenario = pickScenario(trimmed);
    setActiveDemo(scenario);

    try {
      const apiResult = await askPiLLM(trimmed, buildScenarioContext(scenario), {
        onTextDelta(delta, fullText) {
          streamedText = fullText;
          setAvatarText(fullText);
          sentenceSplitter.push(delta);
        },
      });
      sentenceSplitter.flush();
      setLlmState("api");
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
      setLlmState("mock-fallback");
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

  function previewAvatar(preset) {
    speak(preset);
  }

  const selectedAvatar = avatarModels.find((model) => model.id === selectedAvatarId) || avatarModels[0];

  return (
    <div className="app-shell">
      <section className="demo-panel" aria-label="사용 데이터와 스케줄러">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Home Solution Assistant</p>
            <h1>{activeDemo.sceneTitle}</h1>
          </div>
          <div className="time-badge">{activeDemo.now}</div>
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

        <div className="quick-actions">
          {demoEvents.map((demo) => (
            <button
              className={demo.id === activeDemo.id ? "chip is-active" : "chip"}
              key={demo.id}
              onClick={() => applyDemo(demo)}
            >
              {demo.label}
            </button>
          ))}
        </div>

        <div className="section-block">
          <div className="section-title">캘린더 · 스케줄러</div>
          <div className="calendar-list">
            {activeDemo.calendar.map((event) => (
              <div className="calendar-item" key={`${event.time}-${event.title}`}>
                <div className="calendar-time">{event.time}</div>
                <div>
                  <div className="calendar-title">{event.title}</div>
                  <div className="calendar-meta">{event.meta}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="section-block">
          <div className="section-title">사용되는 데이터</div>
          <div className="data-grid">
            {activeDemo.data.map((item) => (
              <div className="data-tile" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="section-block">
          <div className="section-title">홈솔루션 실행</div>
          <div className="device-list">
            {activeDemo.devices.map((device) => (
              <div className="device-row" key={device.name}>
                <span>{device.name}</span>
                <strong>{device.state}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="flow-row">
          {activeDemo.flow.map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
      </section>

      <section className="avatar-stage" aria-label="3D 홈솔루션비서">
        <AvatarScene emotion={emotion} action={action} speaking={speaking} modelPath={selectedAvatar.modelPath} />

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
          {avatarPresets.map((preset) => (
            <button className="chip accent-chip" key={preset.label} onClick={() => previewAvatar(preset)}>
              {preset.label}
            </button>
          ))}
        </div>

        <div className="assistant-label">
          <span>3D 캐릭터</span>
          <strong>{selectedAvatar.name}</strong>
        </div>
      </section>

      <SpeechBubble text={avatarText} />

      <div className="status-pill">
        LLM: {llmState} · API: {getApiBase()} · TTS: {ttsState} · emotion: {emotion} · action: {action} · speaking: {String(speaking)}
      </div>

      {errorText && <div className="error-box">{errorText}</div>}
    </div>
  );
}
