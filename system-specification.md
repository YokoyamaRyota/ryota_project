# 要件定義（機能要件・非機能要件）

## 0. 実現可能性前提
- 用語対応:

| ライフサイクル工程 | 対応成果物 |
|------------------|------------|
| 要求定義 | requirements-definition.md |
| 要件定義 | system-specification.md |
| デリバリープラン | delivery-plan.md |
| 設計 | design.md |

- Phase 1 の受け入れは、Coordinator 中心の基本フロー、監査ログ、フォールバック、エピソード記録までを対象とする。
- 蒸留パイプラインによる速度・品質改善は Phase 3（8週以降）の効果として扱い、Phase 1 の受け入れ条件には含めない。
- 外部依存レビュー、MCP統合、外部監査ストレージ連携は feature flag 配下の任意機能として実装し、未接続時もローカル処理で継続できなければならない。
- 投資対効果や月額コストの詳細比較は参考情報とし、本書の成立判定は KPI と受け入れ基準の実測で行う。
- Phase 1 のメモリ範囲は、episodes/ への記録と audit_log/ へのイベント追記を最小構成とし、Hybrid Retrieval、競合解決、自動蒸留最適化は段階有効化とする。
- Phase 1 では、FR-16 から FR-20 のうち「記録」「抑止」「復元」の最小要件を優先し、記憶再利用の最適化は Phase 2 以降で強化する。

## 1. アーキテクチャ概要
役割:
- Coordinator: 全体オーケストレーション、ポリシーチェック、収束判定
- Planner: タスク分解と実行計画
- Implementer: コード/タスク実行
- Reviewer: 段階的レビュー（Fast Gate、Deep Review）
- Episode Writer: タスク完了時のエピソード記録
- Memory Retriever: Tiered Memory の検索とロード制御
- Distillation Worker: エピソードの蒸留・統合
- Event Ledger: メモリ変更イベントの追記と再生
- Index Manager: メモリ索引と競合状態の管理

コア設計原則:
- 条件付き並列
- タスク難易度に応じたモデルルーティング
- 構造化ハンドオフ契約
- コストとタイムアウトのガードレール
- 観測可能で復旧可能な実行

## 2. 機能要件
FR-01 要求解析
- ユーザー入力から goal、constraints、done criteria、out-of-scope を抽出する。
- 正規化されたタスク契約JSONを生成する。

FR-01a 意思決定トリアージ
- 要求を次のいずれかに分類する。
  - known_pattern
  - new_required_capability
  - ambiguous_request
- known_pattern と判定された要求は、FR-12 の意思決定ゲートを省略可能とする。

FR-01b 分類・高リスク判定ルール
- Request Analyzer は、分類理由をログに残さなければならない。
- known_pattern は、以下をすべて満たす場合にのみ適用できる。
  - 類似する既知パターン ID を特定できる
  - must-have 制約の追加がない
  - high risk 領域に該当しない、または high risk でも既知テンプレートの適用条件が満たされる
- high risk 領域は少なくとも以下を含む。
  - 認証 / 認可
  - 秘密情報 / credential
  - 課金 / 決済
  - データ整合性 / 状態遷移 / 永続化
  - 外部依存の重要連携

FR-02 構造化ハンドオフ契約
- すべてのフェーズ遷移で、以下の必須項目を持つ契約オブジェクトを受け渡すこと。
  - goal
  - constraints
  - done_criteria
  - out_of_scope
  - acceptance_tests
- 必須項目が欠落している場合、フェーズ遷移をブロックしなければならない。

FR-03 条件付き並列ポリシー
- 以下をすべて満たす場合のみ、並列レビューを有効化する。
  - 推定複雑度 >= medium
  - 変更ファイル数 >= 3 または変更行数 >= 120
  - 残予算 >= 設定閾値
- それ以外は直列実行とする。
- 並列の上限制約:
  - 並列レビュー分岐数の上限 = 3
  - 分岐オーバーヘッド予測が 15 秒を超える場合、強制的に直列化
- 動的上限制御:
  - 既定の並列分岐上限は 2 とする
  - 残予算が十分で、直近 p90 遅延が閾値以内の場合のみ上限 3 を許可する
  - 残予算が警告閾値未満、または直近遅延が悪化している場合は上限 1（直列）に降格する
  - complex タスクの並列上限は 2 とする
- 実装制約: VS Code Copilot のサブエージェント実行はインターリーブ実行（疑似並列）であり、OS スレッドレベルの真の並列実行ではない。分岐上限は連続するサブエージェント呼び出し数として管理し、分岐オーバーヘッド計測は Coordinator によるタイムスタンプ差分推計で代行する。

FR-04 モデルルーティングポリシー
- モデル選定は GitHub Copilot で利用可能なモデルのみを対象とする。
- 単純サブタスク（要約、整形チェック、基本計画作成）は低 multiplier モデルを優先する。
- 中〜高リスクタスク（最終統合、複雑実装、最終深掘りレビュー）は高性能モデルを使用する。
- ルーティング判定はフェーズごとにログ記録する。
- ルーティング分類ルール:
  - simple: 変更行数 < 80 かつ外部連携なし
  - medium: 変更行数 80-300 または外部連携1件
  - complex: 変更行数 > 300 または複数連携、または重大リスク領域
