# 架設與維護

## 交接給主機管理者

1. 安裝 Node.js 22.19.0 x64（npm 10.9.3），下載或 clone 此儲存庫。
2. 在根目錄執行 `npm ci` 與 `npm run build`；Windows 可執行 `setup_windows.bat`。
3. 複製 `.env.example` 為 `.env`，確認 PORT、MAX_ROOMS 及排行榜資料夾。正式環境保持 ENABLE_INTERNAL_TEST_MODE=false。
4. 執行 `npm start` 或 Windows 的 `start_windows.bat`，主機開啟 http://localhost:3000 。
5. 確認主機實體網卡的區網 IP，放行所選 TCP 埠，其他電腦使用該 IP 連入。0.0.0.0 是監聽位址；其他電腦不能使用 localhost 連到主機。
6. 從另一台電腦確認網站可開啟、加入房間及鍵盤操作。手勢辨識器需由另一個專案提供，伺服器包不需要安裝 Python。

目前為單程序部署；房間保存在記憶體中。不要用多個程序共用同一服務網址；程序重啟後，進行中的房間會消失。若使用服務管理器，請設定根目錄為工作目錄，讓 `.env` 與 `dist/web` 可以正確讀取。透過反向代理架設時需轉送 HTTP 及 Socket.IO 的 WebSocket 升級連線。

## 排行榜備份與還原

資料預設保存在使用者主目錄 `.gesture-arena/leaderboard.sqlite`，可用 ARENA_DATA_DIR 指定私有資料夾。維護指令在根目錄執行，沿用同一份 `.env`：

```sh
npx tsx apps/server/maintenance.ts backup ./leaderboard-backup.json
npx tsx apps/server/maintenance.ts export ./leaderboard-export.csv
npx tsx apps/server/maintenance.ts import ./leaderboard-backup.json
```

將備份移到私有備份位置，不要提交到儲存庫。若需要清除特定版本排行榜，先備份，再由主機管理者執行：

```sh
npx tsx apps/server/maintenance.ts clear numeric-v2-2026-10-08 ai-v1 --confirm
```

清除指令會刪除指定版本成績。網站及房主沒有清除全機排行榜的 API。資料容量達 DATA_WARNING_MB 時，`/health` 顯示 `storage.warning=true`，主機會顯示告警；系統不自動刪除成績。

## 常見問題

- 缺少建置：先執行 `npm run build`。
- 連接埠被占用：停止占用程序或修改 `.env` 的 PORT，再更新玩家網址。
- 其他電腦無法連入：確認同一區網、實體網卡 IP、防火牆及 HOST=0.0.0.0。
- Node SQLite 警告：固定版本的 node:sqlite 會顯示 experimental 警告。
- 關閉主機：終端按 Ctrl+C；下次啟動需重新建立房間。
