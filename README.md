# easy2learn

> DeepSeek Harness (DSH) 学习插件：一个**可以被 agent 实时编辑**的本地刷题网页。
> 支持单选 / 多选 / 判断 / 问答 / 编程题（本地判题），知识点面板联动本地 markdown 笔记。

## 特性

- **两种模式**：
  - **刷题模式** `/` — 单选/多选/判断/问答/编程题练习
  - **学习模式** `/learn.html` — 知识大纲侧栏（从本地笔记的标题自动提取）+ 正文阅读 + 逐节「标记已学」进度 + 大纲搜索 + j/k 键跳节
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
| `easy2learn_health` | 自检：URL、题量、题型分布、判题链路、在线页面数 |

配置（profile 的 cordis.patch.yml 中覆盖 `tool-easy2learn`）：

```yaml
- id: tool-easy2learn
  config:
    port: 8788
    bankPath: data/bank.json   # 相对插件目录或绝对路径
    root: /Users/simonluo/workspace   # 笔记允许的根目录
```

## 数据模型（data/bank.json）

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

## HTTP API（页面与 agent 共用）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/state` | 全量状态（题库 + 可用判题语言） |
| POST | `/api/questions` | 新增题目 |
| PUT | `/api/questions/:id` | patch 合并更新 |
| DELETE | `/api/questions/:id` | 删除 |
| POST | `/api/run` | `{lang, code, tests}` → 本地编译运行判题 |
| GET | `/api/notes?p=…` | 读白名单内的 markdown 笔记 |
| GET | `/api/events` | SSE：`bank`（题库变更）/ `reload`（前端文件变更） |

## 控制流

```
agent (tools/API) ──┐
                    ├─→ server.js ──→ bank.json（落盘，原子写）
直接编辑 web/ 文件 ─┤       │
直接改 bank.json ───┘       ├─→ fs.watch ─→ SSE 推送 ─→ 浏览器实时更新
                            └─→ runner.js ─→ g++/python3/node 本地判题
```

## License

MIT
