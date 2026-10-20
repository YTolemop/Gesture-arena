import React from "react";
import { BY_ID } from "../../../packages/game-core/skills.js";

const slots = [["attack", "攻擊"], ["defense", "防禦"], ["control", "控制"], ["ultimate", "大招"]] as const;

export function CooldownPanels({ state }: { state: any }) {
  if (!state.core) return null;
  return <>{state.core.actors.map((actor: any, index: number) => <div
    key={index} className={`cooldown-row cooldown-${index === 0 ? "red" : "blue"}`}
    aria-label={`${index === 0 ? "紅方" : "藍方"}技能冷卻`}>
    {slots.map(([slot, label]) => {
      const skill = BY_ID[actor.loadout?.[slot]];
      // Read only the public loadout; unrevealed enemy ultimates stay hidden.
      const noCooldown = index === 0 && state.mode === "PRACTICE" && state.core.aids?.noCooldown;
      const remaining = skill && !noCooldown ? Math.max(0, actor.cooldowns?.[skill.id] ?? 0) : 0;
      const fraction = skill?.cooldown ? Math.min(1, remaining / skill.cooldown) : 0;
      const ready = !!skill && remaining === 0;
      const locked = slot === "ultimate" && !!skill && (state.core.elapsed?.[index] ?? state.core.tick) < 1200 && !(index === 0 && state.mode === "PRACTICE" && state.core.aids?.unlock);
      const caption = !skill ? "未公開" : remaining > 0 ? `${remaining.toFixed(1)} 秒` : locked ? "未解鎖" : "就緒";
      return <div key={slot} className={`cooldown-skill${ready && !locked ? " is-ready" : ""}`} title={`${label} · ${skill?.name ?? "未公開"} · ${caption}`}>
        <span className="cooldown-slot">{label}</span>
        <div className="cooldown-clock" style={{ background: `conic-gradient(from 0deg, #07111fe8 ${fraction * 360}deg, #20314680 0deg)` }}>
          <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21"/>
            {remaining > 0 && <><circle className="cooldown-ring" cx="24" cy="24" r="21" strokeDasharray="131.947" strokeDashoffset={131.947 * (1 - fraction)} transform="rotate(-90 24 24)"/>
              <line x1="24" y1="24" x2="24" y2="5" transform={`rotate(${(1 - fraction) * 360} 24 24)`}/></>}
          </svg><b>{!skill ? "?" : remaining > 0 ? Math.ceil(remaining) : locked ? "鎖" : "✓"}</b>
        </div>
        <span className="cooldown-name">{skill?.name ?? "未公開"}</span>
        <small>{caption}</small>
      </div>;
    })}
  </div>)}</>;
}
