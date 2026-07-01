# distributed-llama Freeze 진단 정리 — TCP Incast

> 작성 2026-07-01. 대상: Qwen3 30B-A3B q40 (MoE) · dllama-api root + 3 Pi worker.

## TL;DR

- **증상**: 토큰이 잘 나오다가 랜덤하게 수초~수분 멈췄다가(freeze) 저절로 풀림.
- **근본 원인 (소거법으로 확정)**: **스위치에서의 TCP incast**. worker→root 방향 동기 버스트가 값싼 비관리형 스위치 버퍼를 넘겨 **패킷 손실** → 송신 워커 TCP가 **지수 백오프**로 재전송을 반복하는 동안 파이프라인 전체 정지.
- **왜 저절로 풀리나**: 재전송본 하나가 마침내 스위치를 통과 → root의 blocking `recv()`가 리턴 → 재개.
- **완화 적용됨**: 4노드 `rto_min 20ms`(재부팅 영속화 포함) → freeze당 대가 ~8배 단축. 손실 자체는 못 없앰.
- **근본 해결**: **스위치 교체**(deep-buffer/managed). Pi NIC은 flow control 미지원이라 소프트로 손실 제거 불가.
- **확신도**: 높음(직접 캡처 + 전방위 소거). 단 스위치가 비관리형이라 드롭 카운터 직접 관측은 불가 → 결정적 확인은 스위치 교체 후 재현 테스트.

---

## 1. 증상

- 단일 요청은 대체로 매끄럽게 ~10 tok/s.
- **연속 부하(back-to-back 생성)** 에서 랜덤하게 freeze 발생.
- freeze 길이 랜덤: 수초 ~ 수분. 항상 **스스로 회복**.
- 특정 노드에 고정되지 않고 **떠돌아다님**.

## 2. 환경 / 토폴로지

- root(dllama-api, `10.0.0.1`) + worker `10.0.0.2/3/4`, 전부 Raspberry Pi 5 8GB.
- 격리된 GbE 스위치: **TP-Link LS1008G** (8포트 비관리형 "green", 버퍼 ~1Mbit).
- NIC 드라이버 `macb`(BCM2712), 링크 1000Mb/s full duplex.
- 통신 구조: 레이어마다 노드 간 **all-to-all 동기화**(각 노드가 서로 연결된 mesh). root가 코디네이터.

## 3. 근본 원인: 스위치에서의 TCP Incast

**Incast** = 여러 송신자가 **동시에** 한 수신자로 몰아서, 그 수신 포트의 스위치 egress 버퍼가 순간적으로 넘쳐 패킷이 드롭되는 현상.

여기선 매 레이어마다 **worker 3대가 동시에 root로** 결과를 보냄 → root를 향한 스위치 포트에 동기 버스트가 겹침 → 값싼 스위치의 얕은 버퍼 초과 → **worker→root 패킷 손실**.

## 4. Freeze가 걸리고 풀리는 메커니즘

1. worker가 레이어 결과를 계산해 TCP 송신 큐(Send-Q)에 넣음.
2. 그 세그먼트가 **스위치에서 드롭** → root의 ACK 안 옴.
3. root는 **타임아웃 없는 blocking `recv()`** 에서 그 데이터를 기다림
   (`src/nn/nn-network.cpp` 의 `recv(socket, data, s, 0)`, `NnNetworkNodeSynchronizer::sync`) → 리턴 못 하고 정지.
4. root가 멈추니 **다른 worker도 전부** root 신호를 기다리며 `recv()`에서 정지 → **파이프라인 전체 freeze**.
5. 송신 worker의 TCP가 **RTO 만료 → 재전송**. 또 드롭되면 **RTO를 2배씩 증가**(지수 백오프): `RTO = base × 2^backoff`.
6. 재전송본 하나가 스위치를 통과 → root `recv()` 리턴 → **재개 (self-resolves)**.

> 대기 시간이 랜덤인 이유 = 몇 번째 백오프 단계에서 재전송이 성공하느냐에 달림.

## 5. 증거 (라이브 캡처)

- **스모킹건** — freeze 중 node4 소켓 `10.0.0.4:9999→10.0.0.1`:
  `Send-Q=2168  rto:104448  backoff:9  cwnd:1  unacked:2  retrans:0/10417  bytes_retrans:13.8MB`
  → 계산 결과를 큐에 넣었으나 송신 못 함. RTO가 **104초**까지 부풀음(9회 백오프).
  검증: `base 204ms × 2^9 = 104,448ms` 정확히 일치.
