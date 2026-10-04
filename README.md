# easy2learn

> DeepSeek Harness (DSH) 学习插件：一个**可以被 agent 实时编辑**的本地刷题网页。
> 支持单选 / 多选 / 判断 / 问答 / 编程题（本地判题），知识点面板联动本地 markdown 笔记。

## 特性

- **两种模式**：
  - **刷题模式** `/` — 单选/多选/判断/问答/编程题练习
  - **学习模式** `/learn.html` — 两种查看方式可切换：
    - **🕸 知识图谱**：力导向图展示知识点网络（`web/kgraph.js` 自研引擎，零依赖；按章节着色、已学打 ✓、拖拽平移/滚轮或双指捏合缩放/拖节点，脏标记渲染保证收敛后交互即时重绘），**点击节点 → 下方面板看该知识点内容**，关联知识点可点击跳转，选中时高亮邻边并显示关联标签；展示层经 `web/knowledge.js` 与数据解耦，问答/概念/代码等多形态知识各自渲染（卡片与详情带形态角标）
    - **📑 滑动阅读**：上方目录条（章节分组 + 知识点 chip）+ 下方横向 scroll-snap 滑卡，支持触控板/触摸滑动、←/→ 键、点击目录跳转
    - 图谱数据由 `scripts/gen-graph.mjs` 从笔记生成（`data/graph.json`，经 `/api/graph` 提供）：节点=问答卡片，边=章节顺序链+手工策划的跨章节语义关联
- **四类题型 + 编程题本地判题**：选择、判断即时判分；问答对照参考答案自评；编程题写到临时目录，用本机 `g++/python3/node` 编译运行测试用例（超时 5s，输出比对）
- **agent 实时编辑**：
  - agent 通过 `easy2learn_bank` 工具或 HTTP API 增删改题目 → 页面通过 SSE **实时更新，无需刷新**
  - agent 直接编辑 `web/` 下前端文件 → 页面收到 `reload` 事件自动整页刷新（静态资源禁缓存）
  - 直接改 `data/bank.json` 文件也行，fs.watch 会热加载
  - agent 编辑 `interview-prep` 等笔记根下的 md → 学习页收到 `notes` 事件自动重拉内容
- **知识点展示**：每题可带 `knowledge`（markdown）；主题可关联本地笔记文件（如 `interview-prep/os/操作系统.md`），页面内弹窗阅读全文
- **进度与错题本**：作答记录存 localStorage，支持顺序 / 随机 / 错题三种模式
- **零依赖**：纯 Node 标准库，`node src/standalone.js` 即可独立运行，也可作为 DSH 插件加载

## 快速开始（独立运行）

```bash
node src/standalone.js        # 默认 http://127.0.0.1:8788/
node src/standalone.js 8899   # 指定端口
```

## 作为 DSH 插件安装

参照 `dsh-office-plugin` 的 link 方式，在 `~/.dsh/profiles/desktop/package.json`：

```json
{
  "dependencies": {
    "easy2learn": "link:/Users/simonluo/workspace/easy2learn"
  },
  "dsh": { "profile": { "bundles": ["easy2learn"] } }
}
```

然后在该目录 `pnpm install`，重启 DSH。agent 获得 3 个工具：

| 工具 | 作用 |
|---|---|
| `easy2learn_start` | 启动网页服务，返回 URL（幂等） |
| `easy2learn_bank` | list / add / update / delete 题目（实时推送到打开的页面） |
| `easy2learn_graph` | 知识图谱管理：`regen`（笔记+扩展数据重建）/ `list` / `add-edge`·`remove-edge`（跨知识点关联，持久化到 graph-extra.json）/ `add-node`·`update-node`·`delete-node`（手工知识点） |
| `easy2learn_health` | 自检：URL、题量、题型分布、图谱规模、判题链路、在线页面数 |

配置（profile 的 cordis.patch.yml 中覆盖 `tool-easy2learn`）：

```yaml
- id: tool-easy2learn
  config:
    port: 8788
    bankPath: data/bank.json   # 相对插件目录或绝对路径
    root: /Users/simonluo/workspace   # 笔记允许的根目录
```

## 数据模型与控制流

### 题库 `data/bank.json`（src/bank.js）

```jsonc
{
  "meta": { "name": "面经题库", "version": 1 },
  "topics": [
    { "id": "os", "name": "操作系统", "note": "interview-prep/os/操作系统.md" }  // note 相对 root
  ],
  "notesRoots": ["interview-prep"],   // /api/notes 白名单（相对 root）
  "questions": [
    // 单选：answer 是选项下标（0 起，也接受 "A"/"B"）
    { "type": "single", "topic": "os", "difficulty": 3, "tags": ["进程"],
      "stem": "题干（markdown）", "options": ["...", "..."],
      "answer": 1, "analysis": "解析", "knowledge": "相关知识点 markdown" },
    // 多选：answer 是下标数组
    { "type": "multi", "answer": [0, 2] },
    // 判断：answer 布尔
    { "type": "judge", "answer": true },
    // 问答：answer 是参考答案文本（markdown）
    { "type": "qa", "answer": "…" },
    // 编程：code.lang = cpp | python | node；tests 按修剪后的 stdout 比对
    { "type": "code",
      "code": { "lang": "cpp", "starter": "#include…",
                "tests": [{ "stdin": "", "expected": "400000" }] } }
  ]
}
```

