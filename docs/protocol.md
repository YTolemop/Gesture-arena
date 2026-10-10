# Socket.IO v1 協定

同 origin HTTP；Socket.IO path `/socket.io`。網站 namespace `/arena`，Python `/controller`。Socket.IO v4／Engine.IO v4，Python socketio 5.x。不是裸 WebSocket。

協定定義位於 `protocol/gesture_labels.json` 與 `protocol/schemas/`，TypeScript 型別位於 `packages/protocol/index.ts`。控制器由獨立專案提供；本儲存庫只交付競技場。版本 1 包含 generation，所有輸入都需符合此契約。

每個變更事件带非空 `requestId`，ACK `{requestId,ok,...}`；失败带穩定 `errorCode`。同 socket、同事件、同 requestId 的成功回覆去重；重連後需要先 resume，不應重播尚未確認的舊遊戲輸入。變更 ACK 超時可用同 requestId 重試。伺服器最多保存4096個成功请求回覆；不把持續輸入放入此佇列。

房間建立 `room:create {nickname}`，單人 `solo:create {nickname,mode: PRACTICE|PVE}`。回傳 roomCode、roomId、playerId、seat、playerToken、sessionId、generation、matchId、hostToken。加入 `room:join {roomCode,nickname?}` 自動安排空玩家席，兩席皆滿時安排觀戰；最多三人。可選的 role 保留舊協定相容性。房號不授權。

`room:seat {seat:red|blue|spectator}` 在 LOBBY／DRAFT_COUNTDOWN 由任何成員換位；已有人時原子互換，取消倒數及受影響玩家準備，撤銷控制器配對並增加 generation。ACK 與 `player:identity` 向本人提供新 seat/session；每個受影響分頁需更新保存的身分。紅藍各一人且連線、控制来源可用、兩人準備才自動開始，觀戰席可空缺。

玩家刷新以 sessionStorage 私存憑證呼叫 `room:resume {roomCode,playerToken}`。token 有效到席位撤銷、房間回收或伺服器退出；不承諾主機崩潰恢复。新 socket 撤銷舊 socket、建立新 sessionId、重置 seq及輸入；觀眾不能用暱稱恢復。房主憑證在本次程序有效，不自動轉移；房主失聯時保留其席位及管理權，30秒後可由原房主重連處理，沒有把權限給觀眾的路徑。

`player:source {source:keyboard|recognizer}` 僅本人在 LOBBY/CONFIG/READY/PAUSED/RESULT 設定。原子增加 generation、清除輸入、取消準備，旧来源立即拒绝。暫停切換不重置資源、冷卻、局時或runId。正式預設 recognizer，鍵盤仍可用。

`controller:code {replace?:boolean}` 僅本人；6位字串、120秒、一次性，活躍配對碼在全主機唯一；已有控制器需明確 replace。`controller:pair {protocolVersion:1,roomCode?,pairCode,source:recognizer|simulated,algorithms:{normalization,knn,filterEnabled,filter}}`。房碼省略或空字串時以配對碼定位唯一有效玩家，無匹配／歧義／已使用均拒絕；提供房码時仍限定該房。ACK回傳內部roomCode，Python保存供重連使用。source simulated 只在主機 internal flag 開啟時接受。`controller:resume {roomCode,controllerToken}` 產生新session；token≥192bit熵，與玩家／房主分離。`controller:availability` 更新必要接口狀態。未填TODO無法正式準備，未啟用濾波不影響。

`input:state {protocolVersion:1,sessionId,matchId,seq,generation,gesture}`。seq是非負安全整數嚴格遞增；版本、session、socket、match、generation、來源錯誤不刷新輸入活性。未知欄位拒絕，最大2048位元組（上限以JSON文字長度另配Socket.IO8192bytes限制）。`matchId=null` 準備區只顯示输入測試，不進核心。新局、跨關、重置獨立matchId；倒數／暂停不施法、不武裝。開始后先收到NONE，再6個戰鬥tick重武裝一次性動作。输入過期30tick轉NONE；心跳不維持舊標籤。

