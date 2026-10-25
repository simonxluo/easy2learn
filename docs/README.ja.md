# easy2learn

[简体中文](../README.md) | [English](README.en.md) | **日本語** | [繁體中文](README.zh-TW.md)

> あなたのマシンの中で静かに動く、学習クイズアプリ。登録も、クラウドも、ポップアップもなし。
> 目的はただひとつ——気持ちよく問題を解き終え、知識をつなげること。

## 目指す体験

- **送信した瞬間に、正誤とその理由**。単一選択・複数選択・○×・記述・プログラミングの 5 形式。プログラミング問題は手元でコンパイルして実行され、各ケースの結果が数秒で返ってきます。
- **間違えた問題は逃しません**。誤答は自動的に間違いノートへ集まり、「間違いのみ」モードでいつでも見直せます。進捗はブラウザに保存され、次に開いたときは前回の続きから。
- **知識は砂山ではなく、網**。ナレッジグラフが知識点を章ごとに並べ、その関係を線で結びます。ノードをクリックして読み、関連をたどって次へ。復習は暗記の苦行ではなく、散歩のようなものになります。
- **ゆっくり読みたい日のために**。スライドリーディングに切り替えれば、上に目次、下にカード。スワイプでも矢印キーでも、あなたのためにあらかじめ並べられた小さな本をめくるように読み進められます。
- **そばに、呼べば来る問題作成者**。DeepSeek Harness と組み合わせれば、エージェントが問題の追加、ノートの更新、画面の手入れまでリアルタイムに行い、ページはその瞬間に最新になります。教材が古びることはありません。
- **静かで美しく、あなた好みの見た目**。すりガラスと角丸カードの界面。ライトとダークはワンクリックで、システムに任せても、気分に任せても。
- **コマンドひとつで、どこでも動く**。依存はゼロ。Node の標準ライブラリだけで、何かをインストールする必要もありません。

## 3 分ではじめる

```bash
node src/standalone.js        # デフォルトは http://127.0.0.1:8788/
node src/standalone.js 8899   # ポート指定も可能
```

ブラウザでアドレスを開き、トピックを選んだら、もう始まっています。

## 機能

- **2 つのモード**：
  - **クイズモード** `/` — 単一・複数選択 / ○× / 記述 / プログラミング問題の練習
  - **学習モード** `/learn.html` — 切り替え可能な 2 つの表示方式：
    - **ナレッジグラフ**：力指向グラフで知識ネットワークを表示（`web/kgraph.js` の自作エンジン、依存ゼロ。章ごとの色分け、学習済みノードにはチェックマーク、ドラッグでパン／ホイール・ピンチでズーム／ノードのドラッグ、ダーティフラグ描画により収束後の操作は即時再描画）。**ノードをクリック → 下のパネルでその知識点の内容を閲覧**。関連知識点はクリックでジャンプでき、選択時は隣接エッジをハイライトし関連ラベルを表示。表示層は `web/knowledge.js` を介してデータと分離され、記述・概念・コードなど複数の知識形態がそれぞれ専用レンダラーで表示（カードと詳細に形態バッジ付き）
    - **スライドリーディング**：上部に目次（章グループ + 知識点チップ）、下部に横スクロール snap カード。トラックパッド / タッチスワイプ、矢印キー、目次クリックジャンプに対応
    - グラフデータは `scripts/gen-graph.mjs` がノートから生成（`data/graph.json`、`/api/graph` で提供）：ノード＝Q&A カード、エッジ＝章内の順序チェーン + 手動キュレーションによる章横断の意味的関連
- **4 種類の問題 + プログラミング問題のローカルジャッジ**：選択・○×は即時採点、記述は模範解答との照合で自己採点、プログラミング問題はテンポラリディレクトリに書き出し、ローカルの `g++/python3/node` でテストケースをコンパイル・実行（タイムアウト 5 秒、stdout 比較）
- **エージェントによるリアルタイム編集**：
  - エージェントが `easy2learn_bank` ツールまたは HTTP API で問題を追加・更新・削除 → 開いているページに SSE で**リアルタイム反映、リロード不要**
  - エージェントが `web/` 配下のフロントエンドファイルを直接編集 → ページが `reload` イベントを受けて自動で全ページ更新（静的リソースはキャッシュ無効）
  - `data/bank.json` の直接編集も可。fs.watch がホットリロード
  - エージェントが `interview-prep` などのノートルート下の md を編集 → 学習ページが `notes` イベントを受けて内容を再取得
