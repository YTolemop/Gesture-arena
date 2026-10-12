import React, { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { HandPoint } from "../../../packages/protocol/camera.js";

type Preview = { playerId: string; generation: number; image?: string; hands?: HandPoint[][]; source: string; receivedAt: number };
const fingers = [[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];

export function CameraPanels({ socket, state, auth }: { socket: Socket; state: any; auth: any }) {
  const [frames, setFrames] = useState<(Preview | null)[]>([null, null]);
  const [now, setNow] = useState(Date.now());
  const current = useRef({ state, auth });
  current.current = { state, auth };
  useEffect(() => {
    setFrames([null, null]);
    const receive = (frame: any) => {
      const { state: s } = current.current;
      if (frame.roomCode !== s.roomCode || ![0,1].includes(frame.seat)) return;
      const p = s.players[frame.seat];
      if (!p || p.id !== frame.playerId || p.generation !== frame.generation) return;
      setFrames(previous => previous.map((old, i) => i === frame.seat ? { ...frame, receivedAt: Date.now() } : old));
    };
    const disconnected = () => setFrames([null, null]);
    socket.on("camera:frame", receive);
    socket.on("disconnect", disconnected);
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => { socket.off("camera:frame", receive); socket.off("disconnect", disconnected); clearInterval(timer); };
  }, [socket, state.roomCode]);

  return <div className="camera-panels">{(state.mode === "PVP" ? [0,1] : [0]).filter(i => state.players[i]?.source === "recognizer").map(i => {
    const p = state.players[i];
    const frame = frames[i];
    const live = !!p?.connected && socket.connected && !!frame && frame.playerId === p.id && frame.generation === p.generation && now - frame.receivedAt < 2500;
    const status = !p ? "等待玩家" : !p.connected ? "玩家已離線" : live ? frame.hands ? frame.hands.length ? `已偵測到 ${frame.hands.length} 隻手` : "未偵測到手" : "鏡頭已連線" : p.source === "recognizer" ? p.controllerConnected ? "等待辨識器鏡頭，請開啟鏡頭並使用更新版本" : "請配對辨識器並開啟鏡頭" : "等待鏡頭畫面";
    return <section key={i} className={`camera-panel camera-${i === 0 ? "red" : "blue"}`} aria-label={`${i === 0 ? "紅方" : "藍方"}鏡頭`}>
      <div className="camera-title"><b>{i === 0 ? "紅方" : "藍方"}</b><span>{p?.nickname ?? (state.mode === "PVP" ? "等待加入" : "電腦對手")}</span><i className={live ? "camera-live" : ""}/></div>
      <div className="camera-view">
        {live ? <div className="camera-mirror">{frame.image && <img src={frame.image} alt={`${i === 0 ? "紅方" : "藍方"}即時鏡頭`}/>}{frame.hands && <svg viewBox="0 0 320 240" aria-hidden="true">{frame.hands.map((hand,h) => <g key={h}>{fingers.map((chain,c) => <polyline key={c} points={chain.map(n => `${hand[n].x*320},${hand[n].y*240}`).join(" ")}/>)}{hand.map((point,n) => <circle key={n} cx={point.x*320} cy={point.y*240} r="2.5"/>)}</g>)}</svg>}</div> : <span className="camera-placeholder">{p ? "◉" : "—"}</span>}
      </div>
      <div className="camera-status" role="status">{status}</div>
    </section>;
  })}</div>;
}