`controller:context` 主動推送 roomId、roomCode、matchId、phase、mode、runId、roundIndex、generation、source、sessionId、版本；不傳配置。Python換context清輸出與濾波，不積壓舊輸入。辨識器 `client:heartbeat` 每0.5秒，2秒無心跳斷開並暫停必要來源；網站連線採 Socket.IO pingInterval 1秒／pingTimeout 5秒，避免背景分頁計時器降速誤判。舊遊戲輸入仍在30tick解除。PVP重連由雙方重新準備，自動5秒倒數；單人恢復3秒倒數。PVE失聯30秒結束未完成；觀眾／未選控制器不暫停。

PVP：雙方 `player:ready {ready:true}` → DRAFT_COUNTDOWN 5秒 → DRAFT。ABBAABBA 的 A 固定紅方，順序紅藍藍紅紅藍藍紅。`draft:pick {skillId}` 每手30秒，逾時伺服器自選合法技能；前2手大招可同，後6手普通技能禁重複且每類各一。8手完成自動5秒倒數開戰。`player:pause` 由任一玩家暫停；雙方重新準備自動恢復。`player:next` 在結果回到等待室重新選技。舊 hostToken 管理事件保留相容性，網站不再要求房主操作。隱藏大招僅本人可見，公開投影以 ultimatePicked 表示已鎖定；首次接受施放後揭露。

單人：外面設定來源、假人及練習輔助，確認準備後 `solo:configure {loadout,aids?,dummy?,dummyX?}` 保存設定，再 `solo:select` 進 SOLO_DRAFT。`solo:pick {skillId}` 每類一招、每手30秒逾時自選，四招完整後自動3秒倒數開局；練習保留全局輔助，一命連戰建立新runId並鎖定配置。選技狀態由伺服器保存，短暫刷新可續選；失聯5秒或必要控制器不可用取消選技，回準備。配置只可設定／暫停／結果，PVE整次鎖定。旧 `practice:start/reset` 與 `pve:start` 保留相容性；`practice:pause/resume`需本房hostToken；`practice:stats-reset`只清統計；`pve:quit` 冪等未完成。新關context主動發送。

`room:state` 用於 ACK 後及連線變更的即時狀態；`match:snapshot` 每3個固定tick廣播一次（20Hz）。兩者使用相同完整 RoomState 可見性投影；接收端必須監聽兩種事件。每次投影包含同步序號、階段、公開人物／物件／預警、生命氣量冷卻與本人配置。不要依賴兩種 volatile 事件成對抵達。PVE結果由 `pve:result`送本人。持續輸入無需逐包等待ACK；`input:result` 提供接受／拒絕原因。

`room:assign {hostToken,seat:blue,action:vacate}` 為舊管理接口。`room:leave` 為本人退出並撤銷其token與控制器；等待室紅方離開不關閉其他成員所在房間。失聯不等於明確退出。

`leaderboard:list {rulesVersion?,aiVersion?,offset?,limit?,eligible?}`公開唯讀，分頁最多100；HTTP `/api/leaderboard`同樣。沒有提供任何客户端寫分／清榜接口，維護只由私有主機CLI操作，因此一般房主無法清全主機榜。

主要錯誤碼：ROOM_NOT_FOUND / ROOM_CAPACITY / PLAYER_FULL / SPECTATOR_FULL / JOIN_CLOSED / ALREADY_JOINED / INVALID_NICKNAME / PLAYER_REQUIRED / HOST_REQUIRED / INVALID_TOKEN / INVALID_SESSION / INVALID_INPUT / PROTOCOL_VERSION / STALE_MATCH / STALE_GENERATION / STALE_SEQ / WRONG_SOURCE / INVALID_PAIR_CODE / PAIR_RATE_LIMIT / INTERNAL_MODE_REQUIRED / CONTROLLER_EXISTS / CONTROLLER_NOT_READY / ALGORITHMS_REQUIRED / PLAYERS_NOT_READY / NOT_YOUR_TURN / WRONG_SLOT / SLOT_FILLED / SKILL_TAKEN / CONFIG_LOCKED / RUN_CONFIG_LOCKED / INVALID_LOADOUT / INVALID_POSITION / PAUSE_REQUIRED / NOT_PAUSED / NOT_RESULT / FORFEIT_NOT_ALLOWED。
