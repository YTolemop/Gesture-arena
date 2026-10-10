import React, {useEffect,useState} from "react";
import {SKILLS,BY_ID,Skill} from "../../../packages/game-core/skills.js";
import {SkillInfo} from "./pvp.js";
const slots=["ultimate","attack","defense","control"] as const;
const names={ultimate:"大招",attack:"攻擊",defense:"防禦",control:"控制"};
export function SoloDraft({state,request,readOnly=false}:{state:any;request:(event:string,v?:any)=>Promise<any>;readOnly?:boolean}) {
  const me=state.players[0], [category,setCategory]=useState<(typeof slots)[number]>("ultimate"), [hover,setHover]=useState<Skill|null>(null), [pending,setPending]=useState(false);
  const filled=(s:string)=>s==="ultimate"?me.ultimatePicked:!!me.loadout[s];
  useEffect(()=>{setCategory(slots.find(s=>!filled(s))??"ultimate");setPending(false);},[state.draftIndex]);
  return <section className="solo-draft draft-shell">
    <section className="draft-side red-side"><h2>已選技能</h2><p>{me.nickname}</p>{slots.map(s=><div className={`selected-skill ${filled(s)?"locked":""}`} key={s}><span className="selected-icon">{filled(s)?"✓":"＋"}</span><div><small>{names[s]}</small><b>{BY_ID[me.loadout[s]]?.name??(filled(s)?"已鎖定":"尚未選擇")}</b></div></div>)}</section>
    <section className="draft-center"><div className="draft-heading"><small>{state.mode==="PVE"?"一命連戰":"假人練習"} · 第 {state.draftIndex+1} 手 / 4</small><strong className="draft-clock">{state.draftSeconds}</strong><h2>選擇技能</h2><p>每手 30 秒 · 選完後自動開始</p></div>
      <nav className="draft-categories" aria-label="選技分類">{slots.map(s=><button key={s} disabled={filled(s)} aria-pressed={category===s} onClick={()=>setCategory(s)}>{names[s]}{filled(s)?" ✓":""}</button>)}</nav>
      <div className="draft-grid">{SKILLS.filter(s=>s.slot===category).map(skill=><div className="draft-tile-wrap" key={skill.id} onMouseEnter={()=>setHover(skill)} onMouseLeave={()=>setHover(null)}><button className={`draft-tile type-${skill.slot}`} aria-label={skill.name} disabled={readOnly||pending||filled(skill.slot)} onFocus={()=>setHover(skill)} onBlur={()=>setHover(null)} onClick={async()=>{setPending(true);await request("solo:pick",{skillId:skill.id});setPending(false);}}><span>{skill.slot==="ultimate"?"✦":skill.slot==="defense"?"◇":skill.slot==="control"?"❄":"➶"}</span><b>{skill.name}</b><small>{skill.cost} 氣 · {skill.cooldown}s</small></button></div>)}</div>
      <div className="draft-description" role={hover?"tooltip":undefined}>{hover?<SkillInfo skill={hover}/>:<strong>將滑鼠移到技能上查看說明</strong>}</div>
    </section>
  </section>;
}
