# 架設與維護

## 交接給主機管理者

1. 下載或 clone 此儲存庫，ZIP 必須先完整解壓縮。Windows 10／11 x64 可直接雙擊 `setup_windows.bat`，會下載並校驗專案內的 Node.js 22.19.0 x64（npm 10.9.3）、安裝套件及建置，不需要先安裝 Node.js 或 Python。
2. 手動架設則先安裝 Node.js 22.x（至少 22.19.0），在根目錄執行 `npm ci --include=dev` 與 `npm run build`。執行時仍需原始碼與包含 tsx 的完整依賴，不能只部署 dist。
3. Windows 安裝會建立缺少的 `.env`，保留原設定；手動環境複製 `.env.example` 為 `.env`。確認 PORT、MAX_ROOMS 及排行榜資料夾。正式環境保持 ENABLE_INTERNAL_TEST_MODE=false。
4. Windows 雙擊 `start_local.bat` 或 `start_windows.bat`，每次會檢查套件、重新建置並開啟網站；保留視窗，Ctrl+C 停止。手動執行 `npm start` 時不會自動重建或開瀏覽器，主機自行開啟 http://localhost:3000 。
5. 確認主機實體網卡的區網 IP，放行所選 TCP 埠，其他電腦使用該 IP 連入。0.0.0.0 是監聽位址；其他電腦不能使用 localhost 連到主機。
6. 從另一台電腦確認網站可開啟、加入房間及鍵盤操作。手勢辨識器需由另一個專案提供，伺服器包不需要安裝 Python。

目前為單程序部署；房間保存在記憶體中。不要用多個程序共用同一服務網址；程序重啟後，進行中的房間會消失。若使用服務管理器，請設定根目錄為工作目錄，讓 `.env` 與 `dist/web` 可以正確讀取。透過反向代理架設時需轉送 HTTP 及 Socket.IO 的 WebSocket 升級連線。

## 排行榜備份與還原

資料預設保存在使用者主目錄 `.gesture-arena/leaderboard.sqlite`，可用 ARENA_DATA_DIR 指定私有資料夾。維護指令在根目錄執行，沿用同一份 `.env`：

舊版本機啟動器曾使用專案內 `.local-data/leaderboard.sqlite`；新啟動器偵測到該檔且沒有指定 ARENA_DATA_DIR 時會繼續使用。若有舊資料，請在 `.env` 明確設定 `ARENA_DATA_DIR=C:/你的路徑/Gesture-arena-main/.local-data`，讓雙擊啟動、手動啟動及維護指令使用同一份資料。優先採用絕對路徑；啟動終端會顯示實際 `data=` 位置。

Windows 沒有全域 Node.js 時，先在 PowerShell 設定本次視窗的環境，再執行下方維護指令：

```powershell
$env:Path = (Join-Path (Get-Location) '.local\node-v22.19.0-win-x64') + ';' + $env:Path
```

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
- 安裝失敗：查看 `logs/setup.log`，確認能連到 nodejs.org 與 npm 套件來源，再重跑 `setup_windows.bat`。若提示執行環境不完整，先關閉伺服器，將 `.local` 改名留存後重新安裝。
- 本機與公開網站看起來不同：先確認使用的是哪個網址，再下載最新版、重新安裝、建置、重啟，瀏覽器按 Ctrl+F5。啟動器只會建置目前原始碼，不會自動 git pull；GitHub 上傳也不等於已更新公開網站服務。
- 配對失敗：網頁與辨識器的 `--server` 必須指向同一個網址；本機的配對碼無法在公開伺服器使用。另一台電腦請使用主機 IP，不要填 localhost。

## 公開部署與更新

此包的雙擊入口供本機／區網架設。公開部署應使用單一服務程序，設定服務管理器在專案根目錄執行 `npm start`、開機啟動及失敗重啟；反向代理提供 HTTPS，並將網站 HTTP 與 Socket.IO（包含 WebSocket 升級）轉送到同一個伺服器埠。依網域與主機環境設定 DNS、防火牆及憑證。

更新前停止服務並備份排行榜，保留 `.env` 與資料路徑；取得 GitHub 最新原始碼後重新安裝及建置，再重啟。ZIP 更新與 Git 更新步驟見 [README](../README.md#更新與同步)。確認 `/health` 回傳 `ok: true`、網站載入正常、兩個瀏覽器能加入同房並開戰。更換服務資料夾時，請讓 ARENA_DATA_DIR 指向原有資料的絕對路徑。