- **知識表示**：各問題に `knowledge`（markdown）を持たせられる。トピックはローカルノートファイル（例：`interview-prep/os/操作系统.md`）に紐付け可能で、ページ内モーダルで全文閲覧
- **進捗と間違いノート**：解答履歴は localStorage に保存。順序 / ランダム / 間違いのみの 3 モード
- **依存ゼロ**：純粋な Node 標準ライブラリのみ。`node src/standalone.js` で単体実行可能、DSH プラグインとしても読み込み可

## DSH プラグインとしてインストール

`dsh-office-plugin` の link 方式に準拠し、`~/.dsh/profiles/desktop/package.json` に：

```json
{
  "dependencies": {
    "easy2learn": "link:/Users/yourname/workspace/easy2learn"
  },
  "dsh": { "profile": { "bundles": ["easy2learn"] } }
}
```

そのディレクトリで `pnpm install` 後、DSH を再起動。エージェントは 3 つのツールを獲得します：

| ツール | 機能 |
|---|---|
| `easy2learn_start` | Web サービスを起動し URL を返す（冪等） |
| `easy2learn_bank` | 問題の list / add / update / delete（開いているページへリアルタイム配信） |
| `easy2learn_graph` | ナレッジグラフ管理：`regen`（ノート + 拡張データから再構築）/ `list` / `add-edge`·`remove-edge`（知識点横断の関連、graph-extra.json に永続化）/ `add-node`·`update-node`·`delete-node`（手動知識点） |
| `easy2learn_health` | 自己診断：URL、問題数、形式分布、グラフ規模、ジャッジチェーン、接続ページ数 |

設定（プロファイルの cordis.patch.yml で `tool-easy2learn` を上書き）：

```yaml
- id: tool-easy2learn
  config:
    port: 8788
    bankPath: data/bank.json   # プラグインディレクトリ相対または絶対パス
    root: /Users/yourname/workspace   # ノート許可ルートディレクトリ
```

## データモデルと制御フロー

### 問題バンク `data/bank.json`（src/bank.js）

```jsonc
{
  "meta": { "name": "面接問題バンク", "version": 1 },
  "topics": [
    { "id": "os", "name": "オペレーティングシステム", "note": "interview-prep/os/操作系统.md" }  // note は root 相対
  ],
  "notesRoots": ["interview-prep"],   // /api/notes ホワイトリスト（root 相対）
  "questions": [
    // 単一選択：answer は選択肢インデックス（0 起。"A"/"B" も可）
    { "type": "single", "topic": "os", "difficulty": 3, "tags": ["プロセス"],
      "stem": "問題文（markdown）", "options": ["...", "..."],
      "answer": 1, "analysis": "解説", "knowledge": "関連知識点 markdown" },
    // 複数選択：answer はインデックス配列
    { "type": "multi", "answer": [0, 2] },
    // ○×：answer は真偽値
    { "type": "judge", "answer": true },
    // 記述：answer は模範解答テキスト（markdown）
    { "type": "qa", "answer": "…" },
    // プログラミング：code.lang = cpp | python | node。tests はトリム後の stdout と比較
    { "type": "code",
      "code": { "lang": "cpp", "starter": "#include…",
                "tests": [{ "stdin": "", "expected": "400000" }] } }
  ]
}
```

シード問題バンクを再生成（interview-prep の OS/C++ カードから）：

```bash
node scripts/gen-bank.mjs
```

### ナレッジグラフ `data/graph.json`（src/graph.js）

```jsonc
{
  "schema": 1,                    // データ契約バージョン：フロントエンドのアダプター層がこれで選択
  "generatedAt": "…", "engine": "builtin-force",
  "topics": [{
    "id": "os", "name": "オペレーティングシステム", "note": "interview-prep/os/操作系统.md",
    "source": "notes",            // データソース種別（notes＝ノート解析。quiz/custom は予約）
    "chapters": [{ "id": "slug", "name": "プロセスとスレッド" }],
    "nodes":   [{ "id": "os:xxx", "chapter": "slug", "label": "知識点",
                  "kind": "qa|concept|code",      // 知識形態。フロントは kind でレンダラーを引き当て
                  "content": "markdown" }],
    "edges":   [{ "s": "ノードid", "t": "ノードid", "kind": "seq|rel", "label": "関連理由" }],
    "warnings": ["未マッチのキュレーションエッジ"]
  }]
}
```

