import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { Socket, Server } from "socket.io";
import { GameCore, Aids } from "../../packages/game-core/core.js";
import {
  DEFAULT_LOADOUT,
  Loadout,
  BY_ID,
  RULES_VERSION,
  AI_VERSION,
  validLoadout,
} from "../../packages/game-core/skills.js";
import { AIController, aiLoadout } from "../../packages/game-core/ai.js";
import { validInput, inputLabels, Source } from "../../packages/protocol/index.js";
import { LeaderboardRepository, RunResult } from "./leaderboard.js";
import { validCameraFrame } from "../../packages/protocol/camera.js";
const token = () => randomBytes(24).toString("hex");
export interface Player {
  nickname: string;
  id: string;
  token: string;
  session: string;
  socket: Socket | null;
  heartbeat: number;
  ready: boolean;
  source: Source;
  generation: number;
  seq: number;
  loadout: Partial<Loadout>;
  controller: null | {
    token: string;
    session: string;
    socket: Socket | null;
    heartbeat: number;
    seq: number;
    source: Source;
    available: boolean;
  };
  code?: { value: string; end: number };
}
export interface Room {
  id: string;
  code: string;
  mode: "PVP" | "PRACTICE" | "PVE";
  hostToken: string;
  players: (Player | null)[];
  spectator: Player | null;
  phase: string;
  previous: string;
  countdownEnd: number;
  pauseAt: number;
  lastActivity: number;
  draftOrder: number[];
  draftIndex: number;
  draftDeadline: number;
  core: GameCore | null;
  matchId: string | null;
  config: { aids: Partial<Aids>; dummy: string; dummyX: number };
  run: null | {
    id: string;
    seed: number;
    round: number;
    defeated: number;
    ticks: number;
    sourceHistory: Source[];
    result?: RunResult;
  };
  ai: AIController | null;
  snapshotSeq: number;
}
export class RoomManager {
  wallTick = 0;
  rooms = new Map<string, Room>();
  pairAttempts = new Map<string, { start: number; count: number }>();
  acks = new Map<string, any>();
  now = () => Date.now();
  constructor(
    public io: Server,
    public repo: LeaderboardRepository,
    public internal = false,
    public maxRooms = 32,
  ) {
    if (!Number.isSafeInteger(maxRooms) || maxRooms < 1)
      throw new Error("MAX_ROOMS 必須是正整數");
  }
  error(code: string): never {
    throw new Error(code);
  }
  player(nickname: any): Player {
    if (typeof nickname !== "string") return this.error("INVALID_NICKNAME");
    nickname = nickname.trim();
    if (
      [...nickname].length < 1 ||
      [...nickname].length > 20 ||
      /[\p{Cc}\p{Cf}]/u.test(nickname)
    )
      return this.error("INVALID_NICKNAME");
    return {
      nickname,
      id: randomUUID(),
      token: token(),
      session: token(),
      socket: null,
      heartbeat: this.now(),
      ready: false,
      source: "recognizer",
      generation: 1,
      seq: -1,
      loadout: {},
      controller: null,
    };
  }
  room(code: string) {
    const r = this.rooms.get(code);
    if (!r) this.error("ROOM_NOT_FOUND");
    return r!;
  }
  identity(s: Socket) {
    const r = this.room(s.data.roomCode);
    const i = r.players.findIndex((p) => p?.socket === s);
    if (i < 0) this.error("PLAYER_REQUIRED");
    return { r, p: r.players[i]!, i };
  }
  observerCredentials(r: Room, p: Player) {
    return { roomCode: r.code, playerId: p.id, playerToken: p.token, sessionId: p.session, generation: p.generation, seat: "spectator" };
  }
  bindObserver(s: Socket, r: Room, p: Player) {
    if (p.socket && p.socket !== s) p.socket.disconnect(true);
    p.socket = s; p.session = token(); p.heartbeat = this.now(); p.seq = -1;
    s.data.roomCode = r.code; s.data.session = p.session; s.data.seat = "spectator";
    return this.observerCredentials(r, p);
  }
  beginDraft(r: Room) {
    r.draftOrder = [0,1,1,0,0,1,1,0]; r.draftIndex = 0; r.phase = "DRAFT";
    r.draftDeadline = this.now() + 30000;
    for (const p of r.players) p!.loadout = {};
    this.context(r);
  }
  pickDraft(r: Room, i: number, id: string) {
    const p = r.players[i]!, skill = BY_ID[id];
    if (!skill || skill.slot === "normal") this.error("INVALID_SKILL");
    if ((r.draftIndex < 2) !== (skill.slot === "ultimate")) this.error("WRONG_SLOT");
    if (p.loadout[skill.slot]) this.error("SLOT_FILLED");
    if (skill.slot !== "ultimate" && r.players.some((p) => p && Object.values(p.loadout).includes(id))) this.error("SKILL_TAKEN");
    p.loadout[skill.slot] = id; r.draftIndex++; r.draftDeadline = this.now() + 30000;
    if (r.draftIndex === 8) {
      r.phase = "READY";
      if (r.players.every((p) => p?.ready && this.available(p))) { this.newCore(r); this.countdown(r); }
    }
    this.context(r);
  }
  host(s: Socket, v: any) {
    const r = this.room(v.roomCode ?? s.data.roomCode);
    if (v.hostToken !== r.hostToken) this.error("HOST_REQUIRED");
    return r;
  }
  pickSolo(r: Room, id: string) {
    const p = r.players[0]!, skill = BY_ID[id];
    if (!skill || skill.slot === "normal") this.error("INVALID_SKILL");
    if (p.loadout[skill.slot]) this.error("SLOT_FILLED");
    p.loadout[skill.slot] = id;
    r.draftIndex++; r.draftDeadline = this.now() + 30000;
    if (r.draftIndex === 4) {
      this.checkReady(r);
      if (r.mode === "PVE") r.run = { id: randomUUID(), seed: randomInt(1,2147483647), round:1, defeated:0, ticks:0, sourceHistory:[p.source] };
      if (r.run && p.controller?.source === "simulated") r.run.sourceHistory.push("simulated");
      this.newCore(r); this.countdown(r);
    }
    this.context(r);
  }
  bind(s: Socket, r: Room, p: Player) {
    if (p.socket && p.socket !== s) p.socket.disconnect(true);
    p.socket = s;
    r.core?.actors[r.players.indexOf(p)].input.reset();
    p.session = token();
    p.seq = -1;
    p.heartbeat = this.now();
    s.data.roomCode = r.code;
    s.data.seat = r.players.indexOf(p);
    s.data.session = p.session;
    this.context(r);
    return this.credentials(r, p);
  }
  credentials(r: Room, p: Player) {
    return {
      protocolVersion: 1,
      roomCode: r.code,
      roomId: r.id,
      playerId: p.id,
      seat: r.players.indexOf(p) === 0 ? "red" : "blue",
      playerToken: p.token,
      sessionId: p.session,
      generation: p.generation,
      matchId: r.matchId,
    };
  }
  context(r: Room) {
    for (const p of r.players)
      if (p?.controller?.socket) {
        p.controller.socket.emit("controller:context", {
          protocolVersion: 1,
          roomId: r.id,
          roomCode: r.code,
          matchId: r.matchId,
          phase: r.phase,
          mode: r.mode,
          runId: r.run?.id ?? null,
          roundIndex: r.run?.round ?? null,
          generation: p.generation,
          source: p.source,
          sessionId: p.controller.session,
          rulesVersion: RULES_VERSION,
          aiVersion: AI_VERSION,
        });
      }
  }
  create(s: Socket, v: any) {
    if (this.rooms.size >= this.maxRooms) this.error("ROOM_CAPACITY");
    if (s.data.roomCode) this.error("ALREADY_JOINED");
    const mode = v.mode ?? "PVP";
    if (!["PVP", "PRACTICE", "PVE"].includes(mode)) this.error("INVALID_MODE");
    const p = this.player(v.nickname);
    let code: string;
    do { code = randomInt(100000, 1000000).toString(); } while (this.rooms.has(code));
    const r: Room = {
      id: randomUUID(),
      code,
      mode,
      hostToken: token(),
      players: [p, null],
      spectator: null,
      phase: mode === "PVP" ? "LOBBY" : "CONFIG",
      previous: "",
      countdownEnd: 0,
      pauseAt: 0,
      lastActivity: this.now(),
      draftOrder: [],
      draftIndex: 0,
      draftDeadline: 0,
      core: null,
      matchId: null,
      config: { aids: {}, dummy: "stand", dummyX: 1440 },
      run: null,
      ai: null,
      snapshotSeq: 0,
    };
    if (mode !== "PVP") p.loadout = { ...DEFAULT_LOADOUT };
    this.rooms.set(code, r);
    return { ...this.bind(s, r, p), hostToken: r.hostToken };
  }
  ack(s: Socket, event: string, handler: (v: any) => any) {
    s.on(event, (v: any = {}, cb: any) => {
      let out: any;
      const key = `${s.id}:${event}:${v.requestId}`;
      try {
        if (typeof v.requestId !== "string" || v.requestId.length > 100)
          this.error("REQUEST_ID_REQUIRED");
        if (this.acks.has(key)) {
          cb?.(this.acks.get(key));
          return;
        }
        if (JSON.stringify(v).length > 8192) this.error("PAYLOAD_TOO_LARGE");
        out = { requestId: v.requestId, ok: true, ...handler(v) };
        this.acks.set(key, out);
        if (this.acks.size > 4096)
          this.acks.delete(this.acks.keys().next().value!);
        if (s.data.roomCode) this.publish(this.room(s.data.roomCode));
      } catch (e) {
        out = {
          requestId: v.requestId,
          ok: false,
          errorCode: e instanceof Error ? e.message : "INTERNAL_ERROR",
        };
      }
      if (typeof cb === "function") cb(out);
    });
  }
  attachArena(s: Socket) {
    s.on("camera:frame", (v) => this.camera(s, v, false));
    this.ack(s, "room:create", (v) => this.create(s, { ...v, mode: "PVP" }));
    this.ack(s, "solo:create", (v) => this.create(s, v));
    this.ack(s, "room:join", (v) => {
      if (s.data.roomCode) this.error("ALREADY_JOINED");
      const r = this.room(v.roomCode);
      const role = v.role ?? (r.mode === "PVP" && r.players.some((p) => !p) ? "player" : "spectator");
      if (role === "spectator") {
        if (r.spectator) this.error("SPECTATOR_FULL");
        r.spectator = this.player(v.nickname ?? "觀眾");
        return this.bindObserver(s, r, r.spectator);
      }
      if (r.mode !== "PVP" || r.phase !== "LOBBY") this.error("JOIN_CLOSED");
      const free = r.players.findIndex((p) => !p);
      if (free < 0) this.error("PLAYER_FULL");
      const p = this.player(v.nickname);
      r.players[free] = p;
      return this.bind(s, r, p);
    });
    this.ack(s, "room:resume", (v) => {
      const r = this.room(v.roomCode),
        p = r.players.find((p) => p?.token === v.playerToken);
      if (p) {
        const result = this.bind(s, r, p);
        if (r.phase === "SOLO_DRAFT" && this.available(p)) p.ready = true;
        return result;
      }
      if (r.spectator && r.spectator.token === v.playerToken) {
        return this.bindObserver(s, r, r.spectator);
      }
      return this.error("INVALID_TOKEN");
    });
    this.ack(s, "room:seat", (v) => {
      const r = this.room(s.data.roomCode);
      if (r.mode !== "PVP" || !["LOBBY", "DRAFT_COUNTDOWN"].includes(r.phase)) this.error("SEAT_LOCKED");
      const from = r.players.findIndex((p) => p?.socket === s);
      const p = from >= 0 ? r.players[from]! : r.spectator?.socket === s ? r.spectator : null;
      if (!p || !["red", "blue", "spectator"].includes(v.seat)) this.error("INVALID_SEAT");
      const to = v.seat === "spectator" ? -1 : v.seat === "red" ? 0 : 1;
      const other = to < 0 ? r.spectator : r.players[to];
      if (other === p) return from < 0 ? this.bindObserver(s, r, p!) : this.credentials(r, p!);
      if (from < 0) r.spectator = other; else r.players[from] = other;
      if (to < 0) r.spectator = p; else r.players[to] = p;
      r.phase = "LOBBY";
      for (const member of [p, other]) if (member) {
        member.ready = false; member.generation++;
        member.controller?.socket?.disconnect(true); member.controller = null; member.code = undefined;
        if (member.socket) {
          const identity = member === r.spectator ? this.bindObserver(member.socket, r, member) : this.bind(member.socket, r, member);
          member.socket.emit("player:identity", identity);
        }
      }
      return p === r.spectator ? { ...this.observerCredentials(r, p!) } : this.credentials(r, p!);
    });
    this.ack(s, "room:leave", () => {
      const r = this.room(s.data.roomCode);
      if (r.spectator?.socket === s) r.spectator = null;
      else {
        const { p, i } = this.identity(s);
        if (r.mode === "PVE") this.finishRun(r, "quit");
        if (["PLAYING", "OVERTIME", "COUNTDOWN"].includes(r.phase))
          this.pause(r);
        p.socket = null;
        p.controller?.socket?.disconnect(true);
        p.controller = null;
        if (["LOBBY","DRAFT_COUNTDOWN"].includes(r.phase)) { r.players[i] = null; r.phase = "LOBBY"; }
      }
      delete s.data.roomCode;
      this.publish(r);
      return {};
    });
    this.ack(s, "room:assign", (v) => {
      const r = this.host(s, v);
      if (
        r.mode !== "PVP" ||
        !["LOBBY", "RESULT"].includes(r.phase) ||
        v.seat !== "blue" ||
        v.action !== "vacate"
      )
        this.error("ASSIGN_NOT_ALLOWED");
      const p = r.players[1];
      if (p) {
        p.socket?.emit("room:closed", { reason: "房主釋放藍方席位" });
        p.controller?.socket?.disconnect(true);
        p.socket?.disconnect(true);
        p.token = token();
        p.generation++;
      }
      r.players[1] = null;
      return {};
    });
    this.ack(s, "player:source", (v) => {
      const { r, p, i } = this.identity(s);
      if (!["LOBBY", "CONFIG", "READY", "PAUSED", "RESULT"].includes(r.phase))
        this.error("PAUSE_REQUIRED");
      if (!["keyboard", "recognizer"].includes(v.source))
        this.error("INVALID_SOURCE");
      p.source = v.source;
      p.generation++;
      p.seq = -1;
      p.ready = false;
      r.core?.actors[i].input.reset();
      if (r.run && !r.run.sourceHistory.includes(p.source))
        r.run.sourceHistory.push(p.source);
      this.context(r);
      return { generation: p.generation };
    });
    this.ack(s, "player:ready", (v) => {
      const { r, p } = this.identity(s);
      if (!["LOBBY", "DRAFT_COUNTDOWN", "CONFIG", "READY", "PAUSED", "RESULT"].includes(r.phase)) this.error("READY_LOCKED");
      if (v.ready && !this.available(p)) this.error("CONTROLLER_NOT_READY");
      p.ready = !!v.ready;
      if (r.mode === "PVP" && r.players.every((p) => p?.ready && this.available(p))) {
        if (r.phase === "LOBBY") { r.phase = "DRAFT_COUNTDOWN"; r.countdownEnd = this.now() + 5000; }
        else if (r.phase === "READY") { this.newCore(r); this.countdown(r); }
        else if (r.phase === "PAUSED") this.countdown(r, true);
      }
      return {};
    });
    this.ack(s, "controller:code", (v) => {
      const { r, p } = this.identity(s);
      if (p.controller && !v.replace)
        this.error("REPLACE_CONFIRMATION_REQUIRED");
      if (v.replace) {
        p.controller?.socket?.disconnect(true);
        p.controller = null;
        p.generation++;
      }
      let pairCode: string;
      do { pairCode = randomInt(0, 1000000).toString().padStart(6, "0"); }
      while ([...this.rooms.values()].some(room => room.players.some(player => player && player.code && player.code.value === pairCode && player.code.end > this.now())));
      p.code = {
        value: pairCode,
        end: this.now() + 120000,
      };
      return {
        pairCode: p.code.value,
        expiresIn: 120,
        generation: p.generation,
      };
    });
    this.ack(s, "controller:unbind", () => {
      const { r, p, i } = this.identity(s);
      p.controller?.socket?.disconnect(true);
      p.controller = null;
      p.code = undefined;
      p.generation++;
      p.ready = false;
      r.core?.actors[i].input.reset();
      if (p.source === "recognizer") this.pause(r);
      return {};
    });
    this.ack(s, "draft:start", (v) => {
      const r = this.host(s, v);
      if (r.mode !== "PVP" || r.phase !== "LOBBY" || !r.players.every((p) => p))
        this.error("DRAFT_NOT_READY");
      this.beginDraft(r);
      return {};
    });
    this.ack(s, "draft:pick", (v) => {
      const { r, p, i } = this.identity(s);
      if (r.phase !== "DRAFT" || r.draftOrder[r.draftIndex] !== i)
        this.error("NOT_YOUR_TURN");
      this.pickDraft(r, i, v.skillId);
      return {};
    });
    this.ack(s, "player:pause", () => { const { r } = this.identity(s); this.pause(r); for (const p of r.players) if(p) p.ready=false; return {}; });
    this.ack(s, "player:next", () => {
      const { r } = this.identity(s);
      if (r.mode !== "PVP" || r.phase !== "RESULT") this.error("NOT_RESULT");
      r.phase = "LOBBY"; r.core = null; r.matchId = null;
      for (const p of r.players) if (p) { p.ready = false; p.loadout = {}; }
      this.context(r); return {};
    });
    this.ack(s, "solo:select", () => {
      const {r,p} = this.identity(s);
      if (r.mode === "PVP" || !["CONFIG","RESULT","PAUSED"].includes(r.phase)) this.error("CONFIG_LOCKED");
      if (r.mode === "PVE" && r.run && !r.run.result) this.error("RUN_CONFIG_LOCKED");
      if (!p.ready || !this.available(p)) this.error("PLAYERS_NOT_READY");
      r.core = null; r.matchId = null; p.loadout = {}; r.phase = "SOLO_DRAFT";
      r.draftIndex = 0; r.draftDeadline = this.now() + 30000;
      this.context(r); return {};
    });
    this.ack(s, "solo:pick", (v) => {
      const {r,p} = this.identity(s);
      if (r.mode === "PVP" || r.phase !== "SOLO_DRAFT") this.error("NOT_SELECTING");
      if (!p.ready || !this.available(p)) this.error("PLAYERS_NOT_READY");
      this.pickSolo(r,v.skillId); return {};
    });
    this.ack(s, "solo:configure", (v) => {
      const { r, p } = this.identity(s);
      if (r.mode === "PVP" || !["CONFIG", "PAUSED", "RESULT"].includes(r.phase))
        this.error("CONFIG_LOCKED");
      if (r.mode === "PVE" && r.run && !r.run.result)
        this.error("RUN_CONFIG_LOCKED");
      if (!validLoadout(v.loadout)) this.error("INVALID_LOADOUT");
      p.loadout = { ...v.loadout };
      if (r.mode === "PRACTICE") {
        if (!["stand", "block", "crouch", "jump"].includes(v.dummy ?? "stand"))
          this.error("INVALID_DUMMY");
        const x = Number(v.dummyX ?? 1440);
        if (
          !Number.isFinite(x) ||
          x < 128 ||
          x > 1792 ||
          Math.abs(x - 480) < 64
        )
          this.error("INVALID_POSITION");
        r.config = {
          aids: {
            infiniteQi: !!v.aids?.infiniteQi,
            noCooldown: !!v.aids?.noCooldown,
            unlock: !!v.aids?.unlock,
            immortal: !!v.aids?.immortal,
          },
          dummy: v.dummy ?? "stand",
          dummyX: x,
        };
        this.newCore(r);
        r.phase = "CONFIG";
      }
      return {};
    });
    this.ack(s, "match:start", (v) => {
      const r = this.host(s, v);
      if (r.mode === "PVP" && r.phase === "COUNTDOWN" && r.core) return {};
      if (r.mode !== "PVP" || r.phase !== "READY") this.error("NOT_READY");
      this.checkReady(r);
      this.newCore(r);
      this.countdown(r);
      return {};
    });
    for (const event of ["match:pause", "practice:pause"])
      this.ack(s, event, (v) => {
        const r = this.host(s, v);
        this.pause(r);
        return {};
      });
    for (const event of ["match:resume", "practice:resume"])
      this.ack(s, event, (v) => {
        const r = this.host(s, v);
        if (r.phase !== "PAUSED") this.error("NOT_PAUSED");
        this.checkReady(r);
        const previous = r.previous;
        if (["COUNTDOWN", "INTERMISSION"].includes(previous)) {
          r.phase = previous;
          r.countdownEnd = this.now() + r.countdownEnd;
        } else this.countdown(r, true);
        this.context(r);
        return {};
      });
    this.ack(s, "match:rematch", (v) => {
      const r = this.host(s, v);
      if (r.mode !== "PVP" || r.phase !== "RESULT") this.error("NOT_RESULT");
      this.checkReady(r);
      const reveal = r.core!.actors.map((a) => a.revealed);
      this.newCore(r);
      r.core!.actors.forEach((a, i) => (a.revealed = reveal[i]));
      this.countdown(r);
      return {};
    });
    this.ack(s, "match:next", (v) => {
      const r = this.host(s, v);
      if (r.mode !== "PVP" || r.phase !== "RESULT") this.error("NOT_RESULT");
      r.phase = "LOBBY";
      r.core = null;
      r.matchId = null;
      for (const p of r.players)
        if (p) {
          p.ready = false;
          p.loadout = {};
        }
      this.context(r);
      return {};
    });
    this.ack(s, "match:forfeit", (v) => {
      const r = this.host(s, v);
      if (
        r.phase !== "PAUSED" ||
        this.now() - r.pauseAt < 30000 ||
        ![0, 1].includes(v.player) ||
        typeof v.reason !== "string"
      )
        this.error("FORFEIT_NOT_ALLOWED");
      if (r.mode === "PVE") this.finishRun(r, "disconnect");
      else {
        r.core!.result = { winner: 1 - v.player, reason: "forfeit" };
        r.phase = "RESULT";
      }
      return {};
    });
    for (const event of ["practice:start", "practice:reset"])
      this.ack(s, event, () => {
        const { r } = this.identity(s);
        if (r.mode !== "PRACTICE") this.error("WRONG_MODE");
        this.checkReady(r);
        this.newCore(r);
        this.countdown(r);
        return {};
      });
    this.ack(s, "practice:stats-reset", () => {
      const { r } = this.identity(s);
      if (r.mode !== "PRACTICE") this.error("WRONG_MODE");
      r.core!.clearStats();
      return {};
    });
    this.ack(s, "pve:start", () => {
      const { r, p } = this.identity(s);
      if (r.mode !== "PVE" || (r.run && !r.run.result))
        this.error("RUN_ACTIVE");
      this.checkReady(r);
      r.run = {
        id: randomUUID(),
        seed: randomInt(1, 2147483647),
        round: 1,
        defeated: 0,
        ticks: 0,
        sourceHistory: [p.source],
      };
      if (p.controller?.source === "simulated")
        r.run.sourceHistory.push("simulated");
      this.newCore(r);
      this.countdown(r);
      return { runId: r.run.id };
    });
    this.ack(s, "pve:quit", () => {
      const { r } = this.identity(s);
      if (r.mode !== "PVE") this.error("WRONG_MODE");
      this.finishRun(r, "quit");
      return {};
    });
    this.ack(s, "leaderboard:list", (v) => ({
      results: this.repo.list(
        v.rulesVersion ?? RULES_VERSION,
        v.aiVersion ?? AI_VERSION,
        Number.isSafeInteger(v.offset) ? v.offset : 0,
        Number.isSafeInteger(v.limit) ? v.limit : 100,
        v.eligible !== false,
      ),
    }));
    s.on("input:state", (v, cb) => this.input(s, v, cb, false));
    s.on("client:heartbeat", () => {
      try {
        const r = this.room(s.data.roomCode);
        for (const p of r.players)
          if (p?.socket === s) p.heartbeat = this.now();
        if (r.spectator?.socket === s) r.spectator.heartbeat = this.now();
      } catch {}
    });
    s.on("disconnect", () => this.disconnect(s, false));
  }
  available(p: Player) {
    return (
      !!p.socket &&
      (p.source === "keyboard" ||
        !!(p.controller?.socket && p.controller.available))
    );
  }
  checkReady(r: Room) {
    if (r.mode === "PVP" && r.players.some((p) => !p)) this.error("PLAYERS_NOT_READY");
    if (
      !r.players
        .filter(Boolean)
        .every(
          (p) => p!.ready && this.available(p!) && validLoadout(p!.loadout),
        )
    )
      this.error("PLAYERS_NOT_READY");
  }
  attachController(s: Socket) {
    s.on("camera:frame", (v) => this.camera(s, v, true));
    this.ack(s, "controller:pair", (v) => {
      if (s.data.roomCode) this.error("ALREADY_JOINED");
      const ip = s.id;
      const attempt = this.pairAttempts.get(ip);
      if (!attempt || this.now() - attempt.start >= 60000)
        this.pairAttempts.set(ip, { start: this.now(), count: 1 });
      else if (++attempt.count > 5) this.error("PAIR_RATE_LIMIT");
      if (v.protocolVersion !== 1) this.error("PROTOCOL_VERSION");
      if (!["recognizer", "simulated"].includes(v.source))
        this.error("INVALID_SOURCE");
      if (v.source === "simulated" && !this.internal)
        this.error("INTERNAL_MODE_REQUIRED");
      if (typeof v.pairCode !== "string" || !/^\d{6}$/.test(v.pairCode)) this.error("INVALID_PAIR_CODE");
      const matches = !v.roomCode ? [...this.rooms.values()].filter(room => room.players.some(player => player && player.code && player.code.value === v.pairCode && player.code.end > this.now())) : [];
      if (!v.roomCode && matches.length !== 1) this.error("INVALID_PAIR_CODE");
      const r = v.roomCode ? this.room(v.roomCode) : matches[0],
        p = r.players.find(
          (p) =>
            p &&
            p.code &&
            p.code.value === v.pairCode &&
            p.code.end > this.now(),
        );
      if (!p) this.error("INVALID_PAIR_CODE");
      if (p!.controller) this.error("CONTROLLER_EXISTS");
      p!.code = undefined;
      p!.controller = {
        token: token(),
        session: token(),
        socket: s,
        heartbeat: this.now(),
        seq: -1,
        source: v.source,
        available:
          v.source === "simulated" ||
          (v.algorithms?.normalization === true &&
            v.algorithms?.knn === true &&
            (!v.algorithms?.filterEnabled || v.algorithms?.filter === true)),
      };
      s.data.roomCode = r.code;
      s.data.playerId = p!.id;
      s.data.session = p!.controller.session;
      this.pairAttempts.get(ip)!.count--;
      this.context(r);
      return {
        ...this.credentials(r, p!),
        playerToken: undefined,
        controllerToken: p!.controller.token,
        sessionId: p!.controller.session,
      };
    });
    this.ack(s, "controller:resume", (v) => {
      const r = this.room(v.roomCode),
        p = r.players.find((p) => p?.controller?.token === v.controllerToken);
      if (!p) this.error("INVALID_TOKEN");
      if (p!.controller!.socket !== s) p!.controller!.socket?.disconnect(true);
      p!.controller!.socket = s;
      p!.controller!.session = token();
      p!.controller!.seq = -1;
      p!.controller!.heartbeat = this.now();
      s.data.roomCode = r.code;
      s.data.playerId = p!.id;
      s.data.session = p!.controller!.session;
      const i = r.players.indexOf(p!);
      r.core?.actors[i].input.reset();
      this.context(r);
      return {
        ...this.credentials(r, p!),
        playerToken: undefined,
        controllerToken: p!.controller!.token,
        sessionId: p!.controller!.session,
      };
    });
    this.ack(s, "controller:availability", (v) => {
      const r = this.room(s.data.roomCode),
        p = r.players.find((p) => p?.controller?.socket === s);
      if (!p) this.error("INVALID_SESSION");
      p!.controller!.available =
        p!.controller!.source === "simulated" ||
        (v.normalization === true &&
          v.knn === true &&
          (!v.filterEnabled || v.filter === true));
      if (!p!.controller!.available && p!.source === "recognizer") {
        p!.ready = false;
        this.pause(r);
      }
      return {};
    });
    s.on("input:state", (v, cb) => this.input(s, v, cb, true));
    s.on("client:heartbeat", () => {
      try {
        const r = this.room(s.data.roomCode),
          p = r.players.find((p) => p?.controller?.socket === s);
        if (p) p.controller!.heartbeat = this.now();
      } catch {}
    });
    s.on("disconnect", () => this.disconnect(s, true));
  }
  camera(s: Socket, v: any, controller: boolean) {
    try {
      const now = this.now();
      if (now - (s.data.cameraAttemptAt ?? -Infinity) < 120) return;
      s.data.cameraAttemptAt = now;
      if (!validCameraFrame(v) || JSON.stringify(v).length > 56000) return;
      const r = this.room(s.data.roomCode);
      const i = r.players.findIndex(p => controller ? p?.controller?.socket === s : p?.socket === s);
      if (i < 0) return;
      const p = r.players[i]!, session = controller ? p.controller!.session : p.session;
      if (v.sessionId !== session || v.generation !== p.generation) return;
      if (controller && p.source !== "recognizer") return;
      // Prefer the recognizer's existing capture when it is supplying previews.
      if (!controller && p.controller?.socket && now - (p.controller.socket.data.cameraSentAt ?? -Infinity) < 2000) return;
      s.data.cameraSentAt = now;
      const frame = { roomCode: r.code, playerId: p.id, generation: p.generation, seat: i, image: v.image, hands: v.hands, source: controller ? "controller" : "browser" };
      for (const member of [...r.players, r.spectator]) member?.socket?.volatile.emit("camera:frame", frame);
    } catch { /* Invalid or departed senders cannot publish a preview. */ }
  }
  input(s: Socket, v: any, cb: any, controller: boolean) {
    let result: any;
    try {
      if (!validInput(v)) this.error("INVALID_INPUT");
      const r = this.room(s.data.roomCode),
        i = r.players.findIndex((p) =>
          controller ? p?.controller?.socket === s : p?.socket === s,
        );
      if (i < 0) this.error("PLAYER_REQUIRED");
      const p = r.players[i]!,
        auth = controller ? p.controller! : p;
      if (v.sessionId !== auth.session) this.error("INVALID_SESSION");
      if (v.generation !== p.generation) this.error("STALE_GENERATION");
      if (v.matchId !== r.matchId) this.error("STALE_MATCH");
      if ((p.source === "recognizer") !== controller)
        this.error("WRONG_SOURCE");
      if (controller && !p.controller!.available)
        this.error("ALGORITHMS_REQUIRED");
      if (v.seq <= auth.seq) this.error("STALE_SEQ");
      auth.seq = v.seq;
      auth.heartbeat = this.now();
      if (["PLAYING", "OVERTIME"].includes(r.phase))
        r.core!.input(i, inputLabels(v));
      result = { ok: true, seq: v.seq };
      s.emit("controller:status", {
        gesture: inputLabels(v)[0] ?? "NONE",
        commands: v.commands,
        gestures: inputLabels(v),
        seq: v.seq,
        seat: i,
        phase: r.phase,
      });
      p.socket?.emit("controller:status", {
        gesture: inputLabels(v)[0] ?? "NONE",
        commands: v.commands,
        gestures: inputLabels(v),
        seq: v.seq,
        seat: i,
        phase: r.phase,
      });
    } catch (e) {
      result = { ok: false, errorCode: (e as Error).message };
    }
    if (typeof cb === "function") cb(result);
  }
  disconnect(s: Socket, controller: boolean) {
    try {
      const r = this.room(s.data.roomCode);
      if (r.spectator?.socket === s) {
        r.spectator.socket = null;
        r.spectator.heartbeat = this.now();
      }
      for (let i = 0; i < 2; i++) {
        const p = r.players[i];
        if (!p) continue;
        if (controller && p.controller?.socket === s) {
          p.controller.socket = null;
          p.controller.heartbeat = this.now();
          if (p.source === "recognizer") {
            p.ready = false;
            r.core?.actors[i].input.reset();
            this.pause(r);
          }
        } else if (!controller && p.socket === s) {
          p.ready = false;
          p.socket = null;
          p.heartbeat = this.now();
          r.core?.actors[i].input.reset();
          this.pause(r);
        }
      }
      this.publish(r);
    } catch {}
  }
  pause(r: Room) {
    if (
      ![
        "PLAYING",
        "OVERTIME",
        "COUNTDOWN",
        "RESUME_COUNTDOWN",
        "INTERMISSION",
      ].includes(r.phase)
    )
      return;
    r.previous = r.phase;
    r.pauseAt = this.now();
    if (["COUNTDOWN", "RESUME_COUNTDOWN", "INTERMISSION"].includes(r.phase))
      r.countdownEnd = Math.max(0, r.countdownEnd - this.now());
    r.phase = "PAUSED";
    for (const a of r.core?.actors ?? []) a.input.reset();
    this.context(r);
  }
  countdown(r: Room, resume = false) {
    r.phase = resume ? "RESUME_COUNTDOWN" : "COUNTDOWN";
    r.countdownEnd = this.now() + (r.mode === "PVP" ? 5000 : 3000);
    for (const a of r.core?.actors ?? []) a.input.reset();
    this.context(r);
  }
  newCore(r: Room) {
    r.matchId = randomUUID();
    const loadouts = [
      r.players[0]!.loadout as Loadout,
      r.mode === "PVP"
        ? (r.players[1]!.loadout as Loadout)
        : r.mode === "PVE"
          ? aiLoadout(r.run!.round)
          : DEFAULT_LOADOUT,
    ];
    r.core = new GameCore(r.mode, loadouts, r.config.aids);
    if (r.mode === "PRACTICE") r.core.actors[1].x = r.config.dummyX;
    if (r.mode === "PVE")
      r.ai = new AIController(r.run!.seed + r.run!.round, r.run!.round);
    this.context(r);
  }
  advanceRound(r: Room) {
    const old = r.core!,
      p = old.actors[0];
    if (
      !old.result ||
      old.result.reason !== "defeat" ||
      p.hp <= 0 ||
      old.actors[1].hp > 0
    )
      return;
    r.run!.defeated++;
    r.run!.round++;
    r.run!.ticks += old.tick;
    const hp = Math.min(1000, p.hp + 250),
      qi = Math.min(720, p.qi + 360),
      remaining = Object.fromEntries(
        Object.entries(p.cooldowns).map(([id, end]) => [
          id,
          Math.max(0, end - old.tick),
        ]),
      ),
      elapsed = old.elapsed[0];
    this.newCore(r);
    Object.assign(r.core!.actors[0], {
      hp,
      qi,
      cooldowns: remaining,
      regenAfter: 60,
    });
    r.core!.elapsed[0] = elapsed;
    r.phase = "INTERMISSION";
    r.countdownEnd = this.now() + 5000;
    this.context(r);
  }
  finishRun(r: Room, reason: string) {
    if (!r.run || r.run.result) return;
    const p = r.players[0]!,
      run = r.run;
    const result: RunResult = {
      runId: run.id,
      playerId: p.id,
      nickname: p.nickname,
      defeated: run.defeated,
      reason,
      ticks: run.ticks + (r.core?.tick ?? 0),
      hp: r.core?.actors[0].hp ?? 0,
      rulesVersion: RULES_VERSION,
      aiVersion: AI_VERSION,
      sourceHistory: run.sourceHistory,
      eligible:
        ["death", "timeout"].includes(reason) &&
        !this.internal &&
        run.sourceHistory.every((s) => s === "recognizer"),
      internal: this.internal,
      completedAt: new Date(this.now()).toISOString(),
      seed: run.seed,
    };
    run.result = result;
    this.repo.save(result);
    r.phase = "RESULT";
    r.lastActivity = this.now();
    this.context(r);
    p.socket?.emit("pve:result", result);
  }
  tick() {
    this.wallTick++;
    for (const r of this.rooms.values()) {
      const now = this.now();
      if (r.phase === "SOLO_DRAFT") {
        const p = r.players[0]!;
        if (!this.available(p)) {
          if (p.socket || now - p.heartbeat >= 5000) { r.phase = "CONFIG"; p.ready = false; this.context(r); }
        }
        else if (p.ready && now >= r.draftDeadline) {
          const slot = (["ultimate","attack","defense","control"] as const).find(s=>!p.loadout[s]);
          const skill = Object.values(BY_ID).find(s=>s.slot===slot);
          if (skill) this.pickSolo(r,skill.id);
        }
      }
      if (r.phase === "DRAFT_COUNTDOWN") {
        if (!r.players.every((p) => p?.ready && this.available(p))) r.phase = "LOBBY";
        else if (now >= r.countdownEnd) this.beginDraft(r);
      }
      if (r.phase === "DRAFT") {
        if (!r.players.every((p) => p && this.available(p))) {
          r.phase = "LOBBY"; for (const p of r.players) if (p) { p.ready = false; p.loadout = {}; }
        } else if (now >= r.draftDeadline) {
          const i = r.draftOrder[r.draftIndex], p = r.players[i]!;
          const legal = Object.values(BY_ID).find((s) => s.slot !== "normal" && !p.loadout[s.slot] &&
            ((r.draftIndex < 2) === (s.slot === "ultimate")) &&
            (s.slot === "ultimate" || !r.players.some((p) => p && Object.values(p.loadout).includes(s.id))));
          if (legal) this.pickDraft(r, i, legal.id);
        }
      }
      if (
        r.mode !== "PVP" &&
        !r.players[0]?.socket &&
        r.phase !== "RESULT" &&
        now - (r.players[0]?.heartbeat ?? r.lastActivity) >= 30000
      ) {
        if (r.mode === "PVE") this.finishRun(r, "disconnect");
        r.phase = "RESULT";
        r.lastActivity = now;
        this.context(r);
      }
      for (const p of r.players)
        if (p) {
          // Browser timers are throttled in background tabs. Socket.IO's actual
          // transport ping detects browser loss; stale game inputs still expire.
          if (p.controller?.socket && now - p.controller.heartbeat >= 2000)
            p.controller.socket.disconnect(true);
        }
      if (r.spectator && !r.spectator.socket && now - r.spectator.heartbeat >= 30000)
        r.spectator = null;
      if (
        r.phase === "PAUSED" &&
        r.mode !== "PVP" &&
        now - r.pauseAt >= 30000
      ) {
        if (r.mode === "PVE") this.finishRun(r, "disconnect");
        else {
          r.phase = "RESULT";
          r.lastActivity = now;
        }
      }
      if (
        ["COUNTDOWN", "RESUME_COUNTDOWN", "INTERMISSION"].includes(r.phase) &&
        now >= r.countdownEnd
      ) {
        if (r.phase === "INTERMISSION") this.countdown(r);
        else {
          r.phase = r.core?.overtime ? "OVERTIME" : "PLAYING";
          for (const a of r.core!.actors) a.input.reset();
          this.context(r);
        }
      }
      if (["PLAYING", "OVERTIME"].includes(r.phase)) {
        if (r.mode === "PVE") r.ai!.step(r.core!);
        if (r.mode === "PRACTICE") {
          const c = r.core!,
            d = c.actors[1];
          if (c.tick % 6 === 0) {
            let label: any = d.input.needsNone
              ? "NONE"
              : r.config.dummy === "block"
                ? "BLOCK"
                : r.config.dummy === "crouch"
                  ? "CROUCH"
                  : r.config.dummy === "jump" &&
                      d.ground &&
                      !d.input.has("JUMP")
                    ? "JUMP"
                    : "NONE";
            c.input(1, label);
          }
        }
        const c = r.core!;
        c.step();
        if (c.overtime && r.phase !== "OVERTIME") {
          r.phase = "OVERTIME";
          this.context(r);
        }
        for (const e of c.events)
          if (e.type === "input")
            r.players[e.actor]?.socket?.emit("input:result", e);
        const publicEvents = c.events.filter((e) => e.type !== "input");
        if (publicEvents.length) {
          const event = {
            protocolVersion: 1,
            matchId: r.matchId,
            tick: c.tick,
            events: publicEvents,
          };
          for (const p of r.players) p?.socket?.emit("match:event", event);
          r.spectator?.socket?.emit("match:event", event);
        }
        if (c.result) {
          if (r.mode === "PVE") {
            if (c.actors[0].hp === 0) this.finishRun(r, "death");
            else if (c.actors[1].hp === 0) this.advanceRound(r);
            else this.finishRun(r, "timeout");
          } else {
            r.phase = "RESULT";
            r.lastActivity = now;
            this.context(r);
          }
        }
      }
      if (this.wallTick % 3 === 0) this.publish(r, "match:snapshot");
      if (r.phase === "RESULT" && now - r.lastActivity > 600000) {
        for (const p of r.players) {
          p?.socket?.disconnect(true);
          p?.controller?.socket?.disconnect(true);
        }
        r.spectator?.socket?.disconnect(true);
        this.rooms.delete(r.code);
      }
    }
  }
  state(r: Room, viewer: number | null) {
    return {
      protocolVersion: 1,
      roomId: r.id,
      roomCode: r.code,
      mode: r.mode,
      phase: r.phase,
      matchId: r.matchId,
      internal: this.internal,
      draftIndex: r.draftIndex,
      draftTurn: r.draftOrder[r.draftIndex] ?? null,
      draftSeconds: Math.max(0, Math.ceil((r.draftDeadline - this.now()) / 1000)),
      observer: r.spectator ? { nickname: r.spectator.nickname, connected: !!r.spectator.socket } : null,
      countdown: Math.max(0, Math.ceil((r.countdownEnd - this.now()) / 1000)),
      players: r.players.map((p, i) =>
        p
          ? {
              id: p.id,
              nickname: p.nickname,
              ready: p.ready,
              connected: !!p.socket,
              source: p.source,
              generation: p.generation,
              controllerConnected: !!p.controller?.socket,
              algorithmsAvailable: p.controller?.available ?? false,
              ultimatePicked: !!p.loadout.ultimate,
              loadout: {
                ...p.loadout,
                ultimate:
                  i === viewer || r.core?.actors[i].revealed
                    ? p.loadout.ultimate
                    : null,
              },
            }
          : null,
      ),
      config: r.mode === "PRACTICE" ? r.config : undefined,
      run: r.run
        ? {
            runId: r.run.id,
            round: r.run.round,
            defeated: r.run.defeated,
            result: r.run.result,
          }
        : null,
      rulesVersion: RULES_VERSION,
      aiVersion: AI_VERSION,
      snapshotSeq: ++r.snapshotSeq,
      core: r.core?.publicState(viewer),
      stats: r.mode === "PRACTICE" ? this.stats(r) : null,
    };
  }
  stats(r: Room) {
    const c = r.core!,
      hits = c?.hits ?? [],
      totals = c?.hitStats ?? {
        count: 0,
        health: 0,
        shield: 0,
        firstTick: null,
      },
      { health, shield } = totals,
      first = totals.firstTick;
    return {
      hits: hits.slice(-50),
      count: totals.count,
      health,
      shield,
      dps:
        first !== null && c.tick > first
          ? health / ((c.tick - first) / 60)
          : null,
    };
  }
  publish(r: Room, event = "room:state") {
    for (let i = 0; i < 2; i++) {
      const p = r.players[i];
      if (p?.socket) {
        const view = this.state(r, i);
        p.socket.volatile.emit(event, view);
      }
    }
    r.spectator?.socket?.volatile.emit(event, this.state(r, null));
  }
}
