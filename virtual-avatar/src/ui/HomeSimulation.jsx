import React, { useEffect, useState } from "react";
import { demoEvents } from "../mock/demoEvents.js";
import { HOME_SYNC_KEY, readSyncedDemoId, writeSyncedDemoId } from "../state/homeSync.js";
import IsometricHomeScene from "./IsometricHomeScene.jsx";

function getInitialDemoId() {
  const defaultDemoId = "workout";
  if (typeof window === "undefined") return defaultDemoId;
  const params = new URLSearchParams(window.location.search);
  const storedDemoId = readSyncedDemoId(defaultDemoId);
  return params.get("mode") || (storedDemoId === "daily-chat" ? defaultDemoId : storedDemoId);
}

export default function HomeSimulation() {
  const [activeDemoId, setActiveDemoId] = useState(getInitialDemoId);
  const activeDemo = demoEvents.find((demo) => demo.id === activeDemoId) || demoEvents[0];

  const usedDataCount = activeDemo.data.filter((item) => item.used).length;
  const activeDeviceCount = activeDemo.devices.filter((device) => device.status === "active").length;

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === HOME_SYNC_KEY && event.newValue) {
        setActiveDemoId(event.newValue);
      }
    };
    const handleLocalChange = (event) => {
      if (event.detail) setActiveDemoId(event.detail);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("boss-home-demo-change", handleLocalChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("boss-home-demo-change", handleLocalChange);
    };
  }, []);

  function selectDemo(demoId) {
    setActiveDemoId(demoId);
    writeSyncedDemoId(demoId);
  }

  return (
    <main className="simulation-shell">
      <header className="simulation-topbar">
        <div>
          <p className="simulation-eyebrow">Boss Home Simulation</p>
          <h1>{activeDemo.solutionTitle}</h1>
          <p>{activeDemo.solutionSummary}</p>
        </div>
        <div className="simulation-stats" aria-label="홈솔루션 실행 요약">
          <div>
            <span>단서</span>
            <strong>{usedDataCount}/{activeDemo.data.length}</strong>
          </div>
          <div>
            <span>실행</span>
            <strong>{activeDeviceCount}</strong>
          </div>
          <div>
            <span>현재</span>
            <strong>{activeDemo.now}</strong>
          </div>
        </div>
      </header>

      <section className="simulation-tabs" aria-label="시뮬레이션 시나리오">
        {demoEvents.map((demo) => (
          <button
            className={demo.id === activeDemo.id ? "simulation-tab is-active" : "simulation-tab"}
            type="button"
            key={demo.id}
            onClick={() => selectDemo(demo.id)}
          >
            {demo.label}
          </button>
        ))}
      </section>

      <section className="simulation-stage" aria-label="집 가상 시뮬레이션">
        <div className="simulation-scene-wrap">
          <IsometricHomeScene scenario={activeDemo} />
          <div className="simulation-scene-overlay">
            <div>
              <span className="home-core-dot" />
              <strong>HOME AI</strong>
            </div>
            <p>{activeDemo.devices.length}개 가전 지휘 중</p>
          </div>
          <div className="simulation-device-strip">
            {activeDemo.devices.map((device) => (
              <div className={`simulation-device-pill is-${device.status}`} key={device.name}>
                <span />
                <div>
                  <strong>{device.name}</strong>
                  <small>{device.state}</small>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="simulation-side">
          <div className="simulation-card">
            <span className="section-kicker">상황 판단</span>
            <h2>{activeDemo.sceneTitle}</h2>
            <div className="sim-timeline">
              {activeDemo.timeline.map((event) => (
                <div className={event.current ? "sim-timeline-item is-current" : "sim-timeline-item"} key={`${event.time}-${event.title}`}>
                  <span />
                  <div>
                    <strong>{event.time} · {event.title}</strong>
                    <small>{event.meta}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="simulation-card">
            <span className="section-kicker">사용된 데이터</span>
            <div className="sim-data-list">
              {activeDemo.data.map((item) => (
                <div className={item.used ? "sim-data-item is-used" : "sim-data-item"} key={item.id}>
                  <span className="sim-data-dot" />
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.used ? item.value : "미사용"}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
