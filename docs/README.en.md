# easy2learn

[简体中文](../README.md) | **English** | [日本語](README.ja.md) | [繁體中文](README.zh-TW.md)

> A quiet little study app that runs entirely on your machine. No sign-up, no cloud, no pop-ups —
> just one purpose: help you finish the questions and connect the knowledge, comfortably.

## The experience it aims to give you

- **Instant answers, instant reasons**. Five question types — single choice, multiple choice, true/false, Q&A, and programming. The moment you submit, you know whether you were right and why. Programming questions compile and run on your machine, with per-case results in seconds.
- **Wrong answers never slip away**. Mistakes are gathered into a wrong-answer book you can revisit anytime in "wrong-only" mode. Your progress lives in the browser, so the next visit picks up right where you stopped.
- **Knowledge as a web, not a pile of sand**. The knowledge graph lays out every point by chapter and draws the lines between them. Click a node to read it, then follow a relation to the next — revision becomes a stroll rather than a slog.
- **Prefer to read slowly? Slide reading is there**. The table of contents sits above, the cards below; swipe or press the arrow keys, and page through like a small book already ordered for you.
- **A question writer on call**. Alongside DeepSeek Harness, an agent can add questions, refresh notes, even restyle the page — and the page updates the instant it does, so your material never goes stale.
- **Clean, calm, and yours to tune**. Frosted glass and rounded cards, with one-click light and dark that can follow your system, or simply your mood.
- **One command, runs anywhere**. Zero dependencies on anything but the Node standard library — nothing to install first.

## Up and running in three minutes

```bash
node src/standalone.js        # serves http://127.0.0.1:8788/ by default
node src/standalone.js 8899   # or pick your own port
```

Open the address in a browser, pick a topic, and start.

## Features

- **Two modes**:
  - **Quiz mode** `/` — practice single/multi/judge/Q&A/programming questions
  - **Study mode** `/learn.html` — two switchable views:
    - **Knowledge graph**: a force-directed graph of the knowledge network (custom engine in `web/kgraph.js`, zero dependencies; chapters color-coded, learned items check-marked, drag to pan / scroll or pinch to zoom / drag nodes; dirty-flag rendering guarantees instant redraws after convergence). **Click a node → read that knowledge point in the panel below**; related items are clickable, selecting one highlights adjacent edges with relation labels. The presentation layer is decoupled from data via `web/knowledge.js`; multiple knowledge shapes (Q&A, concept, code) each get their own renderer (cards and details carry a shape badge)
    - **Slide reading**: a table of contents above (chapter groups + knowledge chips) + horizontal scroll-snap cards below; supports trackpad/touch swipes, arrow keys, and click-to-jump from the TOC
    - Graph data is generated from notes by `scripts/gen-graph.mjs` (`data/graph.json`, served via `/api/graph`): nodes = Q&A cards, edges = in-chapter sequence chains + hand-curated cross-chapter semantic relations
- **Four question types + local code judging**: choice and judge questions are scored instantly; Q&A is self-graded against a reference answer; programming questions are written to a temp directory and compiled/run with the local `g++/python3/node` against test cases (5s timeout, stdout comparison)
- **Real-time agent editing**:
  - The agent adds/updates/deletes questions via the `easy2learn_bank` tool or the HTTP API → open pages update over SSE **live, no refresh needed**
  - The agent edits front-end files under `web/` → pages receive a `reload` event and refresh themselves (static assets served no-cache)
  - Editing `data/bank.json` directly works too — fs.watch hot-reloads it
  - The agent edits markdown under note roots such as `interview-prep` → the study page receives a `notes` event and refetches
- **Knowledge display**: every question can carry `knowledge` (markdown); a topic can link to a local note file (e.g. `interview-prep/os/操作系统.md`) readable in an in-page modal
- **Progress & wrong-answer book**: answers are stored in localStorage; order / random / wrong-only modes
- **Zero dependencies**: pure Node standard library — run standalone with `node src/standalone.js`, or load as a DSH plugin

## Install as a DSH plugin

Following the `dsh-office-plugin` link pattern, edit `~/.dsh/profiles/desktop/package.json`:

```json
{
  "dependencies": {
    "easy2learn": "link:/Users/yourname/workspace/easy2learn"
  },
  "dsh": { "profile": { "bundles": ["easy2learn"] } }
}
```

Then run `pnpm install` in that directory and restart DSH. The agent gains 3 tools:

| Tool | Purpose |
|---|---|
| `easy2learn_start` | Start the web service, returns the URL (idempotent) |
| `easy2learn_bank` | list / add / update / delete questions (pushed live to open pages) |
| `easy2learn_graph` | Knowledge-graph management: `regen` (rebuild from notes + extras) / `list` / `add-edge`·`remove-edge` (cross-topic relations, persisted to graph-extra.json) / `add-node`·`update-node`·`delete-node` (hand-authored knowledge points) |
| `easy2learn_health` | Self-check: URL, question count, type distribution, graph size, judge toolchain, live page count |

