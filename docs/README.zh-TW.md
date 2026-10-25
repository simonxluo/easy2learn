# easy2learn

[简体中文](../README.md) | [English](README.en.md) | [日本語](README.ja.md) | **繁體中文**

> 一個安安靜靜跑在本機的刷題網頁。不註冊，不連網，不彈窗，
> 只做一件事：讓你舒服地把題刷完，把知識連起來。

## 它想帶給你的體驗

- **即問即答的爽快**。單選、多選、是非、問答、程式設計五種題型，送出的瞬間就告訴你對錯與緣由；程式設計題在本機編譯執行，幾秒內看到每個用例的通過情況。
- **錯過的題不會溜走**。答錯的題自動收進錯題本，隨時切換「錯題模式」單獨回顧；學習進度保存在瀏覽器裡，下次開啟，從上次停下的地方繼續。
- **知識是一張網，不是一堆散沙**。知識圖譜把每個知識點依章節鋪開、連線，點擊節點即可閱讀內容，再順著關聯一路跳下去——複習變成一次漫遊，而不是一場硬背。
- **想慢慢讀也可以**。切換到滑動閱讀，目錄在上方、卡片在下方，左右滑動或按方向鍵，像翻一本已經替你排好順序的小書。
- **身邊有一位隨叫隨到的出題人**。搭配 DeepSeek Harness 使用時，agent 能即時增刪題目、更新筆記、甚至調整介面——頁面隨之即刻刷新，學習材料永遠保持新鮮。
- **乾淨、安靜、聽你的外觀**。毛玻璃與圓角卡片的介面，淺色深色一鍵切換，可以跟隨系統，也可以跟隨心情。
- **一條命令，隨處可跑**。零依賴，純 Node 標準庫，不需要安裝任何東西。

## 三分鐘上手

```bash
node src/standalone.js        # 預設 http://127.0.0.1:8788/
node src/standalone.js 8899   # 或指定連接埠
```

瀏覽器開啟上面的地址，挑一個主題，開始刷題。

## 功能特性

- **兩種模式**：
  - **刷題模式** `/` — 單選/多選/是非/問答/程式設計題練習
  - **學習模式** `/learn.html` — 兩種可切換的檢視方式：
    - **知識圖譜**：力導向圖展示知識點網路（`web/kgraph.js` 自研引擎，零依賴；依章節著色、已學節點帶勾標、拖曳平移／滾輪或雙指縮放／拖曳節點，髒標記渲染保證收斂後互動即時重繪），**點擊節點即可在下方面板閱讀該知識點內容**，相關知識點可點擊跳轉，選取時高亮鄰邊並顯示關聯標籤；展示層經 `web/knowledge.js` 與資料解耦，問答／概念／程式碼等多形態知識各有專屬渲染器（卡片與詳情帶形態角標）
    - **滑動閱讀**：上方目錄條（章節分組 + 知識點 chip）＋下方橫向 scroll-snap 滑卡，支援觸控板／觸控滑動、方向鍵、點擊目錄跳轉
    - 圖譜資料由 `scripts/gen-graph.mjs` 從筆記產生（`data/graph.json`，經 `/api/graph` 提供）：節點＝問答卡片，邊＝章節順序鏈＋手動策劃的跨章節語意關聯
- **四類題型 + 程式設計題本機判題**：選擇、是非即時計分；問答對照參考答案自評；程式設計題寫入暫存目錄，以本機 `g++/python3/node` 編譯執行測試案例（逾時 5 秒，stdout 比對）
- **agent 即時編輯**：
  - agent 透過 `easy2learn_bank` 工具或 HTTP API 增刪改題目，頁面透過 SSE **即時更新，無需重新整理**
  - agent 直接編輯 `web/` 下的前端檔案，頁面收到 `reload` 事件自動整頁重新整理（靜態資源停用快取）
  - 直接修改 `data/bank.json` 也可以，fs.watch 會熱載入
  - agent 編輯 `interview-prep` 等筆記根目錄下的 md，學習頁收到 `notes` 事件自動重新擷取內容