- Copilot multiplier ベースの選定原則:
  - 最小 multiplier を優先する
  - 同一 multiplier の候補が複数ある場合は、最大性能モデルを優先し、同等性能時のみモデル比較ガイドの推奨タスク適合性で決定する
  - Agentic software development が必要な場合は、Copilot model comparison で agentic 推奨のモデルを優先候補とする
  - Fast help が目的の場合は、Copilot model comparison で fast help 推奨のモデルを優先する
  - included model（例: GPT-5 mini, GPT-4.1）が要件を満たす場合は優先採用する
  - model_multiplier の固定値は仕様へ埋め込まず、supported models の最新値を参照する

FR-04a 同倍率時の性能優先選定
- 同一 model_multiplier の候補が複数ある場合、次の優先順でモデルを選択しなければならない。
  1) モデル性能ランク（高い方を優先）
  2) 直近30日・同一タスク種別における must-have 充足率
  3) 再作業率（低い方を優先）
  4) p90 応答時間
- 上記指標が同等の場合は、Copilot model comparison の推奨タスク適合性が高いモデルを選択する。
- 選定理由（比較対象、採用理由、除外理由）は監査ログへ記録しなければならない。

FR-05 コストガードレール
- タスク単位およびセッション単位で予算上限を適用する。
- 予算超過が予測または検知された場合:
  - 低コストモードへ降格
  - 並列分岐を無効化
  - それでも超過する場合は継続ガイダンス付き部分結果を返却
- Copilot Premium Request 予測式:
  - predicted_requests = planned_user_prompts * selected_model_multiplier
  - predicted_request_cost = predicted_requests
  - predicted_request_cost >= 0.8 * remaining_request_budget の場合、超過予測と判定
  - VS Code の auto model selection を使用し、割引倍率が有効な場合は selected_model_multiplier に割引を適用する
- 注記:
  - Copilot の premium request は1回のユーザープロンプト単位で課金されるため、トークン量増加はコスト算定に含めない
  - model_multiplier は運用時に最新値を同期し、退役モデルは推奨代替モデルへ自動置換する
  - プレミアムリクエスト使用量の「検知」は Coordinator による推計ベースであり、リアルタイムの実際課金値との照合は週次ガバナンスにて実施する
- 降格順序:
  1) Deep Review を無効化
  2) 並列レビューを無効化
  3) 低コストモードへ切替
  4) 最小結果レスポンスを返却

FR-06 逸脱検知と補正
- 各フェーズ終了時に、出力をタスク契約と比較する。
- 逸脱ルール:
  - hard drift: 必須制約違反、または must-have の done criterion 未達
  - soft drift: 任意条件の部分的不一致
- hard drift は再計画または補正指示を必須とする。
- 逸脱スコア:
  - hard drift score = must-have 違反1件につき 1
  - soft drift score = 任意不一致1件につき 1
  - hard drift score >= 1 または soft drift score >= 3 でエスカレーション
- 補正ループ上限:
  - hard drift を含む場合、フェーズごとの逸脱補正試行回数上限 = 2
  - soft drift のみの場合、フェーズごとの逸脱補正試行回数上限 = 3
  - 超過時は FR-09 の人手引き継ぎを実施

FR-07 二段階レビュー
- Stage 1（Fast Gate）: 重大リスクの高速チェックを行う。
- Stage 2（Deep Review）: Stage 1で重大/高リスクが検出された場合、またはユーザーが深掘りを要求した場合のみ実行する。
- Stage 1 Fast Gate チェックリスト:
  - 必須ハンドオフ項目が存在し妥当である
  - must-have 制約が未違反である
  - out-of-scope 拡張率 <= 30%
  - 明白な重大パターン（秘密情報漏えい、インジェクション兆候）がない
  - acceptance tests のカバレッジ欠落がない
- Stage 2 起動条件:
  - Stage 1 で critical fail が1件以上
  - またはユーザーが明示的に深掘りレビューを要求
- 補足:
  - complex 判定のみを理由とした Stage 2 強制は行わない（速度/コスト最適化のため）
  - ただし high risk 領域（認証、秘密情報、課金、データ整合性）を含む場合は Stage 2 を必須とする

FR-07a Deep Review の必須/任意分離
- 必須チェック:
  - ローカルで実施可能な静的レビュー
  - タスク契約との整合性検証
- 任意チェック:
  - 外部APIや外部スキャナに依存するレビュー
- 外部依存が利用不能な場合でも、必須チェックは継続する
- deferred になった任意チェックは、breaker_state が closed に戻った時点、または 24 時間経過時点で再試行しなければならない。
- deferred 項目が未消化のまま完了判定へ進む場合は、review-report.md に deferred 理由と再試行計画を記録しなければならない。