- **손실의 방향성**: worker→root **0.5~0.9%**, worker→worker 0.01%, root→worker 0.003%.
  → 손실은 **root를 향하는 방향**에 집중.
- **드롭 위치 = 스위치**: root NIC RX 링을 512→8192로 키우고 backlog/버퍼 늘려도
  freeze 발생 + root NIC RX drop 카운터 = **0**. → 패킷은 root NIC **도달 전**(=스위치)에서 소멸.
- **떠돌이 범인**: 재현 3회에서 범인이 node4 → node2 → node3 로 매번 바뀜.
  node4에 새 케이블+새 포트 줬는데도 다시 스파이럴 → 특정 노드/케이블 문제 아님 = **시스템적(incast)**.
- **Pi는 flow control 불가**: `ethtool -a eth0` = "Operation not supported"(macb 미구현).
  → PAUSE 프레임으로 incast 억제 불가.
- **EEE(802.3az)도 원인 아님**: 모든 링크를 저율 트래픽으로 강제로 깨워둔(LPI 차단) 상태에서
  genloop 돌려도 stall 지속 → EEE/저전력 유휴는 원인 아님.

## 6. 배제된 가설 (전부 반증됨)

| 가설 | 반증 근거 |
|---|---|
| SD/MoE cold-expert paging | weight를 로드 시 mlock RAM으로 memcpy(`nn-cpu.cpp:224/:28`), mmap은 로드 후 닫힘(`llm.cpp:620`). 생성 중 major fault 0. |
| 2048 토큰 한계 도달 | ~871 누적 토큰에서 freeze 발생. |
| worker 연산 hang | worker 전부 state S, `recv()`에서 대기(연산 아님). swap 0, majflt ~0, 46–55°C, throttled 0x0. |
| CPU/열/스왑 | 여유 RAM 2.5GB, 스로틀 없음. |
| node4 케이블/포트 | 교체 후에도 freeze가 다른 노드로 이동. |
| root RX 링 / 커널 버퍼 | 키워도 freeze 지속, NIC drop 0. |
| rto_min | freeze 원인 아님(완화책일 뿐). |
| EEE(802.3az) | 링크 깨워둬도 stall 지속. |

## 7. 스위치가 원인이라고 확신하는 근거 (범인 좁히기)

손실 지점을 **송신 노드도, 수신 노드도, 케이블도 아닌 스위치**로 좁힌 논리. 각 근거는 특정 후보를 배제함.

**7.1 드롭은 root NIC "도착 전"에 발생 → 상류(스위치)에서 소멸**
- freeze 중에도 root NIC의 RX 드롭 카운터(`rx_overruns` / `rx_resource_errors` / `q0_rx_dropped`) = **0**.
- RX 링을 512→8192로 키워도 동일하게 freeze + drop 0.
- 즉 root NIC 큐가 넘쳐서 버리는 게 **아님** → 패킷은 root NIC에 **닿기 전**에 사라짐. (배제: root 수신 NIC)

**7.2 손실이 "방향성"을 가짐 = incast의 지문**
- worker→root **0.5~0.9%** vs worker→worker 0.01% vs root→worker 0.003%.
- 케이블/NIC 고장이면 그 링크가 **양방향 대칭**으로 나빠야 함. 그런데 손실은 **root로 수렴하는 방향에만** 집중.
- → root행 egress 포트에서 동기 버스트를 못 버티는 전형적 incast 패턴. (배제: 대칭적 링크 고장)

**7.3 엔드포인트(NIC/링크)는 건강**
- 전 노드 링크 1000Mb/s full duplex, NIC error/dropped = 0. (배제: NIC 하드웨어)

**7.4 범인이 노드를 옮겨다님**
- 재현 3회에서 범인 = node4 → node2 → node3 로 **매번 바뀜**.
- 특정 노드/케이블/포트 문제라면 **같은 노드에서 반복**돼야 함.
- 모든 worker→root 경로가 공유하는 **유일한 요소 = 스위치**. (배제: 단일 불량 노드)

**7.5 케이블·포트 교체로 안 고쳐짐**
- node4에 **새 케이블 + 다른 포트**를 줘도 다시 스파이럴(freeze가 다른 노드로 이동).
- → 물리 케이블/특정 포트 아님. (배제: 케이블/포트)

**7.6 Pi 쪽 소프트 요인 전부 배제**
- paging, 커널버퍼, RX ring, rto_min, EEE, worker hang, thermal (6절 표) — 전부 반증. (배제: 엔드포인트 SW)

