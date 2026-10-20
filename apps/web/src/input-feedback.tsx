import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

const actionNames: Record<string, string> = {
  NONE: "中立", MOVE_LEFT: "左移", MOVE_RIGHT: "右移", JUMP: "跳躍", CROUCH: "蹲下",
  BLOCK: "防禦", NORMAL_ATTACK: "普攻", ATTACK_SKILL: "攻擊技", DEFENSE_SKILL: "防禦技",
  CONTROL_SKILL: "控制技", ULTIMATE: "大招",
};
const reasons: Record<string, string> = {
  OK: "已執行", NOT_PLAYING: "等待開戰／恢復", NEUTRAL_REQUIRED: "請先放下雙手回到中立",
  OPPOSITE_DIRECTIONS: "左右移動同時輸入，互相抵銷", ACTION_LOCKED: "空中、受擊或收招中",
  RELEASE_REQUIRED: "請先離開該手勢至少 0.1 秒，再做一次",
  IMBALANCE: "失衡中", ROOTED: "定身中", INSUFFICIENT_QI: "氣量不足", COOLDOWN: "技能冷卻中",
  ULTIMATE_LOCKED: "大招尚未解鎖", PROJECTILE_ACTIVE: "上一發仍在場上", INVALID_ACTION: "未設定此技能",
};

export function InputFeedback({ socket, state, auth }: { socket: Socket; state: any; auth: any }) {
  const [received, setReceived] = useState("等待輸入");
  const [gate, setGate] = useState("");
  const [action, setAction] = useState("");
  const seat = auth?.seat === "red" ? 0 : 1;
  const generation = state.players[seat]?.generation;
  useEffect(() => {
    setReceived("等待輸入"); setGate(""); setAction("");
    const current = (v: any) => (v.matchId === undefined || v.matchId === state.matchId)
      && (v.generation === undefined || v.generation === generation);
    const status = (v: any) => {
      if (v.seat !== seat || !current(v)) return;
      const labels = v.gestures?.filter((label: string) => label !== "NONE") ?? [];
      setReceived(labels.length ? labels.map((label: string) => actionNames[label] ?? label).join(" ＋ ") : "中立");
      setGate(v.inputState && v.inputState !== "READY" ? reasons[v.inputState] ?? v.inputState : "");
    };
    const result = (v: any) => {
      if (v.actor !== seat || !current(v)) return;
      setAction(`${actionNames[v.label] ?? v.label}：${reasons[v.reason] ?? v.reason}`);
    };
    const disconnect = () => { setReceived("連線中斷"); setGate(""); setAction(""); };
    socket.on("controller:status", status); socket.on("input:result", result); socket.on("disconnect", disconnect);
    return () => { socket.off("controller:status", status); socket.off("input:result", result); socket.off("disconnect", disconnect); };
  }, [socket, state.roomCode, state.matchId, state.phase, generation, seat]);
  if (!auth || auth.seat === "spectator") return null;
  return <div className="input-feedback"><span>收到：{received}</span>{gate ? <strong>{gate}</strong> : action && <span>上次動作 · {action}</span>}</div>;
}