重新生成种子题库（来自 interview-prep 的 OS/C++ 卡片）：

```bash
node scripts/gen-bank.mjs
```

### 知识图谱 `data/graph.json`（src/graph.js）

```jsonc
{
  "schema": 1,                    // 数据契约版本：前端适配层据此选择适配器
  "generatedAt": "…", "engine": "builtin-force",
  "topics": [{
    "id": "os", "name": "操作系统", "note": "interview-prep/os/操作系统.md",
    "source": "notes",            // 数据源类型（notes=笔记解析；预留 quiz/custom…）
    "chapters": [{ "id": "slug", "name": "进程与线程" }],
    "nodes":   [{ "id": "os:xxx", "chapter": "slug", "label": "知识点",
                  "kind": "qa|concept|code",      // 知识形态，前端按 kind 查渲染器
                  "content": "markdown" }],
    "edges":   [{ "s": "节点id", "t": "节点id", "kind": "seq|rel", "label": "关联理由" }],
    "warnings": ["未匹配的策展边"]
  }]
}
```

**构建分层**（`buildGraphFromNotes`）：
- 笔记 `## 📇 问答卡片` → 节点主体（label/content/`kind=qa`）+ 章节 + 章节内顺序链（`kind=seq`）
- `data/graph-extra.json` → 跨章节语义关联（`kind=rel`）与手工节点（`kind` 可指定，缺省 `inferNodeKind` 按内容推断）；**工具增删也写这里，regen 不丢**（兼容 `[s,t,label]` 数组与 `{s,t,label}` 对象两种形式）

重建：`node scripts/gen-graph.mjs`（CLI 薄壳，逻辑在 src/graph.js）或工具 `easy2learn_graph {action:"regen"}`。

### 前端展示框架与数据解耦（web/knowledge.js）

视图（图谱/滑动/详情）**不直接消费服务端数据形状**，中间隔了一层知识内核：

```
数据源                      适配器注册表                 领域模型              视图
graph.json (schema 1) ─→ registerAdapter('graph',…) ─→ Topic{units[]} ─→ 图谱(kgraph.js)
bank.json   (未来)    ─→ registerAdapter('quiz', …)                    ─→ 滑动卡/详情
任意新源              ─→ registerAdapter(schema,…)                     ─→ renderUnit(unit)
```

- **领域模型**：`Topic { id, name, source, chapters, units, edges, warnings }`；`Unit { id, title, kind, chapter, tags, body }` —— 视图只认这个形状
- **知识形态 kind**：`qa`(问答卡：问题横幅+答案) / `concept`(概念) / `code`(代码为主)，每种一个渲染器；未知 kind 有兜底角标与渲染，永不白屏
- **渲染器注册表**：`registerRenderer(kind, fn)` —— 滑动卡和详情面板都通过 `renderUnit(unit)` 出内容，新增形态不改视图代码
- **兜底推断**：服务端没给 kind 的存量数据由 `inferUnitKind`（A:/Q: 标记 → qa，代码块体积超过散文 → code）客户端补判；不认识的数据形状 → 空态而非崩溃

新增一种知识展示的路径：① 服务端数据带 kind（或靠推断）② `registerRenderer('新kind', fn)` ③ 完成。
新增一个数据源的路径：① 服务端输出 `{ schema, topics }` ② `registerAdapter(schemaName, fn)` ③ 视图自动获得三种展示。

### 控制流

```
agent 工具 (bank/graph) ──┐
HTTP API ────────────────┤→ server.js ─┬→ bank.json / graph.json（原子落盘，内存态优先）
直接编辑 web/ 前端 ───────┤             ├→ fs.watch(data/) 按文件分流 → SSE bank|graph
直接编辑 graph-extra.json ┤             ├→ fs.watch(web/)  → SSE reload（页面整页刷新）
直接编辑笔记 md ──────────┘             ├→ fs.watch(notesRoots) → SSE notes（提示 regen）
                                       └→ runner.js → g++/python3/node 本地判题
浏览器：SSE bank/graph → 静默重拉；reload → 刷新；notes → 重拉 graph
```

## HTTP API（页面与 agent 共用）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/state` | 全量状态（题库 + 图谱规模 + 可用判题语言） |
| GET | `/api/graph` | 知识图谱（内存态） |
| POST | `/api/questions` | 新增题目 |
| PUT | `/api/questions/:id` | patch 合并更新 |
| DELETE | `/api/questions/:id` | 删除 |
| POST | `/api/run` | `{lang, code, tests}` → 本地编译运行判题 |
| GET | `/api/notes?p=…` | 读白名单内的 markdown 笔记 |
| GET | `/api/events` | SSE：`bank` / `graph` / `notes` / `reload` / `graph-extra` |

## License

MIT
