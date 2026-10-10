import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export interface RunResult {
  runId: string;
  playerId: string;
  nickname: string;
  defeated: number;
  reason: string;
  ticks: number;
  hp: number;
  rulesVersion: string;
  aiVersion: string;
  sourceHistory: string[];
  eligible: boolean;
  internal: boolean;
  completedAt: string;
  seed: number;
}
export class LeaderboardRepository {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS results(runId TEXT PRIMARY KEY, rulesVersion TEXT NOT NULL, aiVersion TEXT NOT NULL, eligible INTEGER NOT NULL, defeated INTEGER NOT NULL, ticks INTEGER NOT NULL, completedAt TEXT NOT NULL, body TEXT NOT NULL)",
    );
  }
  save(r: RunResult) {
    const existing = this.db
      .prepare("SELECT body FROM results WHERE runId=?")
      .get(r.runId) as any;
    if (existing) {
      if (existing.body !== JSON.stringify(r))
        throw new Error("RESULT_CONFLICT");
      return;
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO results VALUES(?,?,?,?,?,?,?,?)")
        .run(
          r.runId,
          r.rulesVersion,
          r.aiVersion,
          +r.eligible,
          r.defeated,
          r.ticks,
          r.completedAt,
          JSON.stringify(r),
        );
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  list(rules: string, ai: string, offset = 0, limit = 100, eligible = true) {
    return this.db
      .prepare(
        "SELECT body FROM results WHERE rulesVersion=? AND aiVersion=? AND eligible=? ORDER BY defeated DESC,ticks ASC,completedAt ASC,runId ASC LIMIT ? OFFSET ?",
      )
      .all(
        rules,
        ai,
        +eligible,
        Math.min(100, Math.max(1, limit)),
        Math.max(0, offset),
      )
      .map((v: any) => JSON.parse(v.body));
  }
  all() {
    return this.db
      .prepare("SELECT body FROM results ORDER BY runId")
      .all()
      .map((v: any) => JSON.parse(v.body));
  }
  clear(rules: string, ai: string) {
    this.db
      .prepare("DELETE FROM results WHERE rulesVersion=? AND aiVersion=?")
      .run(rules, ai);
  }
  close() {
    this.db.close();
  }
}