**7.7 외부 corroboration (동일 모델 사례)**
- 독립 사용자들이 **같은 LS1008G에서 "0.7% packet loss" + 지연/지터**를 보고 → 우리 측정값(0.5~0.9%)과 거의 일치.
- 공통 결론: 비관리형이라 못 고치고 **"스위치 교체/우회"가 유일 해법**. (부록 C 참고)

**결론 (소거법):**
```
송신 노드 ✗   수신 노드 ✗   NIC ✗   케이블 ✗   포트 ✗   Pi 소프트 ✗
  → 모든 실패 경로에 남는 유일한 공통 요소 = 스위치
```

**확신도와 한계 (정직하게):**
- **확신도 = 높음**: 방향성 손실 + root NIC 도착 전 소멸 + 떠돌이 범인 + 케이블/포트 교체 무효 + 외부 동일 사례.
- **한계**: 스위치가 **비관리형**이라 스위치 **내부 드롭 카운터를 직접 못 봄** → 100% 직접 관측이 아니라 소거법 기반.
- **결정적 확인(미실행)**: 관리형 스위치로 교체 → **root행 포트의 TX-discard/drop 카운터**가 버스트 때 증가하는지 관측 = 유일하게 남은 직접 증거. (이것이 관리형 스위치를 사야 하는 또 다른 이유)

## 8. 적용된 완화책

- **`rto_min 20ms`** — 4노드 전부. 지수 백오프의 밑을 204ms→~24ms로 낮춰 freeze당 대가 **~8배 단축**
  (`204ms×2^9=104s` → `20ms×2^9≈12s`). 살아있는 연결에 재시작 없이 적용됨(측정: `rto:24ms`).
  - **재부팅 영속화**: NM dispatcher `/etc/NetworkManager/dispatcher.d/90-rto-min` (live route 읽어 재적용, 4노드 검증 완료).
- 정적 IP 영속화(NetworkManager).
- (참고) 커널 버퍼 증대는 효과 없어(드롭이 스위치라) 영속화 안 함.

**한계**: 위 완화는 손실 **빈도**를 못 줄임. freeze **지속시간**만 줄임.

## 9. 근본 해결 — 스위치 교체

Pi 쪽 레버(rto_min, RX ring, 커널버퍼, EEE)를 전부 소진해도 손실이 남음. 남은 공통 요소 = 스위치.

**고를 때 볼 것 (중요도순)**
1. **패킷 버퍼 메모리** — 현재 ~1Mbit보다 크게(이상적으로 수 MB).
2. **관리형(smart/web managed 이상)** — EEE off, 포트별 **drop/discard 카운터**(범인 검증용), QoS.
3. 비관리형 "green" 저가 8포트 회피.

**후보**
- **최선**: MikroTik **CRS310-8G+2S+IN** (또는 CRS326-24G-2S+) — 버퍼 큼 + 완전 관리형.
- **가성비**: MikroTik **CSS610-8G-2S+IN**.
- **저가 스마트**: NETGEAR GS308E/GS308T, TP-Link TL-SG108E (버퍼는 작아 확실성 낮음).

**결정적 확인 절차**: 스위치 교체 → EEE off → genloop 재현 → 포트별 drop 카운터로 흑백 판정.

## 10. 지금 더 할 수 있는 실험 (소프트웨어)

- **worker 3→2 축소**: 동시 송신자 감소 → incast 완화. 용량 root+2 = 노드당 ~5.7GB(8GB에 들어감).
  병렬성은 줄지만 freeze 감소로 실질 처리량이 오히려 나을 수 있음. (실행 인자 변경 = **재시작 필요**)
- rto_min 10ms로 추가 하향(효과 소소).
- fq pacing / initcwnd 축소 — LAN RTT<1ms + 교차흐름 incast라 기대 낮음.

## 부록 A: 라이브 캡처 사례 — node3, backoff:12, ~98초 스파이럴 (2026-07-01)

rto_min 20ms가 4노드에 적용된 상태에서 실제로 걸린 freeze를 라이브 캡처. **범인 = node3**.

