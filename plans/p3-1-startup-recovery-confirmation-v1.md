# P3.1 启动恢复确认规范 v1

制定对象：Q小虎 / 二两 / 猫爸协作链路
适用范围：共享启动恢复、返工接手、跨会话续跑、状态追问前的自检
前置依赖：`plans/p2-writing-protocol-v1.md`、`plans/p3-supervision-mechanism-v1.md`、`outputs/execution-checklist-v2.md`、`outputs/stage3-retrospective-v1.md`
版本目标：把“我知道接下来要做什么”升级成“我能证明这件事已经真正开始、正在推进、还是其实已经停住了”。

---

## 0. 一句话目标

启动恢复不只恢复意图，还要恢复执行真相：每个未收口承诺都必须重新判定它是 `intent`、`started`、`in_progress` 还是 `done`，并且给出消息来源与执行证据。

---

## 1. 为什么需要这一层

前两层已经解决了两件事：

1. 共享事实放到同一个可读源里。
2. 主任务、开放回路、当前不该做什么，能够在启动时被读出来。

但还缺一层关键确认：

- “已经说过会做” 不等于 “已经开始做”。
- “前台说在处理” 不等于 “后台真的还在跑”。
- “我记得这段话” 不等于 “这段话是对方刚给我的新指令”。

所以 P3.1 的职责不是再多记一份，而是把“承诺”和“可观察执行”绑定起来。

---

## 2. 本层要解决的 5 个问题

### 2.1 状态分层

每个未收口事项只能处于以下 4 个主状态之一：

- `intent`：只有意图、指令或承诺，还没有可信执行证据。
- `started`：已经出现首个执行动作，但还不足以证明持续推进。
- `in_progress`：已有连续执行证据，事项仍未收口。
- `done`：交付物、验证或收口记录已经落下，事项可关闭。

### 2.2 待兑现承诺跟踪

凡是已经对外说过“我会做 / 我正在补 / 我稍后给你”的内容，都要落成可恢复的 pending promise，而不是散在聊天里。

### 2.3 消息来源校验

恢复时必须区分：

- 这是猫爸给的新指令。
- 这是我自己上一轮发出去的状态更新。
- 这是二两的审核/返工意见。
- 这是共享文件里的状态快照。

不允许把自己上一轮发出的内容，当成别人刚发来的新输入。

### 2.4 执行证据校验

状态前进必须靠证据，而不是靠措辞。没有证据，就不能把事项说成“正在进行”。

### 2.5 静默 / 卡住检测

如果一个事项长时间没有新证据、超过承诺 ETA、或者只有口头状态没有执行痕迹，就必须显式标成 `stalled` 风险，而不是继续报平安。

---

## 3. 核心对象：Promise Item

本层最小跟踪单位叫 `Promise Item`，表示一条还没完全收口的承诺、任务或返工项。

一个 `Promise Item` 至少包含：

- `id`：稳定 ID。
- `title`：一句话说明是什么事。
- `owner`：当前责任方。
- `source_kind`：来源类型。
- `provenance`：这条事最初来自谁、在哪个通道、方向是什么。
- `state`：`intent | started | in_progress | done`。
- `promise_status`：`pending | fulfilled | cancelled | superseded`。
- `last_evidence_at`：最近一次可信执行证据时间。
- `expected_update_by`：如果已经报过 ETA，这里必须记录。
- `expected_artifacts`：预期产物路径或结果。
- `evidence[]`：证据列表。
- `notes`：恢复时的简短判断。

最小 schema 见：`plans/p3-1-startup-recovery-state-schema-v1.json`

---

## 4. 四态模型：`intent -> started -> in_progress -> done`

### 4.1 `intent`

定义：

- 已经存在明确目标或承诺。
- 还没有可信执行动作，或者旧动作已经不能证明当前还在执行。

典型来源：

- 用户刚下指令。
- 自己承诺“我去补”。
- 二两给出返工意见，Q小虎接单但还没开始。

允许证据：

- 指令消息。
- 接单消息。
- handoff 文件里的待办条目。

禁止误判：

- 只有一句“我来处理”不能直接算 `started`。

### 4.2 `started`

定义：

- 已出现第一个明确执行动作。
- 但还没有第二个证据点，无法证明持续推进。

可接受证据示例：

- 新开 worktree / 新开子会话 / 进入目标目录。
- 新建目标文件或写下首版草稿。
- 启动测试、命令或脚本。
- 在共享状态里写明“已开始，负责人是谁，预计什么时候回”。