Configuration (override `tool-easy2learn` in the profile's cordis.patch.yml):

```yaml
- id: tool-easy2learn
  config:
    port: 8788
    bankPath: data/bank.json   # relative to the plugin dir, or absolute
    root: /Users/yourname/workspace   # allowed root for notes
```

## Data Model and Control Flow

### Question bank `data/bank.json` (src/bank.js)

```jsonc
{
  "meta": { "name": "Interview question bank", "version": 1 },
  "topics": [
    { "id": "os", "name": "Operating Systems", "note": "interview-prep/os/操作系统.md" }  // note is relative to root
  ],
  "notesRoots": ["interview-prep"],   // /api/notes whitelist (relative to root)
  "questions": [
    // single choice: answer is the option index (0-based; "A"/"B" also accepted)
    { "type": "single", "topic": "os", "difficulty": 3, "tags": ["process"],
      "stem": "question text (markdown)", "options": ["...", "..."],
      "answer": 1, "analysis": "explanation", "knowledge": "related knowledge markdown" },
    // multiple choice: answer is an array of indices
    { "type": "multi", "answer": [0, 2] },
    // true/false: answer is a boolean
    { "type": "judge", "answer": true },
    // Q&A: answer is the reference answer text (markdown)
    { "type": "qa", "answer": "…" },
    // programming: code.lang = cpp | python | node; tests compare trimmed stdout
    { "type": "code",
      "code": { "lang": "cpp", "starter": "#include…",
                "tests": [{ "stdin": "", "expected": "400000" }] } }
  ]
}
```

Regenerate the seed bank (from the OS/C++ cards in interview-prep):

```bash
node scripts/gen-bank.mjs
```

### Knowledge graph `data/graph.json` (src/graph.js)

```jsonc
{
  "schema": 1,                    // data contract version: the front-end adapter layer picks adapters by this
  "generatedAt": "…", "engine": "builtin-force",
  "topics": [{
    "id": "os", "name": "Operating Systems", "note": "interview-prep/os/操作系统.md",
    "source": "notes",            // data source type (notes = parsed notes; quiz/custom reserved)
    "chapters": [{ "id": "slug", "name": "Processes & Threads" }],
    "nodes":   [{ "id": "os:xxx", "chapter": "slug", "label": "knowledge point",
                  "kind": "qa|concept|code",      // knowledge shape; the front end looks up renderers by kind
                  "content": "markdown" }],
    "edges":   [{ "s": "node-id", "t": "node-id", "kind": "seq|rel", "label": "relation reason" }],
    "warnings": ["unmatched curated edges"]
  }]
}
```

**Build layers** (`buildGraphFromNotes`):
- Notes' `## 📇 Q&A cards` → node bodies (label/content/`kind=qa`) + chapters + in-chapter sequence chains (`kind=seq`)
- `data/graph-extra.json` → cross-chapter semantic relations (`kind=rel`) and hand-authored nodes (`kind` optional; defaults inferred by `inferNodeKind`); **tool edits also land here and survive regen** (both `[s,t,label]` arrays and `{s,t,label}` objects accepted)

Rebuild: `node scripts/gen-graph.mjs` (thin CLI wrapper; logic in src/graph.js) or the tool `easy2learn_graph {action:"regen"}`.

### Presentation layer decoupled from data (web/knowledge.js)

Views (graph/slides/detail) **never consume server data shapes directly** — a knowledge kernel sits in between:

```
Data source               Adapter registry            Domain model         Views
graph.json (schema 1) ─→ registerAdapter('graph',…) ─→ Topic{units[]} ─→ graph (kgraph.js)
bank.json   (future)  ─→ registerAdapter('quiz', …)                    ─→ slide cards / detail
any new source         ─→ registerAdapter(schema,…)                    ─→ renderUnit(unit)
```

- **Domain model**: `Topic { id, name, source, chapters, units, edges, warnings }`; `Unit { id, title, kind, chapter, tags, body }` — views only know this shape
- **Knowledge shapes (kind)**: `qa` (Q&A card: question banner + answer) / `concept` / `code` (code-centric), one renderer each; unknown kinds get a fallback badge and renderer — never a blank screen
- **Renderer registry**: `registerRenderer(kind, fn)` — both slide cards and the detail panel render through `renderUnit(unit)`; new shapes require no view changes
- **Fallback inference**: legacy data without kind is classified client-side by `inferUnitKind` (A:/Q: markers → qa; code blocks outweighing prose → code); unrecognized data shapes degrade to an empty state instead of crashing

Adding a new knowledge shape: ① data carries kind (or rely on inference) ② `registerRenderer('new-kind', fn)` ③ done.
Adding a new data source: ① the server outputs `{ schema, topics }` ② `registerAdapter(schemaName, fn)` ③ all three views light up automatically.

### Control flow

```
agent tools (bank/graph) ──┐
HTTP API ─────────────────┤→ server.js ─┬→ bank.json / graph.json (atomic flush; in-memory first)
edit web/ front-end ───────┤             ├→ fs.watch(data/) routed by file → SSE bank|graph
edit graph-extra.json ─────┤             ├→ fs.watch(web/)  → SSE reload (full page refresh)
edit notes md ─────────────┘             ├→ fs.watch(notesRoots) → SSE notes (hint to regen)
                                        └→ runner.js → g++/python3/node local judging
Browser: SSE bank/graph → silent refetch; reload → refresh; notes → refetch graph
```

## HTTP API (shared by pages and agents)

| Method | Path | Description |
|---|---|---|
| GET | `/api/state` | Full state (bank + graph size + available judge languages) |
| GET | `/api/graph` | Knowledge graph (in-memory) |
| POST | `/api/questions` | Add a question |
| PUT | `/api/questions/:id` | Patch-merge update |
| DELETE | `/api/questions/:id` | Delete |
| POST | `/api/run` | `{lang, code, tests}` → local compile & run judging |
| GET | `/api/notes?p=…` | Read whitelisted markdown notes |
| GET | `/api/events` | SSE: `bank` / `graph` / `notes` / `reload` / `graph-extra` |

## License

MIT
