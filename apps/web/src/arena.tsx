import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { BY_ID } from "../../../packages/game-core/skills.js";
const terraceUrl = new URL("./assets/terrace-v6.png", import.meta.url).href;
const mageUrl = new URL("./assets/mage-sheet-v6.png", import.meta.url).href;
const phaseNames: Record<string,string> = { COUNTDOWN:"開場倒數", RESUME_COUNTDOWN:"恢復倒數", INTERMISSION:"過關間歇" };
export function Arena({ state, boxes }: { state: any; boxes: boolean }) {
  const root = useRef<HTMLDivElement>(null),
    latest = useRef(state),
    show = useRef(boxes);
  useEffect(() => {
    latest.current = state;
    show.current = boxes;
  }, [state, boxes]);
  useEffect(() => {
    let g: Phaser.GameObjects.Graphics,
      hud: Phaser.GameObjects.Graphics,
      fighters: Phaser.GameObjects.Sprite[] = [],
      text: Phaser.GameObjects.Text[] = [];
    let buffer: { time: number; s: any }[] = [];
    let oldSeq = -1;
    const previousHp = [1000,1000], hitUntil = [0,0];
    class Scene extends Phaser.Scene {
      preload() {
        this.load.image("terrace", terraceUrl);
        this.load.spritesheet("mage", mageUrl, { frameWidth: 512, frameHeight: 512 });
      }
      create() {
        this.game.canvas.tabIndex = 0;
        this.game.canvas.addEventListener("pointerdown", () =>
          this.game.canvas.focus(),
        );
        // The terrace lip and simulation ground share y=900. Background detail
        // is baked into one texture; only combat objects are redrawn per frame.
        this.add.image(0, 0, "terrace").setOrigin(0).setDisplaySize(1920, 1200);
        this.add.rectangle(960, 540, 1920, 1080, 0x07131e, .12);
        const veil = this.add.graphics();
        for (let y=0; y<160; y+=4) {
          veil.fillStyle(0x06101b, .65 * (1-y/160));
          veil.fillRect(0,y,1920,4);
        }
        g = this.add.graphics().setDepth(2);
        fighters = [0,1].map(i => this.add.sprite(0,0,"mage",0)
          .setOrigin(.5, 489/512).setScale(.36).setDepth(3)
          .setTint(i ? 0x9acaff : 0xffa5b1));
        hud = this.add.graphics().setDepth(5);
        for (let i = 0; i < 20; i++)
          text.push(
            this.add.text(0, 0, "", {
              fontFamily: "Microsoft JhengHei, sans-serif",
              fontSize: "24px",
              color: "#e5edf8",
              stroke: "#07101b", strokeThickness: 4,
            }).setDepth(6),
          );
      }
      update() {
        const s = latest.current;
        if (!s?.core) return;
        const now = performance.now();
        if (s.snapshotSeq !== oldSeq) {
          oldSeq = s.snapshotSeq;
          buffer.push({ time: now, s: structuredClone(s) });
          buffer = buffer.filter((v) => v.time > now - 500);
        }
        const current = s.core;
        let actors = current.actors.map((a: any) => ({ ...a }));
        const target = now - 100,
          lo = buffer.filter((v) => v.time <= target).at(-1),
          hi = buffer.find((v) => v.time > target);
        if (
          lo &&
          hi &&
          lo.s.matchId === hi.s.matchId &&
          hi.s.core.tick - lo.s.core.tick <= 6
        ) {
          const mix = Math.max(
            0,
            Math.min(1, (target - lo.time) / (hi.time - lo.time)),
          );
          actors = actors.map((a: any, i: number) => {
            const x = lo.s.core.actors[i],
              y = hi.s.core.actors[i];
            return Math.abs(x.x - y.x) < 100
              ? { ...a, x: x.x + (y.x - x.x) * mix, y: x.y + (y.y - x.y) * mix }
              : a;
          });
        }
        g.clear();
        hud.clear();
        // Small contact shadows and team marks keep feet readable on stone.
        actors.forEach((a:any,i:number) => {
          const airborne = Math.max(0, 900-a.y);
          g.fillStyle(0x061018, .30 * Math.max(.35, 1-airborne/500));
          g.fillEllipse(a.x,903,100-airborne*.07,18);
          g.lineStyle(2,i ? 0x8cbcff : 0xf39aa8,.72);
          g.lineBetween(a.x-25,902,a.x+25,902);
        });
        const area = (
          shape: any,
          x: number,
          y: number,
          color: number,
          alpha: number,
          skill = "",
          direction = 1,
        ) => {
          // Decoration stays inside the simulation shape. Low-opacity fill
          // preserves the opponent silhouette; the outer line is the hit edge.
          const active = alpha > .3;
          g.fillStyle(color, Math.min(alpha, .22));
          g.lineStyle(active ? 3 : 2, color, active ? .95 : .7);
          if (shape.kind === "circle") {
            g.fillCircle(x, y, shape.r);
            g.strokeCircle(x, y, shape.r);
            const radius = shape.r;
            g.lineStyle(1,color,active ? .55 : .3);
            g.strokeCircle(x,y,radius*.82);
            if (active && radius < 90) {
              g.fillStyle(color,.25);g.fillCircle(x,y,radius*.6);
              g.fillStyle(0xfff4dd,.7);g.fillCircle(x,y,radius*.22);
              for(let n=0;n<4;n++) {
                const angle=now*.003+n*Math.PI/2;
                g.lineStyle(2,0xfff4dd,.6);
                g.lineBetween(x+Math.cos(angle)*radius*.56,y+Math.sin(angle)*radius*.56,
                  x+Math.cos(angle+.45)*radius*.75,y+Math.sin(angle+.45)*radius*.75);
              }
              if (skill === "ice") {
                g.lineStyle(2,0xe0fbff,.9);
                for(let n=0;n<3;n++) {
                  const angle=n*Math.PI/3;
                  g.lineBetween(x-Math.cos(angle)*radius*.67,y-Math.sin(angle)*radius*.67,
                    x+Math.cos(angle)*radius*.67,y+Math.sin(angle)*radius*.67);
                }
              } else if (skill === "fireball") {
                g.fillStyle(0xffd689,.65);
                g.fillTriangle(x-direction*radius*.8,y-radius*.3,x+direction*radius*.3,y-radius*.42,x+direction*radius*.3,y+radius*.42);
                g.fillStyle(0xfff1cf,.9);g.fillCircle(x+direction*radius*.16,y,radius*.28);
              } else if (skill === "stars") {
                g.fillStyle(0xf6e9ff,.85);
                g.fillPoints([{x,y:y-radius*.7},{x:x+radius*.2,y:y-radius*.2},{x:x+radius*.7,y},
                  {x:x+radius*.2,y:y+radius*.2},{x,y:y+radius*.7},{x:x-radius*.2,y:y+radius*.2},
                  {x:x-radius*.7,y},{x:x-radius*.2,y:y-radius*.2}],true);
              }
            } else {
              for(let n=0;n<8;n++) {
                const angle=n*Math.PI/4;
                g.lineStyle(2,color,.75);
                g.lineBetween(x+Math.cos(angle)*radius*.88,y+Math.sin(angle)*radius*.88,
                  x+Math.cos(angle)*radius*.97,y+Math.sin(angle)*radius*.97);
              }
            }
          } else {
            const left = Math.max(96, x - shape.w / 2),
              right = Math.min(1824, x + shape.w / 2);
            g.fillRect(left, y - shape.h / 2, right - left, shape.h);
            g.strokeRect(left, y - shape.h / 2, right - left, shape.h);
            const top=y-shape.h/2, bottom=y+shape.h/2, inset=Math.min(8,shape.h*.15);
            if (active) {
              g.fillStyle(color,.2);
              g.fillRect(left+inset,top+inset,Math.max(0,right-left-inset*2),Math.max(0,shape.h-inset*2));
              g.lineStyle(2,0xfff4dd,.7);
              if (shape.w > shape.h*2) {
                g.lineBetween(left+inset,y,right-inset,y);
                g.lineStyle(1,color,.6);
                g.lineBetween(left+inset,y-shape.h*.22,right-inset,y-shape.h*.22);
                g.lineBetween(left+inset,y+shape.h*.22,right-inset,y+shape.h*.22);
                if (skill === "beam") {
                  g.lineStyle(8,0xfff6ce,.7);g.lineBetween(left+inset,y,right-inset,y);
                  g.lineStyle(1,color,.7);
                  for(let sx=left+30;sx<right-25;sx+=80) {
                    g.lineBetween(sx,y-shape.h*.3,sx+18,y);
                    g.lineBetween(sx+18,y,sx,y+shape.h*.3);
                  }
                } else if (skill === "spear") {
                  const tip = direction>0 ? right-inset : left+inset;
                  g.fillStyle(0xfff4dd,.8);
                  g.fillTriangle(tip,y,tip-direction*18,y-shape.h*.32,tip-direction*18,y+shape.h*.32);
                }
              } else {
                g.lineBetween((left+right)/2,top+inset,(left+right)/2,bottom-inset);
              }
            }
            // Corner brackets give rectangular warnings an intentional style.
            const corner=Math.min(16,shape.h*.3,(right-left)*.2);
            g.lineStyle(3,color,.9);
            for (const edge of [left,right]) for (const cy of [top,bottom]) {
              g.lineBetween(edge,cy,edge+(edge===left ? corner : -corner),cy);
              g.lineBetween(edge,cy,edge,cy+(cy===top ? corner : -corner));
            }
          }
        };
        for (const a of current.actors)
          if (a.cast) {
            const c = a.cast,
              sk = BY_ID[c.skill];
            if (sk.shape && ["front", "target", "selfArea"].includes(sk.kind)) {
              let x = sk.kind === "target" ? c.target : c.x;
              if (sk.kind === "front" && sk.shape.kind === "rect")
                x += c.dir * (32 + sk.shape.w / 2);
              area(sk.shape, x, sk.y!, 0xffd781, 0.12);
            }
          }
        for (const o of current.objects) {
          const sk = BY_ID[o.skill],
            active = o.start <= current.tick,
            color = o.owner === 0 ? 0xf48190 : 0x78b9ff;
          if (o.field) area(o.shape, o.x, o.y, 0xa48af9, active ? .4 : .12);
          else
            area(
              o.shape,
              o.x,
              o.y,
              (
                {
                  fireball: 0xff7547,
                  spear: 0xffe59b,
                  flame: 0xff4b44,
                  stars: 0xcaa1ff,
                  ice: 0x81ecff,
                  pull: 0x94a7ff,
                  bind: 0x61e3a7,
                  bomb: 0xffa465,
                  beam: 0xffec9a,
                  meteor: 0xff9850,
                  nova: 0xd7a0ff,
                  frost: 0x80ecff,
                  storm: 0x9adacd,
                  wall: 0x9af3c6,
                } as Record<string, number>
              )[o.skill] ?? color,
              active ? 0.65 : 0.12,
              o.skill,
              Math.sign(o.vx) || 1,
            );
        }
        actors.forEach((a: any, i: number) => {
          const col = i === 0 ? 0xef758c : 0x6dabff,
            x = a.x,
            y = a.y,
            h = a.crouch ? 96 : 168;
          const labels: string[] = a.labels ?? [a.label];
          const moving = (labels.includes("MOVE_LEFT") !== labels.includes("MOVE_RIGHT")) && a.ground && !a.stun && !a.root;
          const frame = a.crouch ? 3 : a.blocking ? 5 : a.cast || a.busy ? 4
            : moving ? 1 + Math.floor(now/130)%2 : 0;
          const sprite = fighters[i];
          sprite.setFrame(frame).setFlipX(a.dir < 0).setPosition(x,y);
          sprite.setOrigin(.5, [489,484,484,449,461,463][frame]/512).setScale(.36);
          sprite.setAlpha(a.hp > 0 ? 1 : .4);
          if (a.hp < previousHp[i]) hitUntil[i] = now+100;
          previousHp[i] = a.hp;
          if (hitUntil[i] > now) sprite.setTintFill(0xffe9d9);
          else { sprite.tintFill = false; sprite.setTint(i ? 0x9acaff : 0xffa5b1); }
          // Arcane hands communicate casting without obscuring hit boundaries.
          if (a.cast || a.blocking) {
            const palmX = x+a.dir*(a.blocking ? 40 : 61), palmY = y-(a.crouch ? 58 : 107);
            g.fillStyle(col,.12);g.fillCircle(palmX,palmY,27);
            g.lineStyle(2,col,.8);g.strokeCircle(palmX,palmY,15);
            g.fillStyle(0xe7f3ff,.8);g.fillCircle(palmX,palmY,4);
          }
          if (a.blocking) {
            g.lineStyle(5, 0x8de3ce);
            g.strokeCircle(x, y - 75, 87);
          }
          if (a.shield) {
            g.lineStyle(3, 0x9c8afa);
            g.strokeEllipse(x, y - h / 2, 108, h + 25);
          }
          if (a.mirror) {
            g.lineStyle(4, 0xffe5b1);
            g.strokeRect(
              x - 52,
              y - (a.crouch ? 80 : 144) - 20,
              104,
              (a.crouch ? 80 : 144) + 40,
            );
          }
          if (a.resolve) {
            g.lineStyle(4, 0xffd781);
            g.strokeCircle(x, y - 75, 100);
          }
          if (show.current) {
            g.lineStyle(2, 0xffffff, 0.8);
            g.strokeRect(
              x - 32,
              y - (a.crouch ? 80 : 144),
              64,
              a.crouch ? 80 : 144,
            );
          }
          // Both meters drain toward the outside, mirrored around x=960.
          const width = 800, left = i ? 1056 : 64;
          const healthWidth = width * Math.max(0, Math.min(1, a.hp / 1000));
          hud.fillStyle(0x040c16,.92);hud.fillRoundedRect(left-9,31,width+18,46,4);
          hud.lineStyle(1,0xb1a184,.7);hud.strokeRoundedRect(left-9,31,width+18,46,4);
          hud.fillStyle(0x273342);hud.fillRect(left,40,width,28);
          const healthLeft = i ? left : left+width-healthWidth;
          hud.fillStyle(col);hud.fillRect(healthLeft,40,healthWidth,28);
          hud.fillStyle(0xffeef0,.22);hud.fillRect(healthLeft,40,healthWidth,4);
          hud.fillStyle(0x102437,.22);hud.fillRect(healthLeft,61,healthWidth,7);
          // A narrow bright edge marks remaining health even during large effects.
          if (healthWidth > 0) {
            hud.fillStyle(0xfff5ed,.8);hud.fillRect(i ? healthLeft+healthWidth-2 : healthLeft,40,2,28);
          }
          for (let q = 0; q < 6; q++) {
            const cellWidth = (width - 5 * 8) / 6;
            const cellLeft = i ? left + q * (cellWidth + 8) : left + width - cellWidth - q * (cellWidth + 8);
            const filled = cellWidth * Math.max(0, Math.min(1, a.qi - q));
            hud.fillStyle(0x07101a,.9);hud.fillRect(cellLeft-2,87,cellWidth+4,22);
            hud.lineStyle(1,0x89927e,.55);hud.strokeRect(cellLeft-2,87,cellWidth+4,22);
            hud.fillStyle(0x273342);hud.fillRect(cellLeft,90,cellWidth,16);
            const qiLeft = i ? cellLeft : cellLeft+cellWidth-filled;
            hud.fillStyle(0xe5c583);hud.fillRect(qiLeft,90,filled,16);
            hud.fillStyle(0xffefc1,.5);hud.fillRect(qiLeft,90,filled,3);
          }
          text[4 + i]
            .setPosition(x - 80, y - h - 52)
            .setText(
              a.imbalance
                ? `失衡 ${a.imbalance.toFixed(1)}`
                : a.root
                  ? "定身"
                  : a.stun
                    ? "受擊"
                    : a.slow
                      ? `緩速 ${Math.round(a.slow * 100)}%`
                      : "",
            );
        });
        hud.fillStyle(0x07101b,.94);
        hud.fillPoints([{x:912,y:25},{x:1008,y:25},{x:1025,y:43},{x:1016,y:108},{x:960,y:121},{x:904,y:108},{x:895,y:43}],true);
        hud.lineStyle(1,0xb1a184,.75);
        hud.strokePoints([{x:912,y:25},{x:1008,y:25},{x:1025,y:43},{x:1016,y:108},{x:960,y:121},{x:904,y:108},{x:895,y:43}],true);
        text[6]
          .setOrigin(0.5, 0)
          .setPosition(960, 37)
          .setFontSize(48)
          .setText(
            current.remaining === null
              ? "練習"
              : String(Math.ceil(current.remaining)),
          );
        text[7]
          .setOrigin(0.5, 0.5)
          .setPosition(960, 540)
          .setFontSize(64)
          .setText(
            ["COUNTDOWN", "RESUME_COUNTDOWN", "INTERMISSION"].includes(s.phase)
              ? `${phaseNames[s.phase]} ${s.countdown}`
              : s.phase === "PAUSED"
                ? "已暫停"
                : s.phase === "RESULT"
                  ? "本場結束"
                  : "",
          );
      }
    }
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: root.current!,
      width: 1920,
      height: 1080,
      backgroundColor: "#0c1422",
      scene: Scene,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      audio: { noAudio: true },
    });
    return () => game.destroy(true);
  }, []);
  return <div className="arena" ref={root} />;
}