**ビルド階層**（`buildGraphFromNotes`）：
- ノートの `## 📇 Q&A カード` → ノード本体（label/content/`kind=qa`）+ 章 + 章内順序チェーン（`kind=seq`）
- `data/graph-extra.json` → 章横断の意味的関連（`kind=rel`）と手動ノード（`kind` 指定可、省略時は `inferNodeKind` が内容から推論）；**ツールによる追加・削除もここに書き込まれ、regen でも消えない**（`[s,t,label]` 配列と `{s,t,label}` オブジェクトの両形式に対応）

再構築：`node scripts/gen-graph.mjs`（CLI の薄いラッパー、ロジックは src/graph.js）またはツール `easy2learn_graph {action:"regen"}`。

### 表示層とデータの分離（web/knowledge.js）

ビュー（グラフ / スライド / 詳細）は**サーバーデータの形状を直接消費しない** — 中間に知識カーネルを挟みます：

```
データソース             アダプターレジストリ           ドメインモデル        ビュー
graph.json (schema 1) ─→ registerAdapter('graph',…) ─→ Topic{units[]} ─→ グラフ(kgraph.js)
bank.json   (将来)    ─→ registerAdapter('quiz', …)                    ─→ スライドカード/詳細
任意の新ソース         ─→ registerAdapter(schema,…)                    ─→ renderUnit(unit)
```

- **ドメインモデル**：`Topic { id, name, source, chapters, units, edges, warnings }`、`Unit { id, title, kind, chapter, tags, body }` — ビューはこの形状だけを知る
- **知識形態 kind**：`qa`（Q&A カード：問題バナー + 解答）/ `concept`（概念）/ `code`（コード中心）。各形態に 1 つのレンダラー。未知の kind はフォールバックのバッジと描画を持ち、白画面にならない
- **レンダラーレジストリ**：`registerRenderer(kind, fn)` — スライドカードも詳細パネルも `renderUnit(unit)` で描画。新しい形態を追加してもビューのコードは不要
- **フォールバック推論**：kind のない既存データは `inferUnitKind` がクライアント側で判定（A:/Q: マーカー → qa、散文を超えるコードブロック量 → code）。認識できないデータ形状はクラッシュではなく空状態に劣化

知識形態の追加手順：① データが kind を持つ（または推論に任せる）② `registerRenderer('新kind', fn)` ③ 完了。
データソースの追加手順：① サーバーが `{ schema, topics }` を出力 ② `registerAdapter(schemaName, fn)` ③ 3 つのビューが自動的に対応。

### 制御フロー

```
エージェントツール (bank/graph) ──┐
HTTP API ───────────────────────┤→ server.js ─┬→ bank.json / graph.json（アトミックフラッシュ、メモリ優先）
web/ フロントエンド直接編集 ──────┤             ├→ fs.watch(data/) ファイル別に振り分け → SSE bank|graph
graph-extra.json 直接編集 ────────┤             ├→ fs.watch(web/)  → SSE reload（ページ全再読み込み）
ノート md 直接編集 ───────────────┘             ├→ fs.watch(notesRoots) → SSE notes（regen を促す）
                                               └→ runner.js → g++/python3/node ローカルジャッジ
ブラウザ：SSE bank/graph → サイレント再取得。reload → 再読み込み。notes → graph 再取得
```

## HTTP API（ページとエージェント共用）

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/state` | 全状態（問題バンク + グラフ規模 + 利用可能なジャッジ言語） |
| GET | `/api/graph` | ナレッジグラフ（メモリ状態） |
| POST | `/api/questions` | 問題の追加 |
| PUT | `/api/questions/:id` | patch マージ更新 |
| DELETE | `/api/questions/:id` | 削除 |
| POST | `/api/run` | `{lang, code, tests}` → ローカルコンパイル・実行ジャッジ |
| GET | `/api/notes?p=…` | ホワイトリスト内の markdown ノートを読む |
| GET | `/api/events` | SSE：`bank` / `graph` / `notes` / `reload` / `graph-extra` |

## License

MIT