FR-07b 高リスク領域の検出
- high risk 領域は、ファイルパス、変更対象、キーワード、機能分類のいずれかで判定しなければならない。
- 判定ルールは design.md の高リスク領域マトリクスと一致していなければならない。
- high risk に該当した場合、Deep Review はコストガードにより無効化してはならない。

FR-08 フェイルセーフとフォールバック
- タイムアウトまたはツール障害時の処理:
  - 回数上限付き指数バックオフ再試行（最大2回）
  - 直列モードへフォールバック
  - status、completed_steps、blocked_steps、recommended_next_action を含む最小結果レスポンスへフォールバック
- 最小結果レスポンスのJSON必須項目:
  - status
  - completed_steps
  - blocked_steps
  - failure_reason
  - budget_state
  - recommended_next_action

FR-08a 外部依存サーキットブレーカ
- MCPや外部APIなどの外部依存呼び出しに対して、以下の状態遷移を適用する。
  - closed: 通常実行
  - open: 一時的に呼び出し停止し、即時フォールバック
  - half_open: 試行呼び出しで復旧判定
- open 遷移条件:
  - 連続失敗回数 >= 3、または
  - タイムアウト率が直近ウィンドウで 50% 以上
- open 中の動作:
  - 外部呼び出しをスキップし、キャッシュまたは最小結果レスポンスで継続
- half_open 復帰条件:
  - 待機時間経過後に試行成功した場合は closed に戻す
- Deep Review 連携ルール:
  - breaker_state = open の場合、外部依存レビューは deferred として記録する
  - deferred 時も FR-07a の必須チェックは実行する

FR-09 人手引き継ぎ
- 補正ループ上限に到達した場合、簡潔なインシデント要約付きで手動レビューへエスカレーションする。

FR-10 機能調査トリガー
- 新しい必須機能が要求され、実現性が不確実な場合は、対象を絞った外部調査を実施しなければならない。
- 十分な確信があり、未解決の技術的不確実性がない場合は外部調査を省略可能とする。
- 調査トリガー判定:
  - 内部前例がない、または未解決の実現性リスクがある場合は調査実施
  - 内部前例があり、リスクが十分に限定できる場合は調査省略
- 調査制約:
  - 最大8分
  - 焦点化クエリ最大6件
  - 独立した情報源数はリスク区分で決定
    - 高リスク変更: 2件以上
    - 低〜中リスク変更: 1件以上
  - 高リスク変更は最大12分まで拡張可

FR-11 複数案提示
- 実現可能な実装案を最低2案提示しなければならない。
- 各案には以下を含めること:
  - 技術アプローチ概要
  - メリット
  - デメリット
  - リスクレベル
  - 遅延影響見積
  - コスト影響見積
- 案テンプレート必須項目:
  - 依存関係
  - 運用複雑度
  - ロールバック複雑度

FR-12 ユーザー意思決定ゲート
- 複数案提示後、ユーザーの明示的な方針決定を必須とする。
- ユーザー方針が確定するまで、要求定義、要件定義、デリバリープラン、設計を最終確定してはならない。
- 有効な意思決定状態:
  - selected_option
  - selected_hybrid_option
  - request_more_options
  - postpone
- 意思決定状態が最終でない場合、成果物の最終化はブロックし続ける。
- Decision SLA:
  - pending の既定SLAは 4 時間
  - 4 時間超過で催促通知
  - 24 時間超過で suspended に遷移し、週次ガバナンス対象とする

FR-12a 意思決定監査ログ
- decision_pending に入る直前に DECISION_GATE_OPENED イベントを記録しなければならない。
- ユーザー選択時は DECISION_RECORDED イベントを記録し、selected_option、approver、timestamp を保持しなければならない。
- postpone の場合は、次回確認日時または保留理由をログへ残さなければならない。

FR-13 意思決定後の上流成果物パイプライン
- ユーザー方針の確定後、次の順序で成果物を生成または更新する。
  1) 要求定義
  2) 要件定義
  3) デリバリープラン
  4) 設計
- それぞれの成果物は、以下の対応ファイルに反映しなければならない。
  - 要求定義: requirements-definition.md
  - 要件定義: system-specification.md
  - デリバリープラン: delivery-plan.md
  - 設計: design.md

FR-13c 自動進行ルール
- ユーザーから追加情報、意思決定、または明示的承認が本質的に必要な場合を除き、システムは次工程へ自動で進行しなければならない。
- 通常の成果物更新、既定ポリシーに基づくレビュー実行、既定フロー内の工程遷移については、個別の許可確認を行ってはならない。
- 自動進行を停止できるのは、情報不足、方針未確定、権限不足、または安全性上の理由がある場合に限る。

FR-13d 工程順序強制ゲート
- Coordinator は、意思決定確定後に以下の順序以外での遷移を禁止しなければならない。
  1) 要求定義
  2) 要件定義
  3) デリバリープラン
  4) 設計
  5) 実装
  6) レビュー