进入条件：

- `intent` + 至少 1 条执行证据。

### 4.3 `in_progress`

定义：

- `started` 之后又出现至少 1 条新的执行证据。
- 说明这件事不是只起了个头，而是还在推进。

可接受证据示例：

- 第二次文件更新。
- 命令输出、测试结果、日志片段。
- 共享状态中的进度时间戳更新。
- 已产出中间件或可读草稿，并可指出路径。

进入条件：

- `started` + 新的后续证据 + 事项未收口。

禁止误判：

- 只有一条很早以前的“已开始”，后面长时间没证据，不能一直挂 `in_progress`。

### 4.4 `done`

定义：

- 已有明确交付物或明确完成结论。
- 有验证方法，且 pending promise 可以关闭。

可接受证据示例：

- 文件已落盘，路径可读。
- 命令或测试已通过。
- 人工检查点已跑过。
- 审核方明确通过。
- 显式记录“取消 / 被覆盖 / 不再继续”，并说明原因。

进入条件：

- `in_progress` 或 `started` + 完成证据 + 收口说明。

收口规则：

- `done` 同时把 `promise_status` 改成 `fulfilled`、`cancelled` 或 `superseded`。
- 不能只改状态不写收口原因。

---

## 5. 状态跃迁守卫

| 当前状态 | 目标状态 | 必要条件 | 不够时该怎么判 |
| --- | --- | --- | --- |
| `intent` | `started` | 至少 1 条执行证据 | 继续留在 `intent` |
| `started` | `in_progress` | 新增第 2 条后续证据 | 继续留在 `started` |
| `started` | `done` | 直接产出可验证交付物 | 允许跳转 |
| `in_progress` | `done` | 有交付物 + 验证或收口 | 允许跳转 |
| 任意 | `intent` | 原先只有口头状态，启动后找不到当前执行证据 | 降级回 `intent` |
| 任意未完成态 | `stalled` 风险标记 | 超过静默阈值或 ETA | 不改主状态，只加风险标记 |

说明：

- `stalled` 不是第五个主状态，而是挂在未完成事项上的风险标签。
- 启动恢复时允许降级，不能因为“上次说过在做”就硬保留 `in_progress`。

---

## 6. Pending Promise 跟踪规则

以下事件发生时，必须创建或更新 pending promise：

1. 猫爸明确要求一个可交付结果。
2. Q小虎或二两对外说出“我来做 / 我补一下 / 稍后给你”。
3. 审核进入返工，并指定了下一责任方。
4. 共享 handoff / state 文件中明确写了待续事项。

### 6.1 创建时必填字段

- `id`
- `title`
- `owner`
- `source_kind`
- `provenance.speaker`
- `provenance.direction`
- `created_at`
- `state`
- `promise_status`

### 6.2 更新时必填字段

- `state_changed_at`
- `last_evidence_at`（如果有新证据）
- `notes`
- `expected_update_by`（如果报过 ETA）

### 6.3 关闭条件

只有满足以下任一项才能关闭 pending promise：

- 交付物已存在且可核对。
- 审核明确通过。
- 任务被显式取消，并写明取消原因。
- 任务被新 promise 覆盖，并写明替代 ID。

---

## 7. 启动恢复算法（执行版）

每次进入新会话、子会话重启、或者被追问“现在进展到哪”之前，按这个顺序跑：

### 第 1 步：收集未收口事项

优先顺序：

1. 共享状态 / handoff 文件里的未完成事项。
2. 最近一次对外承诺但还未收口的事项。
3. 最近一次返工意见与下一责任方。
4. 预期产物尚未出现的任务。

### 第 2 步：做消息来源校验

对每条事项回答 4 个问题：

1. 这句话最初是谁说的？
2. 这是发给谁的？
3. 它是指令、承诺、审核意见，还是状态回报？
4. 这条文字来自聊天前台，还是共享文件/日志？

只要其中任一项说不清，就不能直接把它当“新指令”或“当前进展”。

### 第 3 步：做执行证据校验

检查最近证据是否存在：

- 有没有文件更新、命令输出、日志、artifact 路径、测试记录？
- 这些证据是不是在承诺之后发生的？
- 证据时间是不是足够新，能代表“现在还在推进”？

### 第 4 步：重判主状态