- **知識點展示**：每題可帶 `knowledge`（markdown）；主題可關聯本機筆記檔案（如 `interview-prep/os/操作系统.md`），頁面內彈窗閱讀全文
- **進度與錯題本**：作答記錄存 localStorage，支援順序／隨機／錯題三種模式
- **零依賴**：純 Node 標準庫，`node src/standalone.js` 即可獨立執行，也可作為 DSH 外掛載入

## 以 DSH 外掛安裝

參照 `dsh-office-plugin` 的 link 方式，在 `~/.dsh/profiles/desktop/package.json`：

```json
{
  "dependencies": {
    "easy2learn": "link:/Users/yourname/workspace/easy2learn"
  },
  "dsh": { "profile": { "bundles": ["easy2learn"] } }
}
```

之後在該目錄執行 `pnpm install`，重新啟動 DSH。agent 取得 3 個工具：

| 工具 | 作用 |
|---|---|
| `easy2learn_start` | 啟動網頁服務，回傳 URL（冪等） |
| `easy2learn_bank` | list / add / update / delete 題目（即時推送至開啟的頁面） |
| `easy2learn_graph` | 知識圖譜管理：`regen`（筆記＋擴充資料重建）/ `list` / `add-edge`·`remove-edge`（跨知識點關聯，持久化至 graph-extra.json）/ `add-node`·`update-node`·`delete-node`（手動知識點） |
| `easy2learn_health` | 自檢：URL、題量、題型分布、圖譜規模、判題鏈路、線上頁面數 |

設定（在 profile 的 cordis.patch.yml 覆寫 `tool-easy2learn`）：

```yaml
- id: tool-easy2learn
  config:
    port: 8788
    bankPath: data/bank.json   # 相對外掛目錄或絕對路徑
    root: /Users/yourname/workspace   # 筆記允許的根目錄
```

## 資料模型與控制流

### 題庫 `data/bank.json`（src/bank.js）

```jsonc
{
  "meta": { "name": "面試題庫", "version": 1 },
  "topics": [
    { "id": "os", "name": "作業系統", "note": "interview-prep/os/操作系统.md" }  // note 相對 root
  ],
  "notesRoots": ["interview-prep"],   // /api/notes 白名單（相對 root）
  "questions": [
    // 單選：answer 為選項索引（0 起，亦接受 "A"/"B"）
    { "type": "single", "topic": "os", "difficulty": 3, "tags": ["程序"],
      "stem": "題幹（markdown）", "options": ["...", "..."],
      "answer": 1, "analysis": "解析", "knowledge": "相關知識點 markdown" },
    // 多選：answer 為索引陣列
    { "type": "multi", "answer": [0, 2] },
    // 是非：answer 為布林值
    { "type": "judge", "answer": true },
    // 問答：answer 為參考答案文字（markdown）
    { "type": "qa", "answer": "…" },
    // 程式設計：code.lang = cpp | python | node；tests 以修剪後的 stdout 比對
    { "type": "code",
      "code": { "lang": "cpp", "starter": "#include…",
                "tests": [{ "stdin": "", "expected": "400000" }] } }
  ]
}
```

重新產生種子題庫（來自 interview-prep 的 OS/C++ 卡片）：

```bash
node scripts/gen-bank.mjs
```

### 知識圖譜 `data/graph.json`（src/graph.js）

```jsonc
{
  "schema": 1,                    // 資料契約版本：前端配接層據此選擇配接器
  "generatedAt": "…", "engine": "builtin-force",
  "topics": [{
    "id": "os", "name": "作業系統", "note": "interview-prep/os/操作系统.md",
    "source": "notes",            // 資料來源類型（notes＝筆記解析；保留 quiz/custom…）
    "chapters": [{ "id": "slug", "name": "程序與執行緒" }],
    "nodes":   [{ "id": "os:xxx", "chapter": "slug", "label": "知識點",
                  "kind": "qa|concept|code",      // 知識形態，前端依 kind 查找渲染器
                  "content": "markdown" }],
    "edges":   [{ "s": "節點id", "t": "節點id", "kind": "seq|rel", "label": "關聯理由" }],
    "warnings": ["未匹配的策劃邊"]
  }]
}
```

