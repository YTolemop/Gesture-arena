export const RULES_VERSION = "numeric-v2-2026-10-08";
export const AI_VERSION = "ai-v2-gentler-opening";
export type Slot = "attack" | "defense" | "control" | "ultimate" | "normal";
export type Shape =
  | { kind: "circle"; r: number }
  | { kind: "rect"; w: number; h: number };
export interface Skill {
  id: string;
  name: string;
  slot: Slot;
  cost: number;
  cooldown: number;
  prepare: number;
  recovery: number;
  damage: number;
  kind: string;
  shape?: Shape;
  y?: number;
  offset?: number;
  speed?: number;
  life?: number;
  range?: number;
  window?: number;
  duration?: number;
  slow?: number;
  slowTime?: number;
  root?: number;
  push?: number;
  blockPush?: number;
  pushSpeed?: number;
  pull?: number;
  shield?: number;
  delay?: number;
  ground?: boolean;
  counter: string;
  interaction: string;
}
const c = (r: number): Shape => ({ kind: "circle", r });
const r = (w: number, h: number): Shape => ({ kind: "rect", w, h });
const s = (
  id: string,
  name: string,
  slot: Slot,
  cost: number,
  cooldown: number,
  prepare: number,
  recovery: number,
  damage: number,
  kind: string,
  extra: Partial<Skill>,
): Skill => ({
  id,
  name,
  slot,
  cost,
  cooldown,
  prepare,
  recovery,
  damage,
  kind,
  counter: "走離判定範圍或地面格擋；跳躍須依實際碰撞高度判斷",
  interaction: "地面施放；開始扣氣及冷卻，準備可被新增僵直打斷；生成效果保留。",
  ...extra,
});
export const SKILLS: Skill[] = [
  s("normal", "法杖揮擊", "normal", 0, 0.8, 0.25, 0.35, 70, "front", {
    shape: r(100, 120),
    y: 840,
    window: 0.1,
    counter: "中心距離至少164；格擋",
    interaction: "有效窗口內新增受擊僵直取消揮擊；不耗氣。",
  }),
  s("fireball", "火球術", "attack", 1, 2, 0.35, 0.25, 100, "projectile", {
    shape: c(28),
    y: 844,
    speed: 800,
    life: 1.4,
    range: 1120,
    counter: "跳躍或格擋，不能蹲躲",
  }),
  s("spear", "穿雲槍", "attack", 2, 4, 0.6, 0.25, 240, "projectile", {
    shape: r(100, 20),
    y: 784,
    speed: 1200,
    life: 1,
    range: 1200,
    counter: "蹲下、適時跳躍或格擋",
  }),
  s("flame", "地走焰", "attack", 2, 4, 0.45, 0.25, 220, "projectile", {
    shape: r(100, 72),
    y: 864,
    speed: 640,
    life: 1.5,
    range: 960,
    interaction: "貼地，不可反射、風障阻擋或寂靜清除；不因碰地消失。",
    counter: "跳躍或格擋，不能蹲躲",
  }),
  s("stars", "散射星", "attack", 2, 4, 0.4, 0.25, 100, "projectile", {
    shape: c(16),
    y: 828,
    speed: 700,
    life: 0.8,
    range: 560,
    interaction: "三枚 -6/0/+6度；同目標最多兩枚，第三枚消除；可反射。",
  }),
  s("bomb", "延爆符", "attack", 3, 6, 0.5, 0.25, 360, "target", {
    shape: c(150),
    y: 800,
    delay: 0.7,
    window: 0.1,
    interaction: "施法時鎖定對手x，總預警1.2秒；可打空中，不可反射。",
  }),
  s("shield", "護盾術", "defense", 1, 6, 0.2, 0.25, 0, "shield", {
    shield: 120,
    duration: 2.5,
    counter: "等護盾到期；控制和僵直仍有效",
    interaction: "新舊不相加，較高剩餘值保留自己的到期時間，相等保留原值。",
  }),
  s("mirror", "鏡返術", "defense", 1, 5, 0.2, 0.25, 0, "mirror", {
    duration: 0.8,
    interaction:
      "受擊框外擴20，最多反射一枚普通彈，僅反轉vx；保留原施法ID、剩餘路程與壽命，不再次反射。",
    counter: "近戰、地焰、爆炸與大招",
  }),
  s("wall", "風障", "defense", 2, 7, 0.25, 0.25, 0, "wall", {
    shape: r(40, 300),
    offset: 140,
    y: 750,
    duration: 2,
    interaction: "固定牆，最多消除三枚普通可反射彈；不擋角色。",
    counter: "近戰、地焰、爆炸、大招或換邊",
  }),
  s("phase", "相位步", "defense", 2, 6, 0.2, 0.25, 0, "phase", {
    range: 280,
    interaction: "近期方向否則後退；瞬移穿人、無無敵；定身或強制位移禁止。",
    counter: "準備或落點仍可受擊",
  }),
  s("cleanse", "淨化術", "defense", 1, 6, 0.15, 0.25, 0, "cleanse", {
    duration: 2,
    interaction: "移除緩速與定身，免疫兩者2秒；不免推拉或僵直。",
    counter: "直接傷害、推拉",
  }),
  s("ice", "寒冰彈", "control", 1, 4, 0.35, 0.25, 80, "projectile", {
    shape: c(20),
    y: 844,
    speed: 720,
    life: 1.4,
    range: 1008,
    slow: 0.2,
    slowTime: 1.5,
    counter: "跳躍、格擋或淨化；不能蹲躲",
  }),
  s("bind", "束縛印", "control", 2, 6, 0.7, 0.25, 180, "target", {
    shape: r(200, 100),
    y: 850,
    window: 0.1,
    root: 0.6,
    ground: true,
    counter: "離開、跳躍、格擋或淨化",
  }),
  s("repulse", "斥力波", "control", 1, 4, 0.4, 0.25, 80, "front", {
    shape: r(280, 220),
    y: 790,
    window: 0.1,
    push: 160,
    pushSpeed: 800,
    blockPush: 40,
  }),
  s("pull", "牽引球", "control", 2, 5, 0.4, 0.25, 190, "projectile", {
    shape: c(26),
    y: 828,
    speed: 520,
    life: 2,
    range: 1040,
    pull: 200,
    pushSpeed: 800,
    interaction: "拉到命中時施法者固定位置前64，不拉過；格擋不拉近，可反射。",
  }),
  s("slowfield", "緩速領域", "control", 1, 7, 0.45, 0.25, 0, "field", {
    shape: r(320, 24),
    y: 888,
    offset: 260,
    duration: 3,
    slow: 0.3,
    ground: true,
    counter: "跳起、離開或淨化；格擋無效",
    interaction: "只對接地脚底區段生效，離場立即解除；同種自身領域最多一個。",
  }),
  s("beam", "星隕光束", "ultimate", 6, 30, 1, 0.6, 600, "front", {
    shape: r(960, 120),
    y: 810,
    window: 0.2,
    counter: "適時跳躍或格擋，不能蹲躲",
  }),
  s("meteor", "流星雨", "ultimate", 6, 30, 1, 0.4, 220, "target", {
    shape: r(360, 480),
    y: 660,
    window: 0.1,
    interaction:
      "固定對手x；生成、+0.6、+1.2秒三波，每波一次，共用施法ID與格擋扣氣。",
  }),
  s("nova", "奧術新星", "ultimate", 6, 30, 0.8, 0.4, 600, "selfArea", {
    shape: c(220),
    y: 828,
    window: 0.15,
    push: 280,
    pushSpeed: 1400,
    counter: "離圈或格擋；原地跳不保證避開",
  }),
  s("sanctuary", "聖域結界", "ultimate", 6, 30, 0.2, 0.4, 0, "shield", {
    shield: 600,
    duration: 5,
    interaction: "生效移除緩速與定身；不免後續控制、不回血。",
  }),
  s("silence", "寂靜屏障", "ultimate", 6, 30, 0.2, 0.4, 0, "shield", {
    shield: 480,
    duration: 4,
    interaction:
      "生效時以腳底為中心半徑360一次清除敵方普通可反射彈；不解除控制。",
  }),
  s("resolve", "不屈法陣", "ultimate", 6, 30, 0.2, 0.4, 0, "resolve", {
    duration: 6,
    interaction:
      "未格擋減傷60%，總額540；解除並免疫定身與推拉；額度耗盡全部失效。",
  }),
  s("gravity", "重力井", "ultimate", 6, 30, 0.9, 0.4, 480, "target", {
    shape: r(360, 100),
    y: 850,
    window: 0.1,
    duration: 3,
    slow: 0.4,
    ground: true,
    interaction: "生成傷害只對接地一次，留下3秒緩速領域；格擋不取消領域。",
  }),
  s("frost", "寒霜封界", "ultimate", 6, 30, 0.9, 0.4, 510, "front", {
    shape: r(720, 100),
    y: 850,
    window: 0.15,
    ground: true,
    root: 0.6,
    slow: 0.3,
    slowTime: 3,
    counter: "跳躍、格擋、淨化",
  }),
  s("storm", "風暴放逐", "ultimate", 6, 30, 0.8, 0.4, 540, "front", {
    shape: r(600, 330),
    y: 735,
    window: 0.15,
    push: 320,
    pushSpeed: 1280,
    blockPush: 60,
    slow: 0.3,
    slowTime: 2.5,
    counter: "退離或格擋；原地跳不保證躲避",
  }),
];
export const BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const DEFAULT_LOADOUT = {
  attack: "fireball",
  defense: "shield",
  control: "ice",
  ultimate: "beam",
};
export type Loadout = typeof DEFAULT_LOADOUT;
export function validLoadout(v: unknown): v is Loadout {
  return (
    !!v &&
    (["attack", "defense", "control", "ultimate"] as const).every(
      (k) => BY_ID[(v as Loadout)[k]]?.slot === k,
    )
  );
}
export const ticks = (seconds: number) => Math.round(seconds * 60);
