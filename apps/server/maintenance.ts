import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { LeaderboardRepository, RunResult } from "./leaderboard.js";
const repo = new LeaderboardRepository(
  join(
    process.env.ARENA_DATA_DIR ?? join(homedir(), ".gesture-arena"),
    "leaderboard.sqlite",
  ),
);
const [action, path, rules, ai, confirm] = process.argv.slice(2);
try {
  if (action === "export" || action === "backup") {
    if (!path) throw new Error("需要輸出路徑");
    const data = repo.all();
    writeFileSync(
      path,
      path.endsWith(".csv")
        ? "runId,nickname,defeated,ticks,reason,eligible\n" +
            data
              .map((r) =>
                [r.runId, r.nickname, r.defeated, r.ticks, r.reason, r.eligible]
                  .map((v) => '"' + String(v).replaceAll('"', '""') + '"')
                  .join(","),
              )
              .join("\n")
        : JSON.stringify(data, null, 2),
    );
    console.log(`匯出 ${data.length} 筆`);
  } else if (action === "import") {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(data)) throw new Error("必須是JSON陣列");
    for (const r of data) {
      if (
        !r ||
        typeof r.runId !== "string" ||
        typeof r.nickname !== "string" ||
        !Number.isSafeInteger(r.defeated) ||
        !Number.isSafeInteger(r.ticks) ||
        r.defeated < 0 ||
        r.ticks < 0 ||
        typeof r.rulesVersion !== "string" ||
        typeof r.aiVersion !== "string" ||
        typeof r.eligible !== "boolean" ||
        !Array.isArray(r.sourceHistory)
      )
        throw new Error("無效結果");
    }
    repo.db.exec("BEGIN IMMEDIATE");
    try {
      for (const r of data) {
        const existing = repo.db
          .prepare("SELECT body FROM results WHERE runId=?")
          .get(r.runId) as any;
        if (existing && existing.body !== JSON.stringify(r))
          throw new Error("RESULT_CONFLICT");
        if (!existing)
          repo.db
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
      }
      repo.db.exec("COMMIT");
    } catch (e) {
      repo.db.exec("ROLLBACK");
      throw e;
    }
    console.log(`驗證匯入 ${data.length} 筆`);
  } else if (action === "clear") {
    if (!path || !rules || ai !== "--confirm")
      throw new Error(
        "清榜：maintenance clear RULES_VERSION AI_VERSION --confirm",
      );
    repo.clear(path, rules);
    console.log("已清除指定版本榜單");
  } else
    throw new Error(
      "maintenance export|backup|import PATH；clear RULES AI --confirm",
    );
} finally {
  repo.close();
}
