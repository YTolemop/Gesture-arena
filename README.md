# Gesture Arena 競技場伺服器

此儲存庫供主機架設與交接，包含競技場網站、Socket.IO 伺服器、遊戲核心及 SQLite 排行榜。支援 PVP、觀戰、技能圖鑑、練習與 PVE 一命連戰。

不包含學員包或 Python 手勢辨識器。網站可直接使用鍵盤；使用手勢時需另外提供相容的辨識器。

## 安裝與啟動

使用 **Node.js 22.19.0 x64 / npm 10.9.3**，在此儲存庫根目錄執行：

```sh
npm ci
npm run build
npm start
```

Windows 也可雙擊 `setup_windows.bat`，完成後雙擊 `start_windows.bat`。安裝紀錄在 `logs/setup.log`。Windows 與 Linux 都使用相同的 npm 指令；啟動目錄必須是專案根目錄。

主機開啟 http://localhost:3000 。其他電腦使用主機的區網 IP，例如 http://192.168.1.100:3000 。安裝套件需要外網；安裝及建置完成後，網站資源均由主機提供。

## 主機設定

複製 `.env.example` 為 `.env`，按需要修改：

| 設定 | 預設值 | 用途 |
| --- | --- | --- |
| HOST | 0.0.0.0 | 監聽所有網卡 |
| PORT | 3000 | 網站及 Socket.IO 使用同一 TCP 埠 |
| ARENA_NAME | 手勢競技場 | 主機名稱 |
| MAX_ROOMS | 32 | 房間數量上限，實際容量需依主機評估 |
| ENABLE_INTERNAL_TEST_MODE | false | 正式架設保持 false |
| ARENA_DATA_DIR | 使用者主目錄下的 .gesture-arena | 私有排行榜資料夾，可指定絕對路徑 |
| DATA_WARNING_MB | 512 | SQLite 含 WAL 容量告警門檻 |

在 Windows 防火牆放行所選 TCP 埠的私人網路入站。先從另一台電腦開啟網站確認連線。`GET /health` 提供程序狀態、版本、容量及資料庫告警。

完整架設與維護步驟見 [部署說明](docs/hosting_local.md)。

## 使用

PVP：建立房間後，其他玩家輸入房號加入；紅／藍玩家各自選擇輸入來源並準備，雙方就緒後自動倒數選技與開戰。房內最多兩位玩家與一位觀眾，觀戰頁可移到外接螢幕全螢幕顯示。

鍵盤：A / D / W / S / Space / J / K / L / U / I，網站顯示對應操作。手勢辨識器透過主機網址與本人一次性配對碼連線，協定見 [通訊協定](docs/protocol.md)。

排行榜預設保存在主機使用者的 `.gesture-arena/leaderboard.sqlite`，不放入 Git。重新啟動會中止正在進行的對局，已保存的排行榜仍保留。正式榜只收符合手勢來源規則的結果，鍵盤與混合來源另存。

## PVP 與 PVE 連線操作

### PVP 連線（雙人對戰）

房號為六位純數字，例如 `123456`；下方指令的房號是示範，請以網站實際產生的房號為準。