**建置分層**（`buildGraphFromNotes`）：
- 筆記 `## 📇 問答卡片` → 節點主體（label/content/`kind=qa`）＋章節＋章節內順序鏈（`kind=seq`）
- `data/graph-extra.json` → 跨章節語意關聯（`kind=rel`）與手動節點（`kind` 可指定，預設由 `inferNodeKind` 依內容推斷）；**工具增刪亦寫入此處，regen 不遺失**（相容 `[s,t,label]` 陣列與 `{s,t,label}` 物件兩種形式）

重建：`node scripts/gen-graph.mjs`（CLI 薄殼，邏輯在 src/graph.js）或工具 `easy2learn_graph {action:"regen"}`。

### 前端展示框架與資料解耦（web/knowledge.js）

檢視（圖譜／滑動／詳情）**不直接消費伺服器端資料形狀**，中間隔了一層知識核心：

```
資料來源                  配接器登錄檔                領域模型             檢視
graph.json (schema 1) ─→ registerAdapter('graph',…) ─→ Topic{units[]} ─→ 圖譜(kgraph.js)
bank.json   （未來）  ─→ registerAdapter('quiz', …)                    ─→ 滑動卡/詳情
任意新來源              ─→ registerAdapter(schema,…)                   ─→ renderUnit(unit)
```

- **領域模型**：`Topic { id, name, source, chapters, units, edges, warnings }`；`Unit { id, title, kind, chapter, tags, body }` — 檢視只認這個形狀
- **知識形態 kind**：`qa`（問答卡：問題橫幅＋答案）/ `concept`（概念）/ `code`（以程式碼為主），每種一個渲染器；未知 kind 有兜底角標與渲染，永不白屏
- **渲染器登錄檔**：`registerRenderer(kind, fn)` — 滑動卡與詳情面板皆透過 `renderUnit(unit)` 產出內容，新增形態不必改檢視程式碼
- **兜底推斷**：伺服器端未給 kind 的既有資料由 `inferUnitKind`（A:/Q: 標記 → qa，程式碼區塊體積超過散文 → code）客戶端補判；不認識的資料形狀 → 空狀態而非崩潰

新增一種知識展示的路徑：① 伺服器端資料帶 kind（或靠推斷）② `registerRenderer('新kind', fn)` ③ 完成。
新增一個資料來源的路徑：① 伺服器端輸出 `{ schema, topics }` ② `registerAdapter(schemaName, fn)` ③ 三種展示自動到位。

### 控制流

```
agent 工具 (bank/graph) ──┐
HTTP API ────────────────┤→ server.js ─┬→ bank.json / graph.json（原子落盤，記憶體優先）
直接編輯 web/ 前端 ───────┤             ├→ fs.watch(data/) 依檔案分流 → SSE bank|graph
直接編輯 graph-extra.json ┤             ├→ fs.watch(web/)  → SSE reload（頁面整頁重新整理）
直接編輯筆記 md ──────────┘             ├→ fs.watch(notesRoots) → SSE notes（提示 regen）
                                      └→ runner.js → g++/python3/node 本機判題
瀏覽器：SSE bank/graph → 靜默重新擷取；reload → 重新整理；notes → 重新擷取 graph
```

## HTTP API（頁面與 agent 共用）

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/state` | 全量狀態（題庫＋圖譜規模＋可用判題語言） |
| GET | `/api/graph` | 知識圖譜（記憶體狀態） |
| POST | `/api/questions` | 新增題目 |
| PUT | `/api/questions/:id` | patch 合併更新 |
| DELETE | `/api/questions/:id` | 刪除 |
| POST | `/api/run` | `{lang, code, tests}` → 本機編譯執行判題 |
| GET | `/api/notes?p=…` | 讀取白名單內的 markdown 筆記 |
| GET | `/api/events` | SSE：`bank` / `graph` / `notes` / `reload` / `graph-extra` |

## License

MIT