- 没有执行证据：`intent`
- 有首个执行证据：`started`
- 有后续连续证据：`in_progress`
- 有交付物和收口：`done`

### 第 5 步：打静默 / 卡住标签

- 超过阈值没新证据：标 `stalled`
- 超过 ETA：标 `stalled`
- 只有口头状态、无可观察执行：标 `stalled`

### 第 6 步：再决定怎么回前台

回复原则：

- 如果只是恢复到 `intent`，要说“还没真正恢复执行，我现在开始接手”。
- 如果证据只够 `started`，要说“已开始，但还没有足够证据说明持续推进”。
- 只有在证据足够时，才能说“正在推进”。
- 如果已 `stalled`，优先诚实报停滞点，不报“正常进行中”。

---

## 8. 消息来源校验：最小判定矩阵

| 来源方向 | 含义 | 能当什么用 | 不能当什么用 |
| --- | --- | --- | --- |
| `inbound` | 猫爸或对方刚发来的输入 | 新指令、新约束、新观察 | 不能直接当完成证据 |
| `outbound` | 我自己上一轮发出的消息 | 自己做过哪些承诺、报过哪些状态 | 不能当对方新要求 |
| `relay` | 第三方转述 | 线索、待确认输入 | 不能直接替代原始指令来源 |
| `artifact` | 共享文件、日志、产物 | 执行状态和结果证据 | 不能替代用户意图 |

硬规则：

- 自己上一轮发给猫爸的状态更新，只能用于恢复“我承诺过什么”，不能反向当成“猫爸刚要求了什么”。
- 如果一个结论只来自 `outbound` 文本，而没有 `artifact` 证据，就不能把它判成 `in_progress` 或 `done`。

---

## 9. 执行证据校验：什么算证据，什么不算

### 9.1 可接受证据

按强度从弱到强：

1. `session_started`
   - 新开子会话、进入目录、创建 worktree。
2. `artifact_touched`
   - 新建文件、更新草稿、写入状态文件。
3. `command_started`
   - 启动命令、测试、脚本。
4. `command_result`
   - 命令输出、测试结果、错误日志。
5. `artifact_verified`
   - 文件路径可读、人工检查通过、审核通过。

### 9.2 不算证据的内容

以下内容单独存在时不算执行证据：

- “我在处理”。
- “稍等我一下”。
- “我记得这件事”。
- 很久以前的旧进度，但之后没有任何续证。

### 9.3 证据新鲜度规则

- 证据必须发生在当前 promise 创建之后，或能明确解释为何仍然有效。
- 旧证据如果跨过一次会话重启后没有新续证，只够保留历史，不够证明当前正在做。

---

## 10. 静默 / 卡住检测默认阈值

默认阈值先用保守版，后续可按实际协作节奏调：

- `intent`：接单后 15 分钟仍无首个执行证据 -> 黄色提醒
- `started`：20 分钟内无第 2 条证据 -> 黄色提醒
- `in_progress`：45 分钟内无新证据 -> 红色 `stalled`
- 任意未完成态：超过 `expected_update_by` -> 红色 `stalled`
- 任意未完成态：前台已报“正在处理”，但恢复时找不到对应 artifact/日志 -> 红色 `stalled`

说明：

- 这些阈值是默认值，不是死规则；重点是必须有阈值，而不是无限期沿用旧状态。
- 如果任务本来就是长耗时操作，必须在 `notes` 里写明为什么静默是合理的。

---

## 11. 最小恢复清单

每次启动恢复，至少检查这 7 项：

- [ ] 最近未收口 promise 有哪些？
- [ ] 每条 promise 最初是谁说的？方向是什么？
- [ ] 我是不是把自己上一轮的 outbound 文本误当成了新的 inbound 指令？
- [ ] 当前有没有新的执行证据？
- [ ] 这些证据能把状态判到哪一层？
- [ ] 有没有事项已经超过 ETA 或超过静默阈值？
- [ ] 我接下来发出的状态说明，是否和证据层级一致？

---

## 12. Worked Example：防止“把承诺误当进展”

场景：

- 04:10 我发出去一条消息：`我去补第三层 startup recovery confirmation。`
- 08:10 会话恢复，猫爸问：`现在第三层到哪了？`
- 我能读到自己 04:10 的那条话，但没有新的文件、命令、日志、产物。

正确判定：