- 順序違反、工程スキップ、未確定工程からの下流遷移を検知した場合は遷移をブロックし、監査ログへ記録しなければならない。
- 実装制約: 工程遷移ブロックは Coordinator エージェントの Instructions 指示および `.github/hooks/artifact-gate.json` の PreToolUse Hook による抑止で実現する。プラットフォームレベルの確定的強制ではなく、LLM がシステム指示に従うことを前提とする。確定的強制が必要な場合は VS Code Extension 開発が必要となりスコープ外となる。

FR-13e 成果物更新完了ゲート
- 各工程は、対応成果物ファイルの作成または更新完了が確認されるまで完了として扱ってはならない。
- 次工程への遷移判定では、少なくとも次を検証しなければならない。
  - 対応ファイルの存在
  - 更新時刻の整合
  - decision_id および sync_status の整合
- レビュー工程では review-report.md の更新完了と承認/差し戻し判定の記録を遷移条件に含めなければならない。

FR-13a 実装開始ゲート
- 実装は、FR-13 の4成果物が更新済みである場合にのみ開始できなければならない。
- known_pattern で軽微変更の場合でも、影響を受ける成果物の差分確認を省略してはならない。
- 上流成果物に未解決の矛盾、未承認事項、空欄の must-have 項目がある場合、実装をブロックしなければならない。
- 各成果物は、更新日時、decision_id、sync_status を保持し、Coordinator が planning 開始前に検証できなければならない。
- 差分確認は少なくとも以下で行うこと。
  - 更新時刻が current decision_id より古くないこと
  - must-have 制約に未反映差分がないこと
  - known_pattern の場合でも comment / whitespace 以外の差分有無を確認すること

FR-13b 下流工程からの出戻り制御
- 実装またはレビューで発見された問題は、原因に応じて次の工程へ出戻りしなければならない。
  - goal / constraints / scope の矛盾: 要求定義
  - acceptance criteria / must-have 条件不足: 要件定義
  - 実装順序 / 依存関係 / マイルストーン誤り: デリバリープラン
  - アーキテクチャ不整合 / 非機能要件未達: 設計
  - 実装修正のみで解消可能な欠陥: 実装
- 出戻り時は、影響を受ける下流成果物を再評価し、必要なファイル更新を完了してから再開しなければならない。
- 出戻り理由、戻り先工程、更新対象ファイルは監査ログへ記録しなければならない。
- 出戻り発生時、戻り先より下流の成果物は stale 扱いにし、review-report.md を含めて再承認前は確定扱いとしてはならない。
- stale 化した成果物は削除せず、ARTIFACT_INVALIDATED イベントとともに理由を記録しなければならない。

FR-14 フェーズ結果キャッシュ
- PlannerおよびReviewerの結果は、再利用可能条件を満たす場合にキャッシュ再利用する。
- 再利用条件:
  - 入力タスク契約のセマンティックハッシュ一致
  - 対象差分のセマンティックハッシュ一致
  - キャッシュTTL以内
- 再利用禁止条件:
  - must-have制約変更あり
  - high risk 領域変更あり
  - ユーザーが再評価を明示要求
- キャッシュヒット時は該当フェーズを短絡し、利用ログを残す。
- セマンティックハッシュ方針:
  - コメント、空白、非本質的な並び順差分は無視する
  - must-have 制約とビジネスロジック差分を優先して判定する

FR-15 エピソード記憶記録
- タスク完了時、Coordinator は Episode Writer を呼び出し、episodes/<task-id>.md に以下を構造化記録しなければならない。
  - task_contract
  - 採用案と選定理由
  - 発生した drift と補正内容
  - レビュー指摘と解決結果
  - known_pattern / new_capability の分類
- hard drift が未解消のタスクは、記憶へ書き込んではならない。
- 上流工程へ出戻りしたタスク、または stale 成果物を含むタスクは、エピソード記録をブロックし、MEMORY_BLOCKED_ROLLED_BACK イベントを記録しなければならない。

FR-16 蒸留パイプライン
- episodes/ 内の件数が既定閾値に達した場合、またはセッション終了時に Distillation Worker を起動できなければならない。
- 蒸留処理は以下を実施すること。
  - 後続タスクに再利用可能な知見の抽出
  - Tier-2 パターンとの類似度比較
  - 類似パターンへのマージ、または適切なカテゴリへの追記
  - 蒸留済みエピソードの archive/ への移動
- 蒸留の実行失敗時は episodes/ を削除せず、再実行可能な状態を維持しなければならない。

FR-17 メモリ取得とトークン予算制御
- Memory Retriever は、現タスク情報に最低 50% のコンテキスト予算を確保しなければならない。
- Tier-1 Core は常時ロードし、Tier-2 / Tier-3 は関連度上位のみ取得する。
- 総メモリロード量がコンテキストウィンドウの 20% を超える見込みの場合、Tier-3 の取得件数を自動削減しなければならない。
- known_pattern はキーワード重みを上げ、new_capability はセマンティック重みを上げる Hybrid Retrieval を採用しなければならない。