1. 開啟[遊戲網站](https://ga-game.codpy.org/)，由一位玩家選擇 PVP「雙人對決」建立房間，將網站顯示的房號提供給另一位玩家。
2. 另一位玩家在網站輸入相同房號，按「加入房間」。紅、藍兩席各一位玩家；第三人可觀戰，觀戰席不必啟動辨識器。
3. 使用手勢的玩家各自在自己的網頁選擇控制來源「手勢辨識器」，按「產生配對碼」，並在自己的電腦執行下方指令。兩位玩家使用相同房號，但必須使用各自的六位數配對碼：

```powershell
.\.venv\Scripts\python.exe main.py run --server "https://ga-game.codpy.org" --room "123456" --pair-code "012345" --model models/model.npz
```

4. 將 `123456` 換成網站顯示的實際房號、`012345` 換成自己網頁產生的配對碼，保留配對碼開頭的零。看到 `Paired` 後回網站按「確認準備」；雙方就緒後自動倒數進入選技，選完後開戰。

房號供朋友加入同一場對戰；配對碼用來連接自己席位的 Python 辨識器，請勿共用對方的配對碼。Python 的 `--room` 可選填，省略時也能透過自己的配對碼找到席位。選擇「網站鍵盤」的玩家不需要啟動 Python 或取得配對碼，仍須按「確認準備」。雙方可以分別使用手勢或鍵盤。

macOS／Linux 將指令開頭換成 `./.venv/bin/python`；已啟用虛擬環境時可使用 `python`。網址不用加 `/controller`；配對碼過期或斷線後，請重新產生配對碼並啟動辨識器。離開房間後若要再玩，請重新加入或建立房間並配對。

### PVE 連線（不需要房號）

1. 開啟[遊戲網站](https://ga-game.codpy.org/)，選擇 PVE「一命連戰」。
2. 控制來源選擇「手勢辨識器」，按「產生配對碼」。
3. 在含有 `main.py` 的 Demo 或 initial 專案資料夾啟動辨識，將下方 `012345` 換成網站當下顯示的六位數配對碼：

```powershell
.\.venv\Scripts\python.exe main.py run --server "https://ga-game.codpy.org" --pair-code "012345" --model models/model.npz
```

4. 看到 `Paired` 後回到網站確認準備、選擇技能，倒數後開始挑戰。按「結束挑戰」會保存進行中挑戰的未完成紀錄、離開房間並回到首頁；再次遊玩需重新產生配對碼並啟動辨識器。

配對碼用來連接自己的 Python 辨識器，並非雙人邀請碼；保留開頭的零，PVE 不必加 `--room`。配對碼過期或斷線後，請重新產生。網址不用加 `/controller`。macOS／Linux 將指令開頭換成 `./.venv/bin/python`；已啟用虛擬環境時可使用 `python`。initial 需先完成自己的辨識實作並訓練模型，Demo 可使用隨附的模型。

`run` 會自動將鏡頭影像與手部骨架送到網站，無須加 `--preview`；加上 `--preview` 會另外開啟本機關節視窗。若有多支鏡頭，加上 `--camera 1` 選擇另一支。

### 指令反應與技能冷卻

辨識每幀更新；指令改變（包含回到 `NONE`）會立即傳送，相同狀態約每秒補送 10 次。傳送不會等待伺服器回覆後才繼續辨識；終端機的 `fps` 顯示目前實際處理影格數。

戰鬥畫面在氣條下方橫排顯示攻擊、防禦、控制及大招四個技能，以時鐘圓環和剩餘秒數顯示冷卻，鏡頭位於技能列下方。冷卻依伺服器遊戲時間顯示，暫停時不會繼續倒數；對手尚未公開的大招維持隱藏。

畫面下方的「收到」顯示伺服器接收的指令；「上次動作」顯示執行結果。未開戰、需要先回中立、硬直、冷卻、氣量不足或大招尚未解鎖時，會顯示對應原因。跳躍、普攻與技能仍需離開該手勢至少 0.1 秒才能再次觸發；持續保持同一手勢不會連發。

## 檔案

- `apps/server/`：HTTP、Socket.IO、房間與排行榜維護。
- `apps/web/`：競技場網站、戰鬥畫面與美術資源。
- `packages/game-core/`：技能數值、戰鬥、碰撞、輸入及 AI。
- `packages/protocol/`、`protocol/`：型別、手勢標籤與 JSON Schema。
- `docs/`：部署、協定與遊戲核心說明。

`npm run build` 產生 `dist/web/`；啟動時仍需要原始碼及 npm 依賴。`node_modules/`、建置產物、`.env` 與資料庫不會上傳。

## 三通道手勢輸入

辨識器可在 `input:state.commands` 同時提供 `left`、`right`、`both`。左右手各送一個指令；雙手合成指令獨占輸入。完整欄位、衝突處理及相容性見 [協定文件](docs/protocol.md)。舊版單一 `gesture` 輸入仍可使用。

`node --import tsx --test tests/*.test.ts` 執行協定、遊戲核心、配對與 Socket.IO 整合測試。`npm run build` 執行型別檢查與網站建置。
