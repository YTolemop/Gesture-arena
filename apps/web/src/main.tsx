import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import { Arena } from "./arena";
import {
  SKILLS,
  BY_ID,
  DEFAULT_LOADOUT,
  Loadout,
} from "../../../packages/game-core/skills.js";
import "./style.css";
import { claimTabSession } from "./tab-session";
import { PvpRoom } from "./pvp";
import { SoloDraft } from "./solo-draft";
import { CameraPanels } from "./camera";
import { usePairCode } from "./pair-code";
const socket = io("/arena", { autoConnect: false });
const keys: Record<string, string> = {
  a: "MOVE_LEFT",
  d: "MOVE_RIGHT",
  w: "JUMP",
  s: "CROUCH",
  " ": "BLOCK",
  j: "NORMAL_ATTACK",
  k: "ATTACK_SKILL",
  l: "DEFENSE_SKILL",
  u: "CONTROL_SKILL",
  i: "ULTIMATE",
};
const phaseNames: Record<string, string> = {
  LOBBY: "等候加入",
  DRAFT: "選技",
  SOLO_DRAFT: "技能選擇",
  READY: "準備完成",
  CONFIG: "單人配置",
  COUNTDOWN: "開場倒數",
  DRAFT_COUNTDOWN: "選技倒數",
  RESUME_COUNTDOWN: "恢復倒數",
  PLAYING: "戰鬥中",
  OVERTIME: "加賽",
  PAUSED: "已暫停",
  RESULT: "結果",
  INTERMISSION: "過關間歇",
};
const slotNames: Record<string, string> = {
  attack: "攻擊",
  defense: "防禦",
  control: "控制",
  ultimate: "大招",
  normal: "普攻",
};
function App() {
  const [tab, setTab] = useState("home"),
    [state, setState] = useState<any>(null),
    [auth, setAuth] = useState<any>(() =>
      JSON.parse(sessionStorage.getItem("arena-auth") ?? "null"),
    ),
    [nickname, setNickname] = useState("玩家"),
    [roomCode, setRoomCode] = useState(""),
    [error, setError] = useState(""),
    [label, setLabel] = useState("NONE"),
    [loadout, setLoadout] = useState<Loadout>({ ...DEFAULT_LOADOUT }),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [board, setBoard] = useState<any[]>([]),
    [formal, setFormal] = useState(true),
    [boxes, setBoxes] = useState(false),
    [dummy, setDummy] = useState("stand"),
    [dummyX, setDummyX] = useState(1440),
    [aids, setAids] = useState<any>({}),
    [health, setHealth] = useState<any>(null);
  const authRef = useRef(auth),
    stateRef = useRef(state),
    seq = useRef(0);
  authRef.current = auth;
  stateRef.current = state;
  const request = (event: string, v: any = {}) =>
    new Promise<any>((resolve) =>
      socket
        .timeout(5000)
        .emit(
          event,
          { ...v, requestId: crypto.randomUUID() },
          (err: any, ack: any) => {
            if (err) {
              setError("連線逾時，請確認主機");
              resolve(null);
            } else if (!ack.ok) {
              if (event !== "draft:pick") setError(ack.errorCode);
              resolve(null);
            } else {
              setError("");
              resolve(ack);
            }
          },
        ),
    );
  const pairingPlayer = state?.players[auth?.seat === "red" ? 0 : 1];
  const pairingScope = JSON.stringify([auth?.roomCode, auth?.sessionId, auth?.playerToken, auth?.seat, pairingPlayer?.source]);
  const { code, clearCode, generateCode, secondsRemaining } = usePairCode(pairingScope, !!pairingPlayer?.controllerConnected, request);
  const save = (a: any) => {
    setAuth(a);
    authRef.current = a;
    sessionStorage.setItem("arena-auth", JSON.stringify(a));
    seq.current = 0;
  };
  const leavingRoom = useRef(false);
  const leaveRoom = async () => {
    if (leavingRoom.current) return;
    leavingRoom.current = true;
    try {
      // room:leave also saves an active PVE run as unfinished.
      if (!(await request("room:leave"))) return;
      authRef.current = null;
      stateRef.current = null;
      setAuth(null);
      setState(null);
      sessionStorage.removeItem("arena-auth");
      clearCode();
      seq.current = 0;
      setLabel("NONE");
      setTab("home");
    } finally {
      leavingRoom.current = false;
    }
  };
  useEffect(() => {
    const tabSession = claimTabSession();
    let disposed = false;
    const onConnect = async () => {
      const a = authRef.current;
      if (a) {
        const r = await request("room:resume", {
          roomCode: a.roomCode,
          playerToken: a.playerToken,
        });
        if (r) save({ ...a, ...r });
        else {
          sessionStorage.removeItem("arena-auth");
          setAuth(null);
        }
      }
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", () =>
      setError("連線中斷，正在重連；戰鬥由伺服器暫停"),
    );
    const onState = (s: any) => {
      if (!stateRef.current || stateRef.current.roomCode !== s.roomCode)
        setTab("room");
      setState(s);
      stateRef.current = s;
      const a = authRef.current;
      if (a && a.seat !== "spectator") {
        const p = s.players[a.seat === "red" ? 0 : 1];
        if (p && p.generation !== a.generation)
          save({ ...a, generation: p.generation });
      }
    };
    socket.on("room:state", onState);
    socket.on("match:snapshot", onState);
    socket.on("room:closed", (v) => {
      setError(v.reason);
      setAuth(null);
      setState(null);
      authRef.current = null;
      sessionStorage.removeItem("arena-auth");
      setTab("home");
    });
    socket.on("controller:status", (s) => setLabel(s.gestures?.length ? s.gestures.join(" + ") : s.gesture));
    socket.on("player:identity", (identity) => { save({ ...authRef.current, ...identity }); clearCode(); });
    void tabSession.ready.then((restore) => {
      if (disposed) return;
      if (!restore) {
        authRef.current = null;
        setAuth(null);
        setState(null);
        setTab("home");
      }
      socket.connect();
    });
    fetch("/health")
      .then((r) => r.json())
      .then(setHealth);
    const timer = setInterval(() => {
      if (socket.connected) socket.emit("client:heartbeat");
    }, 500);
    return () => {
      disposed = true;
      tabSession.close();
      clearInterval(timer);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    let pressed: string[] = [];
    const send = () => {
      const a = authRef.current,
        s = stateRef.current;
      if (!a || !s || !socket.connected || a.seat === "spectator") return;
      const p = s.players[a.seat === "red" ? 0 : 1];
      if (p?.source !== "keyboard") return;
      const value = keys[pressed.at(-1) ?? ""] ?? "NONE";
      socket.volatile.emit("input:state", {
        protocolVersion: 1,
        sessionId: a.sessionId,
        generation: p.generation,
        matchId: s.matchId,
        seq: seq.current++,
        gesture: value,
      });
      setLabel(value);
    };
    const down = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest("input,select,textarea") ||
        e.repeat
      )
        return;
      const k = e.key.toLowerCase();
      if (keys[k]) {
        e.preventDefault();
        pressed = pressed.filter((v) => v !== k);
        pressed.push(k);
        send();
      }
    };
    const up = (e: KeyboardEvent) => {
      pressed = pressed.filter((v) => v !== e.key.toLowerCase());
      send();
    };
    const clear = () => {
      pressed = [];
      send();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    const timer = setInterval(send, 100);
    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, []);
  const create = async (mode: string) => {
    const a = await request(mode === "PVP" ? "room:create" : "solo:create", {
      nickname,
      mode,
    });
    if (a) save(a);
    return a;
  };
  const hostEvent = (event: string, v: any = {}) =>
    request(event, {
      ...v,
      hostToken: auth?.hostToken,
      roomCode: auth?.roomCode,
    });
  const trySkill = async (id: string) => {
    if (auth && state?.mode !== "PRACTICE") {
      setError("先離開目前房間，再建立練習");
      return;
    }
    const sk = BY_ID[id];
    const next = {
      ...DEFAULT_LOADOUT,
      ...(sk.slot === "normal" ? {} : { [sk.slot]: id }),
    };
    setLoadout(next);
    if (!auth && !(await create("PRACTICE"))) return;
    if (
      auth &&
      ["PLAYING", "OVERTIME", "COUNTDOWN", "INTERMISSION"].includes(
        state?.phase,
      )
    )
      await hostEvent("match:pause");
    await request("solo:configure", {
      loadout: next,
      dummy: state?.config?.dummy ?? "stand",
      dummyX: state?.config?.dummyX ?? 1440,
      aids: state?.config?.aids ?? {},
    });
    setTab("room");
  };
  const me = state?.players[auth?.seat === "red" ? 0 : 1],
    host = !!auth?.hostToken,
    spectator = auth?.seat === "spectator";
  return (
    <>
      <header>
        <a onClick={() => setTab("home")} className="brand">
          GESTURE ARENA
        </a>
        <nav>
          {[
            ["home", "首頁"],
            ["skills", "技能圖鑑"],
            ["board", "排行榜"],
            ...(auth ? [["room", "目前房間"]] : []),
          ].map(([id, name]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                if (id === "board")
                  fetch(`/api/leaderboard?eligible=${formal}`)
                    .then((r) => r.json())
                    .then(setBoard);
              }}
            >
              {name}
            </button>
          ))}
        </nav>
      </header>
      {health?.internal && (
        <div className="warning">內測模式：所有挑戰結果不列正式手勢榜</div>
      )}
      {error && (
        <div role="alert" className="error">
          {error}
          <button onClick={() => setError("")}>關閉</button>
        </div>
      )}
      <main>
        {tab === "home" && (
          <>
            <section className="home-intro"><p className="eyebrow">PLAY</p><h1>選擇模式</h1></section>
            <section className="entry">
              <label>
                玩家暱稱
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={40}
                />
              </label>
              <div className="cards">
                {[
                  ["PVP", "雙人對決", "邀請一位朋友，依序選技後一局決勝。"],
                  ["PRACTICE", "假人練習", "測試手勢與技能，觀察傷害及反制。"],
                  ["PVE", "一命連戰", "每關90秒，存活過關回250血與3格氣。"],
                ].map(([id, title, desc]) => (
                  <button
                    className="mode-card"
                    disabled={!!auth}
                    onClick={() => create(id)}
                    key={id}
                  >
                    <small>{id}</small>
                    <h2>{title} ↗</h2>
                    <p>{desc}</p>
                  </button>
                ))}
              </div>
              <div className="join">
                <input
                  aria-label="房間碼"
                  placeholder="輸入六位數字房號"
                  inputMode="numeric"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                  <button
                    disabled={!!auth || !/^\d{6}$/.test(roomCode)}
                    onClick={async () => {
                      const a = await request("room:join", {
                        roomCode,
                        nickname,
                      });
                      if (a) save(a);
                    }}
                  >
                    加入房間
                  </button>
              </div>
            </section>
          </>
        )}
        {tab === "skills" && (
          <>
            <p className="eyebrow">
              SKILL CODEX · {state?.rulesVersion ?? "numeric-v2-2026-10-08"}
            </p>
            <h1>技能圖鑑</h1>
            <div className="toolbar">
              <input
                aria-label="搜尋技能"
                placeholder="搜尋技能名稱"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="技能類別"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">全部</option>
                {Object.entries(slotNames).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="skill-grid">
              {SKILLS.filter(
                (s) =>
                  (category === "all" || s.slot === category) &&
                  s.name.includes(query),
              ).map((s) => (
                <article key={s.id}>
                  <div className="skill-icon">
                    {s.slot === "defense"
                      ? "◇"
                      : s.slot === "control"
                        ? "❄"
                        : s.slot === "ultimate"
                          ? "✦"
                          : "↗"}
                  </div>
                  <small>
                    {slotNames[s.slot]} · {s.id}
                  </small>
                  <h2>{s.name}</h2>
                  <dl>
                    <dt>耗氣／冷卻</dt>
                    <dd>
                      {s.cost} 格／{s.cooldown} 秒
                    </dd>
                    <dt>準備／收招</dt>
                    <dd>
                      {s.prepare}／{s.recovery} 秒
                    </dd>
                    <dt>傷害</dt>
                    <dd>
                      {s.damage || "不適用（自身／領域）"}
                      {s.id === "stars"
                        ? "，最多200"
                        : s.id === "meteor"
                          ? " × 3波"
                          : ""}
                    </dd>
                    <dt>判定</dt>
                    <dd>
                      {s.shape
                        ? s.shape.kind === "circle"
                          ? `半徑 ${s.shape.r}`
                          : `${s.shape.w} × ${s.shape.h}`
                        : "自身效果，射程不適用"}
                    </dd>
                    {s.range && (
                      <>
                        <dt>中心路程</dt>
                        <dd>
                          {s.range} px
                          {s.speed ? ` · ${s.speed} px/s · ${s.life}s` : ""}
                        </dd>
                      </>
                    )}
                    {s.window && (
                      <>
                        <dt>有效窗口</dt>
                        <dd>
                          {s.window}s{s.id === "meteor" ? "；+0.6 / +1.2s" : ""}
                        </dd>
                      </>
                    )}
                    {s.duration && (
                      <>
                        <dt>持續時間</dt>
                        <dd>{s.duration}s</dd>
                      </>
                    )}
                    {s.shield && (
                      <>
                        <dt>護盾</dt>
                        <dd>{s.shield}</dd>
                      </>
                    )}
                    {s.slow && (
                      <>
                        <dt>緩速</dt>
                        <dd>
                          {s.slow * 100}% {s.slowTime ?? s.duration}s
                        </dd>
                      </>
                    )}
                    {s.root && (
                      <>
                        <dt>定身</dt>
                        <dd>{s.root}s</dd>
                      </>
                    )}
                    {s.push && (
                      <>
                        <dt>推退</dt>
                        <dd>
                          {s.push}px／格擋 {s.blockPush ?? 0}px
                        </dd>
                      </>
                    )}
                    {s.pull && (
                      <>
                        <dt>拉近</dt>
                        <dd>{s.pull}px；不能拉過施法者</dd>
                      </>
                    )}
                  </dl>
                  <p>{s.counter}</p>
                  <details>
                    <summary>特殊交互與施放規則</summary>
                    <p>{s.interaction}</p>
                  </details>
                  <button onClick={() => trySkill(s.id)}>
                    到練習場試用 ↗
                  </button>
                </article>
              ))}
            </div>
            <p>
              移動 A / D，跳躍 W，蹲下 S，格擋 Space。普攻 J，攻擊 K，防禦
              L，控制 U，大招 I。氣歸零失衡3秒；結束回1格。大招首次解鎖20秒。
            </p>
          </>
        )}
        {tab === "board" && (
          <>
            <p className="eyebrow">ONE LIFE · LOCAL LEADERBOARD</p>
            <h1>一命連戰排行榜</h1>
            <table>
              <thead>
                <tr>
                  <th scope="col">名次</th>
                  <th scope="col">玩家</th>
                  <th scope="col">擊殺</th>
                  <th scope="col">遊戲時間</th>
                  <th scope="col">操作模式</th>
                </tr>
              </thead>
              <tbody>
                {board.map((r, i) => (
                  <tr key={r.runId}>
                    <td>{formal ? i + 1 : "—"}</td>
                    <td>{r.nickname}</td>
                    <td>{r.defeated}</td>
                    <td>{(r.ticks / 60).toFixed(2)} 秒</td>
                    <td>
                      {r.sourceHistory.map((source:string)=>({recognizer:"手勢辨識",keyboard:"鍵盤",simulated:"模擬輸入"} as Record<string,string>)[source]??source).join(" → ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!board.length && <p>這個版本尚無紀錄。</p>}
          </>
        )}
        {tab === "room" && state && (
          state.mode === "PVP" ? <PvpRoom state={state} auth={auth} request={request} save={save} code={code} clearCode={clearCode} generateCode={generateCode} secondsRemaining={secondsRemaining} leave={async()=>{
            if(!confirm("離開目前房間？"))return;
            await leaveRoom();
          }}>{state.core&&<><Arena state={state} boxes={false}/><CameraPanels socket={socket} state={state} auth={auth}/></>}</PvpRoom> :
          <>
            <div className="room-heading">
              <div>
                <p className="eyebrow">
                  {state.mode === "PVE" ? "一命連戰" : "假人練習"}
                </p>
                <h2>
                  {phaseNames[state.phase]}
                  {state.run && ` · 第${state.run.round}關`}
                </h2>
              </div>
              <button
                hidden={["CONFIG","SOLO_DRAFT"].includes(state.phase)}
                onClick={() =>
                  document.querySelector(".arena-with-camera")?.requestFullscreen()
                }
              >
                全螢幕觀戰
              </button>
              <button
                onClick={async () => {
                  if (!confirm("離開目前房間？PVE將保存為未完成。")) return;
                  await leaveRoom();
                }}
              >
                離開房間
              </button>
            </div>
            {state.phase === "SOLO_DRAFT" ? <SoloDraft state={state} request={request} readOnly={spectator}/> : <div className={`room-body ${state.phase === "CONFIG" ? "solo-lobby" : ""}`}>
              <section className="play-column">
                {state.core && state.phase !== "CONFIG" ? (
                  <div className="arena-with-camera"><Arena state={state} boxes={boxes} /><CameraPanels socket={socket} state={state} auth={auth}/></div>
                ) : (
                  <div className="empty-arena">
                    ✦<p>等待配置與選技完成</p>
                  </div>
                )}
                {state.mode === "PRACTICE" && (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={boxes}
                        onChange={(e) => setBoxes(e.target.checked)}
                      />
                      顯示碰撞框與預警
                    </label>
                    {Object.values(state.config?.aids ?? {}).some(Boolean) && (
                      <div className="warning">
                        練習輔助：
                        {Object.entries(state.config.aids)
                          .filter(([, v]) => v)
                          .map(([k]) => ({ infiniteQi: "無限氣", noCooldown: "取消冷卻", unlock: "立即解鎖大招", immortal: "假人不死" } as Record<string,string>)[k] ?? k)
                          .join("、")}
                      </div>
                    )}
                  </>
                )}
                <p className="keyhelp">
                  A / D 移動　W 跳躍　S 蹲下　Space 格擋　J 普攻　K 攻擊　L
                  防禦　U 控制　I 大招
                </p>
                {state.stats && (
                  <details>
                    <summary>最近命中詳細紀錄</summary>
                    <table>
                      <tbody>
                        {state.stats.hits.map((h: any, i: number) => (
                          <tr key={i}>
                            <td>
                              {BY_ID[h.skill].name} #{h.castId}/{h.segment}
                            </td>
                            <td>
                              原傷{h.raw} 減傷{h.reduced} 護盾{h.absorbed} 生命
                              {h.health}
                            </td>
                            <td>{h.blocked ? "格擋" : h.control.join(",")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
                {state.run?.result && (
                  <div className="result">
                    <h2>擊敗 {state.run.result.defeated} 名敵人</h2>
                    <p>
                      {state.run.result.reason} ·{" "}
                      {(state.run.result.ticks / 60).toFixed(2)} 秒 ·{" "}
                      {state.run.result.eligible
                        ? "正式手勢榜"
                        : "另存來源紀錄"}
                    </p>
                  </div>
                )}
                {state.mode === "PVP" && state.core?.result && (
                  <div className="result">
                    <h2>
                      {state.core.result.winner === null
                        ? "平手，請以相同配置重賽"
                        : `${state.core.result.winner === 0 ? "紅方" : "藍方"}獲勝`}
                    </h2>
                    <p>
                      {state.core.result.reason === "ko"
                        ? "生命歸零"
                        : state.core.result.reason === "timeout"
                          ? "時間結束，生命較高者勝"
                          : "本房結果已由伺服器確認"}
                    </p>
                  </div>
                )}
              </section>
              <aside>
                <h3>{state.mode === "PVE" ? "挑戰設定" : "練習設定"}</h3>
                {state.players.map((p: any, i: number) => (
                  <div className="player" key={i}>
                    <b>
                      {i === 0 ? "紅方" : "藍方"}：
                      {p?.nickname ??
                        (state.mode === "PVP" ? "等待加入" : "電腦／假人")}
                    </b>
                    <p>
                      {p &&
                        `${p.connected ? "已連線" : "離線"} · ${p.ready ? "已準備" : "未準備"} · ${p.source === "keyboard" ? "網站鍵盤" : "手勢辨識"}`}
                    </p>
                  </div>
                ))}
                {!spectator && (
                  <>
                    <label>
                      控制來源
                      <select
                        value={me?.source ?? "recognizer"}
                        disabled={
                          ![
                            "LOBBY",
                            "CONFIG",
                            "READY",
                            "PAUSED",
                            "RESULT",
                          ].includes(state.phase)
                        }
                        onChange={(e) =>
                          request("player:source", { source: e.target.value })
                        }
                      >
                        <option value="recognizer">手勢辨識器</option>
                        <option value="keyboard">網站鍵盤</option>
                      </select>
                    </label>
                    {me?.source === "recognizer" && (
                      <>
                        <button
                          onClick={async () => {
                            if (me.controllerConnected && !confirm("確認撤銷並替換目前控制器？")) return;
                            await generateCode({ replace: !!me.controllerConnected });
                          }}
                        >
                          產生配對碼
                        </button>
                        {code && (
                          <p className="pair-code">
                            {code}
                            <small>剩餘 {secondsRemaining} 秒，僅提供給自己的工具</small>
                          </p>
                        )}
                        <p>
                          {me.controllerConnected
                            ? "控制器已連線"
                            : "等待 Python 工具配對"}{" "}
                          ·{" "}
                          {me.algorithmsAvailable
                            ? "接口可用"
                            : "必要算法尚未可用"}
                        </p>
                      </>
                    )}
                    {state.phase !== "CONFIG" && <p>最新輸入：{label}</p>}
                    <button
                      disabled={me?.source !== "keyboard" && !me?.algorithmsAvailable}
                      onClick={async () => {
                        const ready = await request("player:ready", { ready: !me?.ready });
                        if (ready && !me?.ready && ["CONFIG","RESULT"].includes(state.phase)) {
                          const configured = await request("solo:configure", {loadout,dummy,dummyX,aids});
                          if (configured) await request("solo:select");
                        }
                      }}
                    >
                      {me?.ready ? "取消準備" : "確認準備"}
                    </button>
                  </>
                )}
                {state.phase === "DRAFT" && (
                  <>
                    <h3>
                      第 {state.draftIndex + 1} 手 ·{" "}
                      {state.draftTurn === 0 ? "紅方" : "藍方"}
                    </h3>
                    <p>前兩手大招隱藏，後六手普通技能公開。</p>
                    {!spectator &&
                      state.draftTurn === (auth.seat === "red" ? 0 : 1) && (
                        <div className="draft-options">
                          {SKILLS.filter((s) =>
                            state.draftIndex < 2
                              ? s.slot === "ultimate"
                              : s.slot !== "ultimate" && s.slot !== "normal",
                          ).map((s) => (
                            <button
                              key={s.id}
                              onClick={() =>
                                request("draft:pick", { skillId: s.id })
                              }
                            >
                              {s.name}
                            </button>
                          ))}
                        </div>
                      )}
                  </>
                )}
                {state.mode !== "PVP" && !spectator && (
                  <>
                    {state.mode === "PRACTICE" && (
                      <>
                        <label>
                          假人姿態
                          <select
                            value={dummy}
                            onChange={(e) => setDummy(e.target.value)}
                          >
                            {[
                              ["stand", "站立"],
                              ["block", "格擋"],
                              ["crouch", "蹲下"],
                              ["jump", "循環跳躍"],
                            ].map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          假人 x
                          <input
                            type="number"
                            min={128}
                            max={1792}
                            value={dummyX}
                            onChange={(e) => setDummyX(Number(e.target.value))}
                          />
                        </label>
                        {[
                          ["infiniteQi", "無限氣"],
                          ["noCooldown", "取消冷卻"],
                          ["unlock", "立即解鎖大招"],
                          ["immortal", "假人不死"],
                        ].map(([k, v]) => (
                          <label className="check" key={k}>
                            <input
                              type="checkbox"
                              checked={!!aids[k]}
                              onChange={(e) =>
                                setAids({ ...aids, [k]: e.target.checked })
                              }
                            />
                            {v}
                          </label>
                        ))}
                      </>
                    )}
                    {state.mode === "PRACTICE" && <button
                      disabled={!["CONFIG","PAUSED","RESULT"].includes(state.phase)}
                      title="套用假人及輔助設定，重設練習場景與戰鬥狀態；確認準備也會自動套用。"
                      onClick={() =>
                        request("solo:configure", {
                          loadout,
                          dummy,
                          dummyX,
                          aids,
                        })
                      }
                    >
                      套用練習設定
                    </button>}
                    {["CONFIG","RESULT","PAUSED"].includes(state.phase) && !(state.mode==="PVE" && state.run && !state.run.result) && me?.ready && <button onClick={()=>request("solo:select")}>重新選技</button>}
                    {state.mode === "PRACTICE" && (
                      <button onClick={() => request("practice:stats-reset")}>
                        只清統計
                      </button>
                    )}
                    {state.mode === "PVE" && (
                      <button
                        onClick={async () => {
                          if (!confirm("結束挑戰並離開房間？進行中的挑戰將保存為未完成。")) return;
                          await leaveRoom();
                        }}
                      >
                        結束挑戰
                      </button>
                    )}
                  </>
                )}
                {host && (
                  <div className="management">
                    <h3>對戰控制</h3>
                    {state.mode === "PVP" && (
                      <>
                        <button onClick={() => hostEvent("draft:start")}>
                          開始選技
                        </button>
                        <button onClick={() => hostEvent("match:start")}>
                          倒數開戰
                        </button>
                        <button onClick={() => hostEvent("match:rematch")}>
                          相同配置重賽
                        </button>
                        <button onClick={() => hostEvent("match:next")}>
                          下一場／重新選技
                        </button>
                        <button
                          disabled={!["LOBBY", "RESULT"].includes(state.phase)}
                          onClick={() =>
                            confirm("釋放藍方席位並撤銷原玩家憑證？") &&
                            hostEvent("room:assign", {
                              seat: "blue",
                              action: "vacate",
                            })
                          }
                        >
                          釋放藍方席位／換玩家
                        </button>
                      </>
                    )}
                    <button onClick={() => hostEvent("match:pause")}>
                      暫停
                    </button>
                    <button onClick={() => hostEvent("match:resume")}>
                      確認準備並恢復
                    </button>
                    {state.mode === "PVP" && state.phase === "PAUSED" && (
                      <>
                        <button
                          onClick={() =>
                            hostEvent("match:forfeit", {
                              player: 0,
                              reason: "失聯逾30秒，房主判負",
                            })
                          }
                        >
                          紅方失聯判負
                        </button>
                        <button
                          onClick={() =>
                            hostEvent("match:forfeit", {
                              player: 1,
                              reason: "失聯逾30秒，房主判負",
                            })
                          }
                        >
                          藍方失聯判負
                        </button>
                      </>
                    )}
                  </div>
                )}
              </aside>
            </div>}
          </>
        )}
      </main>

    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