FR-18 記憶競合解決
- 同一パターンに矛盾する記憶が存在する場合、タイムスタンプと特異性に基づいて優先順位を決定しなければならない。
- 解決不能な場合は conflict=true として保持し、ユーザーまたはレビュアーに提示しなければならない。
- 競合の発生と解決結果はイベントとして記録しなければならない。

FR-19 イベント層と再構成
- すべてのメモリ変更は、状態変更前に append-only のイベントとして audit_log/ に記録しなければならない。
- イベントには timestamp、type、source、payload、ref を必須項目として含める。
- 初期状態とイベント列から任意時点のメモリ状態を再構成できなければならない。
- 再構成失敗時は最新スナップショットに退避し、差分不整合をアラートとして残さなければならない。

FR-19a 監査ログ最低仕様
- audit_log/ は JSONL 形式とし、1 行 1 イベントで保存しなければならない。
- 各イベントは少なくとも以下を含むこと。
  - event_id
  - timestamp_utc
  - event_type
  - actor_role
  - phase
  - task_id または decision_id
  - status
  - payload
  - correlation_id
- breaker_state の遷移、decision 状態遷移、rollback、artifact invalidation は必須イベントとして記録しなければならない。

FR-20 メモリアクセス運用ポリシー
- suspended 状態では Tier-1 / Tier-2 の読み取りのみを許可し、episodes/ への新規書き込みを禁止しなければならない。
- ロールバック時は、指定時点までのイベント再生によりメモリ状態を復元できなければならない。
- 埋め込みモデル変更時は、index.json 上のモデルバージョン差異を検知し、再計算キューへ投入しなければならない。

FR-21 レビュー成果物記録
- レビュー完了時、システムは review-report.md を作成または更新しなければならない。
- review-report.md には少なくとも以下を含めること。
  - 監査ヘッダ（report_id、task_id、reviewer、review 時刻）
  - 対象成果物
  - 受け入れ基準検証結果
  - high risk 判定結果
  - 検出事項一覧
  - 承認、差し戻し、要出戻り、deferred の判定
  - 出戻り先工程、理由、stale 成果物
  - approver と audit_event_ref
- 問題なしの場合でも、承認記録を残さなければならない。

FR-24 suspended 状態の運用ポリシー
- suspended 状態では、新規実装とレビュー開始を禁止しなければならない。
- resumed するには、意思決定の確定または明示的な中止判断が必要である。
- suspended が 7 日を超えた場合は、週次ガバナンスで再評価し、resume / cancel / postpone を記録しなければならない。

FR-25 トレーサビリティ同期
- システムは、UR -> BR -> FR/NFR/OR -> AC -> review-report の対応を追跡可能に保持しなければならない。
- 各レビュー記録には、少なくとも source_ur_id、mapped_br_id、validation_ac_id を含めなければならない。
- 要件変更時は、影響を受ける対応マップを更新しなければならない。

FR-26 UAT シナリオ実行
- システムは、Simple / Medium / Complex ごとに最低1件の代表シナリオを保持し、受け入れ判定時に実行結果を記録しなければならない。
- UAT 判定結果は、pass / fail / conditional-pass を明示し、fail の場合は出戻り先工程を指定しなければならない。

FR-27 変更要求（Change Request）処理
- 要求・要件・設計の意味変更が発生した場合、Change Request を起票し、影響分析を経て承認後に反映しなければならない。
- Change Request には少なくとも change_reason、affected_artifacts、affected_kpis、approval_status を保持しなければならない。
- 閾値や判定規則を変更した場合、変更前後の比較根拠を監査ログへ記録しなければならない。

## 3. 非機能要件
NFR-01 性能
- パイロット環境における medium タスクのエンドツーエンド p50 は 70 秒以下。
- p90 は週次で計測し報告する。
- pending および suspended 状態の待機時間は KPI-1 の計測対象から除外する。

NFR-02 コスト管理
- 各フェーズの前後で premium request 予算上限を強制すること。
- premium request 超過インシデントは全実行の 2% 未満。
- コスト算定は model_multiplier ベースで行い、トークン長の増減は算定対象外とする。
- premium request 計測は Coordinator による推計値（planned_user_prompts × model_multiplier の累積）とし、週次ガバナンスで GitHub Copilot 使用量ページとの照合を実施して精度を検証すること。超過インシデント 2% 未満の評価は推計値ベースで行い、照合後に実績値との乖離があった場合は次サイクルで補正する。

NFR-03 品質
- 厳選ベンチマークタスクにおける重大問題検出率は 95% 以上。

NFR-04 一貫性
- すべてのフェーズ遷移で、契約必須項目の整合率は 100%。

NFR-05 可観測性
- 実行ごとの必須ログ項目:
  - run_id、phase、selected_model、start_time、end_time
  - retries、timeout_flag、budget_before、budget_after
  - drift_result、fallback_trigger、final_status