- 这条话的 `provenance.direction = outbound`
- 它说明我做过承诺，但不能说明猫爸刚给了新指令
- 也不能说明我这四个小时里真的在做
- 所以这条事项当前只能判 `intent`
- 如果我之前还说过“我正在推进”，但启动后找不到证据，就要加 `stalled`

正确回复方向：

- 不说“正在推进中”
- 应该说“我恢复到了这条未完成承诺，但当前没有可观察执行证据；我现在开始接手并补状态”

---

## 13. 当前落地位置

本层现在已经进入共享文件 + CLI 的最小实现：

1. 计划/规范：`plans/p3-1-startup-recovery-confirmation-v1.md`
2. 最小 schema：`plans/p3-1-startup-recovery-state-schema-v1.json`
3. 运行时状态：`notes/startup-recovery-state.json`
4. 检查脚本：`scripts/startup_recovery_check.mjs`
5. 最小测试：`scripts/startup_recovery_check_test.mjs`

当前实现目标是：让 heartbeat 能对未收口 promise 做真实状态重判和静默检测，而不是只停在文字合同层。

### 13.1 面向真实工作的最小操作回路

现在的默认落地动作不是“记得去做”，而是把 live work 直接写进共享状态：

1. 接到一个需要后续交付、而且已经准备开工的承诺后，优先用 `capture-live` 一次性写入 promise + 首条执行证据 + ETA。
2. 如果只是想先挂一个还没真正开工的 `intent`，或者已经有完整 JSON payload，才用更底层的 `create`。
3. 一旦是重启续跑、被 watchdog 拍醒、或已经存在 open item，就用 `resume` / `resume-hottest` 补续跑证据，而不是重复新建 item。
4. 每次报 ETA，同步写 `expected_update_by`，不要只在前台口头说；如果只是想报“30 分钟后我给更新”，直接用 `--eta-minutes`，不用手写 ISO 时间。
5. heartbeat 用 `heartbeat-check` 重判是否已经 `watch` / `stalled`。
6. 交付完成后，优先用带内联证据的 `resolve` 收口；需要时加 `--verify-expected-artifacts` 先验目标产物真的可读，避免 promise 永远挂着。

推荐命令：

- 新建正在开工的 live promise：`node scripts/startup_recovery_check.mjs capture-live qxiaohu "Land the next bounded startup-recovery pass" "Committed to this bounded pass in the front channel." "Started executing the bounded pass now." --state-path notes/startup-recovery-state.json --eta-minutes 30 --notes "What is happening in this pass." --path plans/p3-1-startup-recovery-confirmation-v1.md --expected-artifacts "plans/p3-1-startup-recovery-confirmation-v1.md,scripts/startup_recovery_check.mjs"`
- 只挂 intent / 用现成 payload：`Get-Content item.json | node scripts/startup_recovery_check.mjs create - notes/startup-recovery-state.json`
- 默认重启续跑路径：`node scripts/startup_recovery_check.mjs resume-hottest qxiaohu "Back on the hottest pending work after restart." --state-path notes/startup-recovery-state.json --eta-minutes 30 --notes "Actively back in execution."`
- 显式续跑指定 item：`node scripts/startup_recovery_check.mjs resume <id> "Resumed execution after restart or stalled check." --state-path notes/startup-recovery-state.json --eta-minutes 30 --notes "What is actively happening now."`
- 做 heartbeat 判定：`node scripts/startup_recovery_check.mjs heartbeat-check qxiaohu notes/startup-recovery-state.json`
- 完成交付并收口：`node scripts/startup_recovery_check.mjs resolve <id> fulfilled --state-path notes/startup-recovery-state.json --summary "Verified the bounded deliverable and closed it." --notes "Done and verified." --path scripts/startup_recovery_check.mjs --command "node --test scripts/startup_recovery_check_test.mjs" --verify-expected-artifacts`
- 默认 finish-line 路径：`node scripts/startup_recovery_check.mjs resolve-hottest qxiaohu fulfilled --state-path notes/startup-recovery-state.json --summary "Verified the bounded deliverable and closed it." --notes "Done and verified." --path scripts/startup_recovery_check.mjs --command "node --test scripts/startup_recovery_check_test.mjs" --verify-expected-artifacts`

`capture-live` 的目的，是把最常见的“我刚承诺了一件要继续交付的事，而且现在已经真正开工”压缩成一条命令，减少 operator 因为还要手写 JSON 才能落盘而漏记 promise / 漏同步 ETA 的情况。