**송신측 node3 → root:46860 (freeze 유발 소켓):**
```
Send-Q 3080   timer:(on, …, 12)   rto:98304   backoff:12
cwnd:1   ssthresh:32   unacked:3   lost:2   sacked:1   retrans:0/11519   bytes_retrans ≈ 16.4MB
```
**재전송 타이머가 살아서 카운트다운하는 것**을 3연속 확인 (= "실제로 재시도 중"의 증거):
```
13:53:43  timer:(on, 10sec,   12)   ← 발사까지 10초
13:53:48  timer:(on, 6.256ms, 12)   ← 발사 직전
13:53:52  timer:(on, 1.632ms, 12)   ← 발사 직전
```

**수신측 root ← node3:**
```
Recv-Q 0            ← 도착해서 쌓인 게 없음 (NIC까지 온 게 없다는 뜻)
bytes_received 875,375,368   ← node3가 보낸 것보다 정확히 3080바이트 뒤짐 (= 저 Send-Q)
lastrcv 199212ms    ← 199초째 node3로부터 수신 0
```
같은 순간 **node2·node4는 정상** (`rto:24`, Send-Q 0) — 특정 링크(node3)만 스파이럴 = 떠돌이 incast.

**"못 보내나 못 받나" 판정:**
- node3는 세그먼트를 **실제로 회선에 재전송함** (timer on, unacked:3, bytes_retrans 16MB) — 보내는 시도는 함.
- 하지만 **스위치에서 드롭**되어 root에 **전달 실패** → ACK 없음 → Send-Q에 3080 잔류.
- root는 **아무것도 못 받음** (Recv-Q 0, bytes_received 정지). root NIC RX drop=0 → 소멸 지점은 스위치.
```
node3 --[재전송 발사]--> [스위치] --X 드롭 X--> root
  ↑                                              │
  └──────── ACK 안 옴 (백오프 반복) ─────────────┘  (recv()에서 대기)
```

**지수 백오프 수치 검증:**
```
rto = base 24ms × 2^12(backoff 12) = 98,304ms ≈ 98초
누적 대기(≈98s) + 현재 창(98s) ≈ 199초  = root lastrcv 199초와 일치
```
→ **핵심 교훈**: rto_min 20ms를 걸어도 **연속 손실이 깊으면(여기선 12연속) 여전히 ~100초 freeze**가 남. 2^12=4096배가 곱해지기 때문. rto_min은 손실 **1건당 대가**만 줄이고 손실 **빈도**는 못 줄임 → 근본 해결(스위치 교체)의 필요성을 라이브로 입증한 사례.

## 부록 B: 참고 코드 위치

- `src/nn/nn-network.cpp` — 타임아웃 없는 blocking `recv(socket, data, s, 0)` (freeze가 걸리는 지점).
- `src/nn/nn-cpu.cpp:224/:28` — weight를 mlock RAM으로 memcpy (paging 아님의 근거).
- `src/llm.cpp:620` — 로드 후 mmap 닫힘.
- `src/dllama-api.cpp:646` — 단일 스레드 서버 루프.

## 부록 C: 동일 스위치(LS1008G) 외부 보고 사례

독립 사용자들이 같은 모델에서 우리와 유사한 증상을 보고 (7.7절 근거). 공식 결함 발표는 아닌 **커뮤니티 일화 보고**지만, 손실 수치가 우리 측정값과 일치하고 "해결책 = 스위치 교체/우회" 패턴이 반복됨.

- **0.7% 패킷 손실 + 지연/지터 상승** (LS1005G/LS1008G): 스위치 연결 시 발생, 제거 시 정상화. → 우리 worker→root 0.5~0.9%와 거의 일치.
  <https://community.tp-link.com/en/smart-home/forum/topic/652314>
- **연결 드롭 "Critical issue"**: 특정 트래픽에서 ~2초 만에 끊김, *"switch block traffic in and out"*, **다른 스위치를 앞에 끼워야** 우회. 비관리형이라 설정 불가.
  <https://community.tp-link.com/en/business/forum/topic/700264>
- **속도 급락 사례** (LS1008G dropping significant speed):
  <https://community.tp-link.com/en/home/forum/topic/582774>
- **Green Ethernet/EEE 의심** (지연 민감 Dante 오디오 드롭아웃) — 참고용. *우리 케이스는 EEE 자체는 keepalive 테스트로 배제됨.*
  <https://community.tp-link.com/en/home/forum/topic/593780>

**요지**: 이 스위치가 가벼운 가정용 트래픽에서도 0.7% 손실을 낸다는 외부 보고가 있으므로, 우리의 all-to-all 동기 버스트(훨씬 가혹)에서는 손실이 확정적으로 발생. TP-Link 대응도 결함 인정 없이 사실상 교체를 유도.