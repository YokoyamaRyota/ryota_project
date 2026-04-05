# Agent System Flow

以下は、現時点の要求定義・要件定義・粗設計をもとに整理した agent system の主要フローである。

```mermaid
flowchart TD
    Start([ユーザー要求])
    Analyze["request_analysis<br/>Request Analyzer"]
    Triage{"要求分類"}
    Known["known_pattern"]
    NewCap["new_required_capability"]
    Ambiguous["ambiguous_request"]

    Decision["decision_pending<br/>Decision Gate"]
    Prompt["4時間超過で催促"]
    Suspended(["24時間超過で suspended"])
    Resume["意思決定確定"]

    ReqDef["requirements_definition<br/>requirements-definition.md"]
    ReqSpec["requirements_specification<br/>system-specification.md"]
    Delivery["delivery_planning<br/>delivery-plan.md"]
    Design["design_definition<br/>design.md"]
    Ready{"上流成果物が<br/>確定済みか"}
    Plan["planning<br/>Planner + Cache Manager"]
    Cache{"再利用可能な<br/>フェーズ結果あり"}
    Policy["Policy Engine<br/>複雑度・予算・遅延・breaker参照"]
    CostPre["Cost Guard<br/>実行前チェック"]
    Implement["implementation<br/>Implementer"]
    Timeout{"タイムアウト2回?"}
    Minimal(["最小結果レスポンス返却"])

    Drift["Drift Detector<br/>hard / soft drift 評価"]
    NeedFix{"修正ループが必要?"}
    LoopGuard{"ループ上限超過?"}
    Replan{"どこへ戻す?"}
    BackReq["要求定義へ戻す"]
    BackSpec["要件定義へ戻す"]
    BackDelivery["デリバリープランへ戻す"]
    BackDesign["設計へ戻す"]
    BackImpl["実装へ戻す"]
    Handoff(["人手引き継ぎ"])

    Fast["fast_review<br/>重大リスク検知"]
    NeedDeep{"Deep Review 必須?"}
    Deep["deep_review<br/>必須チェック + 任意チェック"]
    Breaker{"breaker_state = open ?"}
    Deferred["任意外部チェックを deferred"]

    ReviewDone{"レビュー結果は<br/>上流出戻りを要するか"}
    Artifact["completion + memory logging"]
    Complete(["complete"])

    Start --> Analyze --> Triage
    Triage --> Known --> ReqDef
    Triage --> NewCap --> Decision
    Triage --> Ambiguous --> Decision

    Decision --> Prompt
    Decision --> Suspended
    Decision --> Resume --> ReqDef

    ReqDef --> ReqSpec --> Delivery --> Design --> Ready
    Ready -->|いいえ| ReqDef
    Ready -->|はい| Plan

    Plan --> Cache
    Cache -->|はい| Fast
    Cache -->|いいえ| Policy --> CostPre --> Implement

    Implement --> Timeout
    Timeout -->|はい| Minimal --> Complete
    Timeout -->|いいえ| Drift

    Drift --> NeedFix
    NeedFix -->|はい| LoopGuard
    LoopGuard -->|はい| Handoff
    LoopGuard -->|いいえ| Replan
    NeedFix -->|いいえ| Fast

    Replan -->|要求起因| BackReq
    Replan -->|要件起因| BackSpec
    Replan -->|計画起因| BackDelivery
    Replan -->|設計起因| BackDesign
    Replan -->|実装修正のみ| BackImpl
    BackReq --> ReqDef
    BackSpec --> ReqSpec
    BackDelivery --> Delivery
    BackDesign --> Design
    BackImpl --> Implement

    Fast --> NeedDeep
    NeedDeep -->|不要| ReviewDone
    NeedDeep -->|要| Deep --> Breaker
    Breaker -->|はい| Deferred --> ReviewDone
    Breaker -->|いいえ| ReviewDone

    ReviewDone -->|要求起因| BackReq
    ReviewDone -->|要件起因| BackSpec
    ReviewDone -->|計画起因| BackDelivery
    ReviewDone -->|設計起因| BackDesign
    ReviewDone -->|実装修正のみ| BackImpl
    ReviewDone -->|問題なし| Artifact

    Artifact --> Complete

    classDef terminal fill:#d8f3dc,stroke:#2d6a4f,stroke-width:1.5px,color:#1b4332;
    classDef state fill:#e9f1ff,stroke:#355070,stroke-width:1.2px,color:#1f2937;
    classDef decision fill:#fff3bf,stroke:#8d6e00,stroke-width:1.2px,color:#3b2f00;
    classDef risk fill:#fde2e4,stroke:#9d0208,stroke-width:1.2px,color:#5f0f40;

    class Start,Suspended,Minimal,Handoff,Complete terminal;
    class Analyze,Known,NewCap,Ambiguous,Prompt,Resume,ReqDef,ReqSpec,Delivery,Design,Plan,Policy,CostPre,Implement,Drift,BackReq,BackSpec,BackDelivery,BackDesign,BackImpl,Fast,Deep,Deferred,Artifact state;
    class Triage,Decision,Ready,Cache,Timeout,NeedFix,LoopGuard,Replan,NeedDeep,Breaker,ReviewDone decision;
```

補足:
- known_pattern は意思決定ゲートを省略できるが、要求定義から設計までの成果物差分確認は省略しない。
- new_required_capability と ambiguous_request は、意思決定または要求確定を経て、要求定義から設計までの上流成果物を更新してから実装に進む。
- complex だけでは Deep Review を必須化せず、高リスクまたは Fast Gate 重大検知時に限定する。
- breaker が open の場合でも必須レビューは継続し、任意の外部チェックのみ deferred とする。
- レビューや drift により上流原因が判明した場合は、該当工程へ出戻りし、関連成果物を更新してから再実行する。