`resume-hottest` 会按与 heartbeat 一致的顺序自动选中同一位 owner 当前最该恢复的 open item：先选 `stalled`，再选 `watch`，最后选最近活跃的 open item。这样 operator 在大多数“刚重启 / 刚被 watchdog 拍醒”的场景里，只需要打一条命令就能恢复真实执行状态。

现在 `resolve` 也支持一条命令内联补 closing evidence；如果再加 `--verify-expected-artifacts`，它会先检查该 item 的 `expected_artifacts` 都能读到，读不到就拒绝收口，避免“口头说做完了，但共享产物并不存在”的假关闭。

如果需要 file-based 示例，当前仓库保留了一个最小 resume payload：`runtime/startup_recovery_evidence_resume.json`。旧的 `resolve <id> <status> <statePath> <payload.json>` 仍然保留，适合批量脚本或已经有 JSON 产物的场景。

### 13.2 日常自检默认命令

为了让第三层启动恢复真的变成日常默认路径，而不是只在出事后才想起来跑，当前 CLI 额外提供了一条轻量自检命令：

- 纯检查：`node scripts/startup_recovery_check.mjs doctor qxiaohu notes/startup-recovery-state.json`
- 默认启动恢复：`node scripts/startup_recovery_check.mjs doctor qxiaohu notes/startup-recovery-state.json --apply-resume --eta-minutes 30 --notes "Back in active execution after startup recovery."`

`doctor` 的职责不是替代 `heartbeat-check`，而是在需要回前台、重启续跑、或者想确认共享状态有没有写歪时，先给一个更直接的结构化判断：

- 当前 state 有没有明显结构错误或状态跃迁错误。
- open item 有没有漏掉 `expected_update_by`。
- `in_progress` 是否真的已经有至少两条证据，而不是只靠一条旧记录挂着。
- 下一步更像是继续 `heartbeat-check` 观察，还是应该立刻 `resume-hottest` 补执行证据和 ETA。
- 如果当前已经有 open item，输出里还会给出 `completionPath`，把“做完以后怎么准确收口”也一起提前指向 `resolve-hottest`。

推荐时机：

1. 刚从重启/中断里恢复，准备回答“现在进展到哪”之前。
2. 刚手动更新过 `notes/startup-recovery-state.json`，想确认没有写出自相矛盾状态。
3. 想把 startup-recovery 作为默认 operating path 跑顺，而不是等 heartbeat 报警后再补救。

推荐组合：

- 想保守确认时，先跑纯 `doctor` 看 state 是否健康、下一条命令是什么，以及完成后该用哪条 `completionPath` 收口。
- 想把它当作默认 startup path 时，直接跑 `doctor --apply-resume`；如果当前确实有 stalled / watch / 缺 ETA 的 open item，它会自动对 hottest item 补一条新证据和新 ETA。
- 如果 `doctor --apply-resume` 没有实际执行恢复，输出会保留 `applied: null`，这表示当前状态已经干净，或者存在需要人工先修的结构问题。
- 恢复后仍然继续用 `heartbeat-check` 做日常监控；真正交付完成时，优先直接执行 `completionPath.command`，避免再手动查 item id。

---

## 14. 通过标准

满足以下条件，P3.1 规范算通过：

- [ ] 对每条未收口事项都能区分 `intent`、`started`、`in_progress`、`done`
- [ ] pending promise 的创建、更新、关闭条件明确
- [ ] 消息来源能区分 `inbound` / `outbound` / `relay` / `artifact`
- [ ] 状态前进必须有执行证据，不再靠聊天措辞
- [ ] 有明确的静默 / stalled 阈值
- [ ] 启动恢复时允许根据证据把事项降级，而不是盲目沿用旧的“进行中”
- [ ] 回前台前，能给出与证据强度一致的状态说明

---

## 15. 与既有文档的关系

- `plans/p3-supervision-mechanism-v1.md` 负责“系统会不会查”。
- `plans/p3-1-startup-recovery-confirmation-v1.md` 负责“查到了以后，怎么把承诺和真实执行对齐”。
- `outputs/stage3-retrospective-v1.md` 提供了返工 ETA、可读路径、前台状态不等于后台执行状态这三条现实约束。
- 这一层通过后，后续才适合继续推进 `Skills Recall` 和 `MCP`，否则只会把错的状态恢复得更快。

---

制定者：Q小虎
版本：v1
日期：2026-03-17
