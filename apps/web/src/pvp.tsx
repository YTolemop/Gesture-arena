import React, { useEffect, useState } from "react";
import { SKILLS, BY_ID, Skill } from "../../../packages/game-core/skills.js";

const slots = ["ultimate", "attack", "defense", "control"] as const;
const names = { ultimate: "大招", attack: "攻擊", defense: "防禦", control: "控制" };
const icons: Record<string,string> = { fireball:"☄", spear:"➶", flame:"♨", stars:"✧", bomb:"◉", shield:"◇", mirror:"◈", wall:"▥", phase:"↔", resolve:"♜", ice:"❄", bind:"⌘", repulse:"↟", pull:"◎", slowfield:"◌", beam:"✦", meteor:"☄", nova:"☀", gravity:"◉", frost:"❅", storm:"≋", sanctuary:"♜", silence:"⊘", cleanse:"✥" };
type Props = { state:any; auth:any; request:(event:string,v?:any)=>Promise<any>; save:(v:any)=>void; code:string; clearCode:()=>void; generateCode:(v?:any)=>Promise<void>; secondsRemaining:number; leave:()=>void; children?:React.ReactNode };
export function SkillInfo({ skill }: { skill:Skill }) {
  return <><strong>{skill.name}</strong><p>{names[skill.slot as keyof typeof names]} · 耗氣 {skill.cost} 格 · 冷卻 {skill.cooldown} 秒</p><p>準備 {skill.prepare} 秒 · 收招 {skill.recovery} 秒</p><p>{skill.damage ? `每段傷害 ${skill.damage}` : "自身增益／場地效果"}{skill.shield ? ` · 護盾 ${skill.shield}` : ""}{skill.duration ? ` · 持續 ${skill.duration} 秒` : ""}</p><p>應對方式：{skill.counter}</p></>;
}
function SelectionSide({state,index,hover}:{state:any;index:number;hover:(v:Skill|null)=>void}) {
  const p=state.players[index];
  return <section className={`draft-side ${index===0?"red-side":"blue-side"}`} aria-label={index===0?"紅方已選技能":"藍方已選技能"}>
    <h2>{index===0?"紅方":"藍方"} <small>{index===0?"先選":"後選"}</small></h2><p>{p?.nickname ?? "等待玩家"}</p>
    {slots.map(slot=>{const id=p?.loadout?.[slot], skill=id?BY_ID[id]:null;
      const picked=slot==="ultimate"?p?.ultimatePicked:!!skill;
      return <div key={slot} className={`selected-skill ${picked?"locked":""}`} onMouseEnter={()=>hover(skill)} onMouseLeave={()=>hover(null)}>
        <span className="selected-icon">{skill?icons[skill.id]:picked?"◆":"＋"}</span><div><small>{names[slot]}</small><b>{skill?.name ?? (picked?"已鎖定 · 尚未公開":"尚未選擇")}</b></div>{picked&&<span className="lock-mark">✓</span>}
      </div>;
    })}
  </section>;
}
export function Draft({state,auth,request}:{state:any;auth:any;request:Props['request']}) {
  const [category,setCategory]=useState<(typeof slots)[number]>("ultimate"),[hover,setHover]=useState<Skill|null>(null),[pending,setPending]=useState(false);
  const seat=auth?.seat==="red"?0:auth?.seat==="blue"?1:-1, me=state.players[seat];
  useEffect(()=>{setCategory(state.draftIndex<2?"ultimate":slots.find(s=>s!=="ultimate"&&!me?.loadout?.[s])??"attack");setPending(false);},[state.draftIndex,seat]);
  const mine=state.draftTurn===seat;
  return <div className="draft-shell">
    <SelectionSide state={state} index={0} hover={setHover}/>
    <section className="draft-center">
      <div className="draft-heading"><small>技能選擇 · 紅方先選 · 第 {state.draftIndex+1} 手 / 8</small><strong className="draft-clock" aria-label="選技剩餘秒數">{state.draftSeconds}</strong><h2>{mine?"輪到你選擇技能":`等待${state.draftTurn===0?"紅方":"藍方"}選擇`}</h2><p>每手 30 秒 · 逾時自動鎖定合法技能</p></div>
      <nav className="draft-categories" aria-label="選技分類">{slots.map(slot=><button key={slot} aria-pressed={category===slot} disabled={!!me?.loadout?.[slot]} onClick={()=>setCategory(slot)}>{names[slot]}{me?.loadout?.[slot]?" ✓":""}</button>)}</nav>
      <div className="draft-grid">{SKILLS.filter(s=>s.slot===category).map(skill=>{
        const taken=skill.slot!=="ultimate"&&state.players.some((p:any)=>p&&Object.values(p.loadout).includes(skill.id));
        const filled=!!me?.loadout?.[skill.slot];
        const wrongPhase=(state.draftIndex<2)!==(skill.slot==="ultimate");
        const disabled=!mine||pending||taken||filled||wrongPhase;
        return <div key={skill.id} className={`draft-tile-wrap ${taken||filled?"unavailable":""}`} onMouseEnter={()=>setHover(skill)} onMouseLeave={()=>setHover(null)}>
          <button className={`draft-tile type-${skill.slot}`} aria-label={skill.name} disabled={disabled} onFocus={()=>setHover(skill)} onBlur={()=>setHover(null)} title={`${skill.name}：耗氣${skill.cost}，冷卻${skill.cooldown}秒。${skill.counter}`} onClick={async()=>{if(disabled)return;setPending(true);await request("draft:pick",{skillId:skill.id});setPending(false);}}>
            <span>{icons[skill.id]}</span><b>{skill.name}</b><small>{taken?"已被選擇":filled?"此欄位已鎖定":wrongPhase?"此階段不可選":`${skill.cost} 氣 · ${skill.cooldown}s`}</small>
          </button>{(taken||filled)&&<span className="tile-cross" aria-hidden>×</span>}
        </div>;
      })}</div>
      <div className="draft-description" role={hover?"tooltip":undefined}>{hover?<SkillInfo skill={hover}/>:<><strong>將滑鼠移到技能上查看說明</strong><p>先選大招，再選攻擊、防禦、控制各一招。一般技能不能與對方重複；大招可相同，施放前對方不會看到名稱。</p></>}</div>
    </section>
    <SelectionSide state={state} index={1} hover={setHover}/>
  </div>;
}
export function PvpRoom({state,auth,request,save,code,clearCode,generateCode,secondsRemaining,leave,children}:Props) {
  const spectator=auth?.seat==="spectator", index=auth?.seat==="red"?0:1, me=state.players[index];
  const battle=!!state.core;
  const readyEnabled=me?.source==="keyboard"||me?.algorithmsAvailable;
  const ready=async()=>request("player:ready",{ready:!me?.ready});
  const choose=async(seat:string)=>{const result=await request("room:seat",{seat});if(result){save({...auth,...result});clearCode();}};
  if(state.phase==="DRAFT") return <section className="pvp-page"><div className="pvp-topline"><span>房號：{state.roomCode}</span><span>最多 3 人 · 紅方先選</span><button onClick={leave}>離開房間</button></div><Draft state={state} auth={auth} request={request}/></section>;
  if(battle) return <div className="combat-stage">{children}<div className="combat-toolbar"><span>房號：{state.roomCode} · {spectator?"觀戰":auth?.seat==="red"?"紅方":"藍方"}</span>{!spectator&&["PLAYING","OVERTIME","COUNTDOWN","RESUME_COUNTDOWN"].includes(state.phase)&&<button onClick={()=>request("player:pause")}>暫停</button>}<button onClick={()=>document.querySelector(".combat-stage")?.requestFullscreen()}>全螢幕</button><button onClick={leave}>離開</button></div>
    {state.phase==="PAUSED"&&<div className="combat-dialog"><h2>對戰暫停</h2><p>紅藍雙方連線並準備後，自動倒數繼續。</p>{!spectator&&<><label>控制來源<select value={me?.source} onChange={e=>request("player:source",{source:e.target.value})}><option value="keyboard">網站鍵盤</option><option value="recognizer">手勢辨識器</option></select></label><button disabled={!readyEnabled} onClick={ready}>{me?.ready?"取消準備":"確認準備"}</button></>}</div>}
    {state.phase==="RESULT"&&<div className="combat-dialog"><h2>{state.core.result?.winner===null?"平手":state.core.result?.winner===0?"紅方獲勝":"藍方獲勝"}</h2>{!spectator&&<button onClick={()=>request("player:next")}>再來一場</button>}</div>}
  </div>;
  return <section className="pvp-lobby"><div className="pvp-topline"><span>雙人對戰 · 房號：<b>{state.roomCode}</b></span><span className="lobby-first-pick">紅方先選</span><button onClick={leave}>離開房間</button></div>
    <h1>{state.phase==="DRAFT_COUNTDOWN"?`${state.countdown} 秒後進入技能選擇`:state.phase==="READY"?"技能已鎖定，準備開戰":"準備對戰"}</h1><p className="lobby-subtitle">紅藍各一人，兩人準備後自動開始。觀戰席可以空缺。</p>
    <div className="lobby-seats">{["red","blue","spectator"].map((seat,i)=>{const p=i===2?state.observer:state.players[i];return <article key={seat} className={`seat-card seat-${seat} ${auth?.seat===seat?"is-me":""}`}><small>{i===0?"紅方 · 先選":i===1?"藍方":"觀戰"}</small><div className="seat-emblem">{i===2?"◉":"♜"}</div><h2>{p?.nickname??"空位"}</h2><p>{p?i===2?"觀戰不影響開局":p.ready?"✓ 已準備":"等待準備":"等待加入"}</p><button disabled={auth?.seat===seat} onClick={()=>choose(seat)}>{auth?.seat===seat?"目前位置":`換到${i===0?"紅方":i===1?"藍方":"觀戰"}`}</button></article>;})}</div>
    <p className="seat-hint">選擇已有人佔用的位置會互換位置；換位後需重新準備。</p>
    {!spectator&&<div className="lobby-controls"><label>控制來源<select value={me?.source??"recognizer"} disabled={state.phase==="DRAFT_COUNTDOWN"} onChange={e=>request("player:source",{source:e.target.value})}><option value="recognizer">手勢辨識器</option><option value="keyboard">網站鍵盤</option></select></label>
      {me?.source==="recognizer"&&<div className="lobby-pair"><button onClick={()=>generateCode({replace:me.controllerConnected})}>產生配對碼</button>{code&&<strong className="pair-code">{code}<small>剩餘 {secondsRemaining} 秒</small></strong>}<small>{me.algorithmsAvailable?"辨識器接口可用":"先完成 Python 配對，或改用網站鍵盤"}</small></div>}
      <button className="ready-button" disabled={!readyEnabled} onClick={ready}>{me?.ready?"取消準備":"確認準備"}</button></div>}
  </section>;
}