- 追加ログ項目（高ROI機能向け）:
  - breaker_state（closed/open/half_open）
  - cache_hit（true/false）
  - parallel_cap_applied（1/2/3）
  - decision_state
  - rollback_target_phase
  - artifact_sync_status

NFR-06 信頼性
- 外部連携障害でワークフローが停止してはならない。
- 終端障害時でも有効な最小結果レスポンスを返却しなければならない。

NFR-07 意思決定トレーサビリティ
- 各案提示サイクルで、以下をログに記録する。
  - 参照した調査ソース
  - 検討した選択肢
  - ユーザー選択案
  - 最終方針の理由
- 保持期間:
  - パイロットフェーズでは意思決定ログを最低90日保持

NFR-08 メモリ予算管理
- Tier-1 Core の常時ロードは 2,000 トークン以内に収めること。
- Tier-2 / Tier-3 の取得は、総メモリロード量がコンテキストウィンドウの 20% を超えないよう制御すること。

NFR-09 メモリ再構成性
- 監査対象期間内の任意 task_id について、イベント再生によりメモリ状態を再現できること。
- イベント欠損率は 0% とし、欠損検知時は実行を degraded 扱いで記録すること。

NFR-10 メモリ保持と削除
- episodes/ は作成から 30 日で archive/ へ移行すること。
- archive/ はロード対象外とし、保持期間は既定 90 日以上とすること。
- Tier-2 パターンは削除ではなく更新を原則とし、履歴参照可能な形で保持すること。

NFR-11 索引整合性
- index.json は、メモリ作成・更新・削除・アーカイブの各操作後に整合した状態で更新されなければならない。
- embedding_hash、access_count、conflict フラグ、embedding_model_version を保持しなければならない。

NFR-12 監査ログ完全性
- 監査ログの欠損率は 1% 未満でなければならない。
- 必須イベント（工程遷移、decision、rollback、artifact invalidation）の欠損は 0 件でなければならない。

NFR-13 再開性と継続性
- 途中失敗からの再開成功率は 95% 以上でなければならない。
- 外部障害発生時の縮退継続率は 90% 以上でなければならない。

## 4. 運用要件
OR-01 ループ上限
- 実装とレビューの補正往復回数上限: 3
- フェーズ内の逸脱補正ループ回数上限:
  - hard drift を含む場合: 2
  - soft drift のみの場合: 3

OR-02 タイムアウトポリシー
- Planner: 15秒
- Implementer: 60秒
- Fast review: 20秒
- Deep review: 60秒
- タイムアウト時フォールバックルール:
  - 同一フェーズで2回タイムアウトした場合、任意作業をスキップして最小結果レスポンスを返却
- 外部依存障害時の追加ルール:
  - サーキット open 中は外部呼び出しを抑止し、ローカル処理優先で継続
- 注記:
  - 本ポリシーの秒数はローカル制御目標であり、Copilotサービス側レスポンス時間の保証値ではない

OR-07 Copilot仕様追随
- 利用可能モデル、model_multiplier、included model の定義は GitHub Docs の最新情報を正とする。
- 週次ガバナンスで次を確認し、変更があればルーティング表と予算閾値を更新する。
  - supported models の更新
  - model multipliers の更新
  - model retirement / replacement の更新
- 退役予定モデルを使用中の場合、退役日までに代替モデルへ切替計画を確定しなければならない。

OR-03 週次ガバナンス
- 週次で次の4軸をレビューする。
  - latency
  - cost
  - drift
  - retries/fallback rate
- 閾値変更履歴を残しながら閾値を更新する。
- ロールバック条件:
  - サンプル数 30 件以上を前提に、KPI-1〜KPI-6 のいずれかが基準比で 10%以上悪化した場合、直前設定へ戻す
- コスト照合: Coordinator の推計消費量と GitHub Copilot 使用量ページ（または GitHub API）の実績値を照合し、乖離率を記録してモデル別の推計精度を更新すること。

OR-08 日次Runbook
- 日次で次を確認し、閾値超過時に一次対応を行う。
  - 失敗タスク件数
  - 手動引き継ぎ件数
  - 予算警告件数
- 是正必須閾値（現行比 +20%）超過が発生した場合、当日中に暫定是正策を適用しなければならない。

OR-09 Change Request 運用
- Change Request は起票、影響分析、承認、反映、レビューの順で処理しなければならない。
- 承認者は tech lead または指定 reviewer とし、却下時は理由を記録しなければならない。
- 反映後はトレーサビリティマップを再同期し、関連 AC を再評価しなければならない。

OR-04 案比較フォーマット
- 複数案提示は、比較可能性を担保するため固定テンプレートに従うこと。
- 意思決定要求は明示的で、選択肢を含めること。
- 必須選択肢:
  - Option A
  - Option B
  - Hybrid/custom
  - Request more research

