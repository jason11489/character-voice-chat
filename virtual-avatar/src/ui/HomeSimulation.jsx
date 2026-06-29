import React, { useEffect, useState } from "react";
import { demoEvents } from "../mock/demoEvents.js";
import { HOME_SYNC_KEY, HOME_SYNC_SCENARIO_KEY, readSyncedDemoId, readSyncedScenario, writeSyncedDemoId } from "../state/homeSync.js";
import IsometricHomeScene from "./IsometricHomeScene.jsx";

function getInitialScenario() {
  const defaultDemoId = "workout";
  if (typeof window === "undefined") return demoEvents.find((demo) => demo.id === defaultDemoId) || demoEvents[0];
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  if (mode) return demoEvents.find((demo) => demo.id === mode) || demoEvents[0];
  const customScenario = readSyncedScenario();
  if (customScenario?.custom) return customScenario;
  const storedDemoId = readSyncedDemoId(defaultDemoId);
  const demoId = storedDemoId === "daily-chat" ? defaultDemoId : storedDemoId;
  return demoEvents.find((demo) => demo.id === demoId) || demoEvents[0];
}

function getDeviceStatusLabel(status) {
  if (status === "active") return "실행";
  if (status === "ready") return "준비";
  return "대기";
}

export default function HomeSimulation() {
  const [activeDemo, setActiveDemo] = useState(getInitialScenario);

  const usedDataCount = activeDemo.data.filter((item) => item.used).length;
  const controlledDeviceCount = activeDemo.devices.filter((device) => device.status !== "idle").length;

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === HOME_SYNC_SCENARIO_KEY && event.newValue) {
        const scenario = readSyncedScenario();
        if (scenario?.custom) setActiveDemo(scenario);
        return;
      }
      if (event.key === HOME_SYNC_KEY && event.newValue) {
        const scenario = readSyncedScenario();
        if (scenario?.custom && scenario.id === event.newValue) setActiveDemo(scenario);
        else setActiveDemo(demoEvents.find((demo) => demo.id === event.newValue) || demoEvents[0]);
      }
    };
    const handleLocalChange = (event) => {
      if (event.detail?.scenario) {
        setActiveDemo(event.detail.scenario);
        return;
      }
      if (event.detail) setActiveDemo(demoEvents.find((demo) => demo.id === event.detail) || demoEvents[0]);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("boss-home-demo-change", handleLocalChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("boss-home-demo-change", handleLocalChange);
    };
  }, []);

  function selectDemo(demoId) {
    setActiveDemo(demoEvents.find((demo) => demo.id === demoId) || demoEvents[0]);
    writeSyncedDemoId(demoId);
  }

  return (
    <main className="simulation-shell">
      <section className="simulation-tabs" aria-label="시뮬레이션 시나리오">
        {activeDemo.custom && (
          <button className="simulation-tab is-active" type="button">
            요청 기반
          </button>
        )}
        {demoEvents.map((demo) => (
          <button
            className={!activeDemo.custom && demo.id === activeDemo.id ? "simulation-tab is-active" : "simulation-tab"}
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
        </div>

        <div className="simulation-solution-panel" aria-label="홈솔루션 결과">
          <div className="simulation-solution-copy">
            <span className="section-kicker">가전 작전 배치 · 실행 결과</span>
            <strong>{activeDemo.solutionTitle}</strong>
            <p>{activeDemo.solutionSummary}</p>
          </div>
          <div className="simulation-device-strip">
            {activeDemo.devices.map((device) => (
              <div className={`simulation-device-pill is-${device.status}`} key={device.name}>
                <span />
                <div>
                  <strong>{device.name}</strong>
                  <small>{device.state}</small>
                </div>
                <em>{getDeviceStatusLabel(device.status)}</em>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