OR-04a 成果物更新ルール
- 各工程の完了条件には、対応ファイルの作成または更新が含まれなければならない。
- 既存ファイルがない場合は新規作成し、存在する場合は最新版として更新すること。
- 出戻りが発生した場合、戻り先より下流にある成果物は stale 扱いとし、再確認完了まで未確定とすること。
- stale 成果物は review-report.md に列挙し、再承認完了まで sync_status=stale として扱うこと。
- 自動進行可能な工程では、完了条件を満たした時点で次工程へ遷移すること。

OR-05 段階的リリース
- Week 0 でベースライン計測を完了し、baseline-metrics を固定する。
- Week 1 は Coordinator、Planner、Implementer、Fast Gate の基本フローのみを本番相当評価対象とする。
- Week 2 で Event Ledger を有効化し、サンプリングで再生検証を行う。
- Week 3 で Episode Writer を有効化し、episodes/ 記録を開始する。
- Week 4 で Distillation Worker を限定有効化し、失敗時は手動再実行へフォールバックする。
- Phase 3 判定は、8週以降に KPI-1、KPI-3、KPI-4 の改善実績を確認して行う。
- 各週の完了条件は delivery-plan.md の週次受け入れ条件と一致していなければならない。

OR-06 メモリ運用保守
- 蒸留前後でパターン数が閾値以上に減少した場合、警告を発して元エピソードを一時保持すること。
- 埋め込みモデル変更時は、Tier-2 / Tier-3 の再インデックス計画を週次ガバナンスで承認すること。
- conflict=true の記憶は、週次レビューで解消優先度を判定すること。

## 5. テスト可能な受け入れ基準
AC-01 意図保持
- Given: 明示的な制約を含む要求がある
- When: ワークフローが完了する
- Then: すべての必須制約が満たされ、ログ記録される

AC-02 条件付き並列切替
- Given: 閾値未満の小規模タスク
- When: 実行開始
- Then: 直列実行になる
- Given: 並列条件を満たす大規模タスク
- Then: 設定された並列分岐が有効になる
- Then: 適用された並列上限（1/2/3）がログに記録される

AC-03 コスト上限挙動
- Given: 予算上限付近のタスク
- When: 予測使用量が上限を超える
- Then: システムは降格し、理由を記録する
- Then: 降格順序と選択された段階がログに残る

AC-04 フォールバック挙動
- Given: ツールタイムアウト
- When: 再試行上限に達する
- Then: システムは異常終了せず最小結果レスポンスを返却する
- Then: 返却JSONには FR-08 の必須項目がすべて含まれる

AC-09 サーキットブレーカ挙動
- Given: 外部依存呼び出しが連続失敗する
- When: 失敗閾値に到達する
- Then: breaker_state は open に遷移し、外部呼び出しは抑止される
- Then: half_open 試行成功時に closed へ復帰する

AC-10 フェーズ結果キャッシュ
- Given: タスク契約の主要フィールド（goal / must-have constraints / complexity_class）がセマンティックに一致し、TTL内である
- When: 同等タスクを再実行する
- Then: PlannerまたはReviewerフェーズはキャッシュ再利用される
- Then: cache_hit=true がログに記録される
- 実装制約: ハッシュ計算は LLM によるセマンティック比較または Hook スクリプトの SHA256 で代行する。完全一致ではなくセマンティック類似度での判定となるため、誤検知（数%）が生じる可能性がある。

AC-05 逸脱補正
- Given: フェーズ終了時に hard drift が発生
- When: 逸脱チェックが実行される
- Then: 次フェーズへ進む前に補正アクションが起動する

AC-06 複数案提示要件
- Given: 実現性が未確定な新規必須機能要求
- When: 実装前分析を実行
- Then: メリット/デメリットと影響見積を含む実現可能案を最低2案返す
- Then: 高リスク変更では、意思決定ログに独立した情報源が最低2件記録される
- Then: 低〜中リスク変更では、意思決定ログに高信頼ソースが最低1件記録される

AC-07 ユーザー意思決定ゲート強制
- Given: 複数案提示が完了している
- When: ユーザー方針が未確定
- Then: 要求定義/要件定義/計画/設計の最終確定は行われない

AC-08 意思決定後パイプライン
- Given: ユーザー方針が確定している
- When: 成果物生成を実行
- Then: 要求定義、要件定義、デリバリープラン、設計が順序どおりに生成または更新される
- Then: 各成果物更新は selected decision_id を参照する

AC-08a 実装開始条件
- Given: ユーザー方針が確定している
- When: 実装開始を判定する
- Then: requirements-definition.md、system-specification.md、delivery-plan.md、design.md が更新済みでなければ開始できない

AC-08b 出戻り制御
- Given: レビューで非機能要件未達が検出された
- When: 是正フローを開始する
- Then: 工程は設計へ戻される
- Then: 設計更新後に、必要な下流成果物が再確認される

AC-08c stale 成果物管理
- Given: 実装またはレビューで上流出戻りが発生している
- When: Coordinator が成果物状態を更新する
- Then: 戻り先より下流の成果物は stale として記録される
- Then: stale 状態のまま planning / implementation を再開してはならない

AC-11 既知パターン短絡
- Given: 要求分類が known_pattern である
- When: トリアージを実行する
- Then: FR-12 の意思決定ゲートは省略され、通常フローへ進む

AC-12 pending SLA
- Given: 意思決定状態が pending である
- When: 4 時間を超える
- Then: 催促通知が発行される
- When: 24 時間を超える
- Then: 状態は suspended となり、週次ガバナンス対象になる

AC-13 エピソード記憶記録
- Given: hard drift が解消されたタスクが完了している
- When: タスク完了処理が走る
- Then: episodes/<task-id>.md に task_contract、採用案、drift 補正、レビュー結果が記録される
- Then: 対応する INDEX_UPDATE または EPISODE_WRITE イベントが audit_log/ に残る

AC-14 蒸留とアーカイブ
- Given: episodes/ に閾値以上のエピソードが存在する
- When: 蒸留パイプラインを実行する
- Then: Tier-2 パターンが更新または追加される
- Then: 蒸留済みエピソードは archive/ へ移動し、失敗時は episodes/ に残る

AC-15 メモリ取得予算制御
- Given: コンテキスト予算が逼迫する長文タスクがある
- When: Memory Retriever が候補をロードする
- Then: 現タスク情報の予算が 50% 以上維持される
- Then: Tier-3 の取得件数が自動的に削減される

AC-16 記憶競合解決
- Given: 同一パターンに矛盾する2件の記憶がある
- When: 競合解決を実行する
- Then: 新しいかつ具体的な記憶が優先される
- Then: 解決不能なら conflict=true で保持され、ユーザー提示対象になる

AC-17 イベント再構成
- Given: 特定時点までの audit_log/ と初期状態がある
- When: 任意時点の再構成を実行する
- Then: その時点のメモリ状態が決定論的に再現される
- Then: 欠損イベントがある場合は degraded として記録される

AC-18 レビュー成果物作成
- Given: レビュー工程が完了している
- When: レビュー結果を確定する
- Then: review-report.md に判定、検出事項、出戻り先が記録される
- Then: 問題なしの場合も承認記録が残る
- Then: 受け入れ基準検証結果、high risk 判定、deferred 情報、audit_event_ref が含まれる

AC-19 意思決定監査記録
- Given: Decision Gate が開始される
- When: ユーザーが選択または postpone を行う
- Then: DECISION_GATE_OPENED と DECISION_RECORDED が audit_log/ に記録される

AC-20 同倍率モデル選定
- Given: 同一 model_multiplier の候補モデルが複数存在する
- When: ルーティング判定を実行する
- Then: FR-04a の優先順に従ってモデルが選定される
- Then: 比較に使用した指標と選定理由が監査ログに記録される

AC-21 工程順序と成果物ゲート
- Given: 意思決定が確定している
- When: Coordinator が工程遷移を判定する
- Then: FR-13d の順序違反またはスキップ遷移はブロックされる
- Then: FR-13e の成果物更新完了条件を満たさない場合、次工程へ遷移しない

AC-22 トレーサビリティ整合
- Given: 要件変更またはレビュー完了時
- When: トレーサビリティ同期を実行する
- Then: source_ur_id、mapped_br_id、validation_ac_id が review-report に記録される
- Then: 不整合がある場合は release 判定をブロックする

AC-23 UAT 実施
- Given: 受け入れ判定フェーズ
- When: UAT を実行する
- Then: Simple / Medium / Complex の代表シナリオ結果が記録される
- Then: fail の場合は出戻り先工程が記録される

AC-24 Change Request 管理
- Given: 閾値または判定規則の変更要求がある
- When: Change Request を処理する
- Then: change_reason、affected_artifacts、affected_kpis、approval_status が記録される
- Then: 承認前に本番運用設定へ反映してはならない

## 6. 実装メモ（VS Code整合）
- preview/experimental 依存機能は feature flag 配下の任意機能として扱う。
- 重大ゲートは静的安全制御とCIチェックを優先する。
- hooks は補助自動化として利用し、唯一の安全境界にしない。
- MCP統合はフォールバック経路を明確化した上で分離実装する。
- メモリ更新は VS Code ワークスペース内ファイルと append-only ログの両方で確認可能であること。

## 7. 設計引継ぎ方針
- Coordinator の制御は、自然言語だけに依存せず、状態機械とポリシーテーブルで定義する。
- フェーズ状態、意思決定状態、サーキットブレーカ状態、キャッシュ状態を明示的に持つ。
- Deep Review は必須チェックと任意チェックに分離し、外部依存障害時も最低限の品質担保を維持する。
- メモリ系コンポーネントは Coordinator 配下の独立サービスとして設計し、失敗時も主ワークフローを停止させない。
- 上流成果物の確定前に実装へ進まない制御と、下流検知事項に応じた出戻り制御を状態機械へ含める。
