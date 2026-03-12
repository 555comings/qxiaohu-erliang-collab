# P2.1 偏好与冲突扩展协议 v1

制定对象：二两的记忆系统

适用范围：`MEMORY.md`、`memory/YYYY-MM-DD.md`、Heartbeat / 周期回顾中的偏好审计

前置依赖：`p2-writing-protocol-v1.md`、`p3-supervision-mechanism-v1.md`

版本目标：在 P2 的写入与状态机制上，补齐“偏好如何观察、何时验证、遇到冲突怎么拆分或降级”的执行规则，让偏好不再以模糊印象存在，而是以带条件、带置信度、可升级/降级的条目存在。

---

## 0. 一句话原则

偏好不是人格判断，而是条件化的工作规律；先观察，再验证，遇到冲突就拆条件或降级，不允许把一次印象直接写成长期事实。

---

## 1. 状态扩展：新增 `observing` 与 `conflict`

P2 原有状态为 `[draft]`、`[verified]`、`[stale]`、`[deprecated]`。本协议新增两个状态，用于处理偏好条目的早期观察与冲突阶段。

| 状态 | 含义 | 默认落点 | 是否可直接进 `MEMORY.md` |
| --- | --- | --- | --- |
| `[observing]` | 第 1 次观察到某条偏好，暂不视为稳定规律 | daily | 否 |
| `[conflict]` | 新观察与已有偏好在相近条件下相互矛盾，等待拆分或裁决 | daily | 否 |
| `[draft]` | 已有 2 次独立观察，形成候选规则 | daily | 原则上否 |
| `[verified]` | 已有 3 次独立观察，或 2 次观察 + 明确确认，可视为稳定规则 | daily / `MEMORY.md` | 是 |
| `[stale]` | 曾经可用，但现在可能失效或条件过宽 | 原位置保留 | 是 |
| `[deprecated]` | 已被新规则替代，不再作为默认依据 | 原位置保留 | 是 |

### 1.1 状态流转

```text
[observing] --第2次独立观察--> [draft]
[observing] --发现矛盾--> [conflict]
[draft] --第3次独立观察--> [verified]
[draft] --发现矛盾--> [conflict]
[verified] --新观察与其冲突--> [conflict]
[conflict] --条件拆分成功--> [observing]/[draft]/[verified]（新条目） + [stale]（旧条目）
[conflict] --新规则完全覆盖旧规则--> [verified]（新条目） + [deprecated]（旧条目）
```

核心要求：

1. 偏好条目第一次出现时，状态必须是 `[observing]`，不能直接从空白跳到 `[verified]`。
2. 一旦出现冲突，旧规则不能继续裸用，必须显式进入 `[conflict]` 或被标记为 `[stale]` / `[deprecated]`。

---

## 2. 条件化偏好：固定使用 4 个维度

所有偏好条目必须带条件，条件字段固定为以下 4 个维度，不额外自定义主维度。

| 维度 | 含义 | 推荐取值示例 |
| --- | --- | --- |
| `task_type` | 当前任务类型 | `writing`、`review`、`planning`、`execution`、`handoff` |
| `urgency` | 当前紧急程度 | `low`、`medium`、`high` |
| `time` | 时间段或节奏窗口 | `morning`、`afternoon`、`evening`、`late-night`、`startup`、`wrap-up` |
| `interaction_mode` | 互动方式 | `async-doc`、`async-chat`、`sync-chat`、`sync-call` |

### 2.1 书写格式

偏好条目统一写成：

```md
偏好：task_type=<值>, urgency=<值>, time=<值>, interaction_mode=<值> -> <结论>
```

例如：

```md
偏好：task_type=writing, urgency=low, time=afternoon, interaction_mode=async-doc -> 先给结构和模板，再补充理由
```

### 2.2 填写规则

1. 4 个维度必须按固定顺序书写：`task_type` -> `urgency` -> `time` -> `interaction_mode`。
2. 暂时不确定的维度可写 `*`，但至少 2 个维度必须是明确值。
3. 只有在相同或高度重叠的 4 维条件下，才允许判定“这是同一条偏好”的第 2 次或第 3 次观察。
4. 如果冲突来自某一维的差异，应优先通过补全该维来拆分，而不是简单判定“人变了”。

### 2.3 应用优先级

同一时刻有多条偏好候选时，按以下顺序取用：

1. 4 维全匹配的 `[verified]`
2. 4 维全匹配的 `[draft]`
3. 3 维匹配且 `task_type` 一致的 `[verified]`
4. 2 维匹配且 `task_type` + `interaction_mode` 一致的 `[draft]`
5. `[observing]` 只能作为提醒，不可直接当默认规则执行

---

## 3. 三次观察验证流：1/3 -> 2/3 -> 3/3

本协议对偏好采用“三次观察验证”机制。所谓独立观察，指发生在不同任务片段、不同时间点，且不是对前一条的简单复述。

### 3.1 O1：第一次观察

- 状态：`[observing]`
- 置信度：`low`
- 位置：只写 `memory/YYYY-MM-DD.md`
- 允许动作：记录、提醒、继续观察
- 不允许动作：写入 `MEMORY.md`、覆盖现有 `[verified]` 规则

满足以下任一条件可算 O1：

1. 某种表达或交接方式明显让协作更顺畅；
2. 同一类任务里，对方反复表现出某种选择倾向；
3. 一次返工明显暴露出“应该如何给信息”的偏好线索。

### 3.2 O2：第二次独立观察

- 状态：`[draft]`
- 置信度：`medium`
- 位置：继续写 daily
- 允许动作：在条件精确匹配时，作为软默认使用
- 不允许动作：未经说明就提升到 `MEMORY.md`

O2 的要求：

1. 必须是独立于 O1 的另一段任务证据；
2. 结论方向一致；
3. 条件相同，或条件被补得更具体，但不能把原结论推翻。

### 3.3 O3：第三次独立观察

- 状态：`[verified]`
- 置信度：`high`
- 位置：先写 daily 留痕；满足 P2 提升规则后再写 `MEMORY.md`
- 允许动作：作为默认协作偏好使用

O3 的要求：

1. 第三次观察与前两次方向一致；
2. 能说明这不是偶然，而是跨任务仍成立；
3. 若第 3 次观察补全了关键维度，应以补全后的条件作为最终版本。

### 3.4 明确确认的加速规则

为了和 P2 保持兼容，允许以下加速：

- 若已经有 O1 + O2，且用户或协作方明确确认“以后就按这个来”，可直接升级为 `[verified]`；
- 但单次口头确认不能替代全部观察痕迹，daily 中仍需保留至少 2 条观察证据。

换句话说：默认走 3 次观察；确认只允许补最后一步，不允许从 1 次观察直接跳满。

---

## 4. 置信度级别：低 / 中 / 高

本协议把状态和置信度分开写。状态描述“处于哪个阶段”，置信度描述“现在有多能拿来做决策”。

| 置信度 | 常见状态 | 实际含义 | 实用规则 |
| --- | --- | --- | --- |
| `low` | `[observing]` | 只有 1 次证据，可能是偶然 | 只能提醒自己注意，不能作为默认执行依据 |
| `medium` | `[draft]` / `[conflict]` | 已有 2 次证据，或出现冲突需要重新判断 | 可以在精确匹配条件下做软默认，但要保留回退空间 |
| `high` | `[verified]` | 已经跨 3 次观察或得到明确确认 | 可以进入 `MEMORY.md`，并作为默认偏好引用 |

### 4.1 实际使用规则

- `low`：只记录，不驱动行为。最多影响措辞顺序，不能影响关键决策。
- `medium`：可以影响协作编排，例如优先给结论还是先给模板，但必须避免覆盖已存在的 `high` 条目。
- `high`：可以作为长期协作偏好复用；若之后出现冲突，先降为 `medium` 并进入 `[conflict]`。

### 4.2 置信度降级规则

1. `[verified]` 一旦出现有效反例，先不删除，转入 `[conflict]`，置信度从 `high` 降到 `medium`。
2. `[draft]` 若 21 天内没有第 3 次观察，且一直未复用，可保留为 `[draft]`，但在周回顾中标记“待验证或待淘汰”。
3. `[observing]` 若 14 天内没有第二次观察，可继续保留，但在 heartbeat / 周回顾中列为“可能只是偶然”。

---

## 5. 冲突协议：什��时候算冲突，怎么处理

### 5.1 冲突判定

满足以下两项时，必须标记 `[conflict]`：

1. 新观察与已有偏好结论明显相反或方向相斥；
2. 两者的 4 维条件相同，或只差 1 个非关键维度，导致无法直接并存。

例如：

- 已有：`task_type=writing, urgency=low, time=afternoon, interaction_mode=async-doc -> 先给结构再给理由`
- 新观察：`task_type=writing, urgency=low, time=afternoon, interaction_mode=async-doc -> 先给一句结论再展开`

这两条就必须进入冲突处理，而不是任选一条继续用。

### 5.2 冲突处理顺序

优先级固定如下：

1. 先查是否能通过补全 4 维条件来拆分；
2. 不能拆分时，先把旧规则标 `[stale]`，新规则从 `[observing]` 重新累计；
3. 只有证据足够明确时，才把旧规则标 `[deprecated]`。

### 5.3 三种解决路径

#### 路径 A：条件拆分

适用于：冲突其实来自 `urgency`、`time` 或 `interaction_mode` 的不同。

处理：

- 旧的宽条件条目标 `[stale]`
- 拆成两条或多条更细条件的偏好
- 每条拆分后的偏好重新继承已有证据，按证据数量决定是 `[observing]`、`[draft]` 还是 `[verified]`

#### 路径 B：新规则覆盖旧规则

适用于：旧规则已被连续反证，新规则更稳定。

处理：

- 旧规则标 `[deprecated]`
- 新规则以 `[verified]` 写入
- 在 `Replaced by` 中写清替代关系

#### 路径 C：挂起观察

适用于：证据不足，无法判断是条件差异还是规则失效。

处理：

- 新旧两条都不直接删
- 建立 `[conflict]` 记录
- 下一次遇到同类情境时优先补观察，不做过度推断

---

## 6. 存储与更新模板

### 6.1 daily 模板：首次记录、升级、冲突都先写这里

```md
## [memory] 2026-03-13 15:40
- Trigger: observation | conflict-detected | user-confirm
- Scope: <任务名或协作场景>
- Entry: [observing|draft|verified|conflict] 偏好：task_type=<值>, urgency=<值>, time=<值>, interaction_mode=<值> -> <结论>
  Confidence: low|medium|high
  Observed: YYYY-MM-DD (1/3 | 2/3 | 3/3)
  Evidence: <这次观察到什么>
- Why: <为什么值得记>
- Next: <下一次验证条件 / 是否提升到 MEMORY.md / 是否进入冲突处理>
```

如果是冲突条目，补充：

```md
  Existing: [<状态>] 偏好：task_type=<值>, urgency=<值>, time=<值>, interaction_mode=<值> -> <旧结论>
  Conflict: <冲突点>
```

### 6.2 `MEMORY.md` 模板：只收稳定偏好

```md
- [verified] 协作偏好：task_type=<值>, urgency=<值>, time=<值>, interaction_mode=<值> -> <结论>
  Confidence: high
  Evidence: <3次独立观察 / 2次观察 + 明确确认>
  Updated: 2026-03-13
```

### 6.3 `MEMORY.md` 冲突后改状态模板

```md
- [stale] 协作偏好：task_type=<值>, urgency=<值>, time=<值>, interaction_mode=<值> -> <旧结论>
  Check next: <需要确认的新条件或新规则>
  Updated: 2026-03-20
```

```md
- [deprecated] 协作偏好：task_type=<值>, urgency=<值>, time=<值>, interaction_mode=<值> -> <旧结论>
  Replaced by: <新规则>
  Updated: 2026-03-20
```

### 6.4 更新规则

1. 偏好每次升级时，daily 必须留一条新证据，不能只改 `MEMORY.md`。
2. 提升到 `MEMORY.md` 时写稳定版，不复制整段 daily 流水。
3. 同一条偏好如已在 `MEMORY.md`，后续发生冲突或降级，应在原条目上改状态，不要静默删除。

---

## 7. 提升 / 降级规则

### 7.1 提升规则

#### `observing -> draft`

同时满足：

1. 出现第 2 次独立观察；
2. 条件未冲突；
3. 结论方向一致。

#### `draft -> verified`

同时满足：

1. 出现第 3 次独立观察，或 2 次观察 + 明确确认；
2. 4 维条件已经足够清楚；
3. 对未来跨天协作仍有帮助。

#### `verified -> MEMORY.md`

同时满足：

1. 状态已是 `[verified]`；
2. 置信度为 `high`；
3. 该偏好预计未来一周后仍有复用价值。

### 7.2 降级规则

#### `verified -> conflict`

当出现 1 次有效反例，且反例与旧规则在相近条件下直接矛盾时。

#### `verified -> stale`

当规则本身未被彻底推翻，但条件过宽、环境变化、或长期未再使用，导致不适合作为默认规则时。

#### `stale -> verified`

当后续重新获得 2 次以上一致证据，且新条件已明确。

#### `任何状态 -> deprecated`

只有在替代规则已经成立，且旧规则不应再被引用时，才允许标 `deprecated`。

---

## 8. 与 P3 监督机制的衔接

为了让偏好协议真正可执行，需要把它接入 P3 的 heartbeat / 周期回顾。

### 8.1 Heartbeat 增补检查项

建议加入以下 3 项：

```md
## 偏好与冲突检查（每 2 次 heartbeat 做一次）
- [ ] 是否存在超过 14 天仍停留在 [observing] 的偏好条目
- [ ] 是否存在超过 7 天未处理的 [conflict] 条目
- [ ] 最近 7 天是否出现过值得记录但未落盘的偏好信号
```

### 8.2 Alert 建议

| 颜色 | 条件 | 动作 |
| --- | --- | --- |
| 黄色 | `[observing]` 超过 14 天未升级 | 提醒：补观察或判定无效 |
| 黄色 | `[draft]` 超过 21 天未升级 | 提醒：确认是否还值得继续跟踪 |
| 红色 | `[conflict]` 超过 7 天未处理 | 报告：需要人工拆条件或裁决 |
| 蓝色 | 最近 30 天没有新增偏好记录 | 提示：可能正在漏记协作偏好 |

---

## 9. Worked Example：基于当前协作文档流的真实型示例

场景背景：当前协作正在连续补齐 `qxiaohu-erliang-collab/plans/` 下的记忆系统文档，已经有 `p2-writing-protocol-v1.md`、`p3-supervision-mechanism-v1.md`，现在继续产出本协议。这个上下文里，最容易被观察到的不是抽象人格，而是“二两在文档协作里更吃哪种交付方式”。

### 9.1 第一次观察：文档型、低紧急、下午、异步文档

在补 P2 写入协议时，协作明显更顺的是“先给结构和模板，再展开理由”。先给大段辩论反而会拖慢落盘。

文件：`memory/2026-03-13.md`

```md
## [memory] 2026-03-13 14:10
- Trigger: observation
- Scope: 起草 p2-writing-protocol-v1
- Entry: [observing] 偏好：task_type=writing, urgency=low, time=afternoon, interaction_mode=async-doc -> 先给结构和模板，再补充理由
  Confidence: low
  Observed: 2026-03-13 (1/3)
  Evidence: 文档协议类任务中，先落章节和模板后，推进明显更快
- Why: 这是可复用的协作文档偏好，不只是这一次的偶然写法
- Next: 下次同类协议文档继续观察是否成立
```

### 9.2 第二次观察：P3 监督机制里再次成立

在补 P3 时，同样是先把 checklist、alert、cron 结构定出来，再补解释部分，整体协作阻力更小，因此进入 O2。

```md
## [memory] 2026-03-13 19:20
- Trigger: observation
- Scope: 起草 p3-supervision-mechanism-v1
- Entry: [draft] 偏好：task_type=writing, urgency=low, time=afternoon, interaction_mode=async-doc -> 先给结构和模板，再补充理由
  Confidence: medium
  Observed: 2026-03-13 (2/3)
  Evidence: checklist 和 alert 框架先定后，细节补写效率更高
- Why: 第二次独立文档任务中重复成立，可作为软默认
- Next: 若在下一份协议文档中再次成立，则升级为 verified
```

### 9.3 第三次观察：本协议写作再次成立，升级为 verified

当前正在写 `p2-1-preference-conflict-protocol-v1.md`。如果仍然是先搭状态、维度、模板，再补 worked example 和衔接说明，那么这条偏好就完成 3/3。

```md
## [memory] 2026-03-13 21:00
- Trigger: observation
- Scope: 起草 p2-1-preference-conflict-protocol-v1
- Entry: [verified] 偏好：task_type=writing, urgency=low, time=afternoon, interaction_mode=async-doc -> 先给结构和模板，再补充理由
  Confidence: high
  Observed: 2026-03-13 (3/3)
  Evidence: 连续三份协议文档都以先定结构再补理由的方式推进更顺
- Why: 已经跨 3 次独立文档任务成立，可视为稳定协作偏好
- Next: 提升到 MEMORY.md，作为文档协作默认规则
```

提升到 `MEMORY.md` 后：

```md
- [verified] 协作偏好：task_type=writing, urgency=low, time=afternoon, interaction_mode=async-doc -> 先给结构和模板，再补充理由
  Confidence: high
  Evidence: 在 P2、P3、P2.1 三份协议文档中连续 3 次成立
  Updated: 2026-03-13
```

### 9.4 冲突出现：高紧急时不再适用

之后如果出现一个高紧急文档请求，例如需要在短时间内先交可执行结论，这时观察到的可能是：

```md
- Entry: [observing] 偏好：task_type=writing, urgency=high, time=afternoon, interaction_mode=async-doc -> 先给一句结论和交付结果，再补模板
```

这不一定说明旧规则错了，更可能说明 `urgency` 维度在起作用。因此正确处理不是推翻旧规则，而是进入 `[conflict]` 后按紧急度拆分：

```md
- [stale] 协作偏好：task_type=writing, urgency=*, time=afternoon, interaction_mode=async-doc -> 先给结构和模板，再补充理由
  Check next: 区分 low 与 high urgency 下的写作偏好
  Updated: 2026-03-20

- [verified] 协作偏好：task_type=writing, urgency=low, time=afternoon, interaction_mode=async-doc -> 先给结构和模板，再补充理由
  Confidence: high
  Updated: 2026-03-20

- [observing] 协作偏好：task_type=writing, urgency=high, time=afternoon, interaction_mode=async-doc -> 先给一句结论和交付结果，再补模板
  Confidence: low
  Updated: 2026-03-20
```

这个例子体现的是：冲突未必是否定旧规则，很多时候只是说明旧规则写得太宽，需要补条件。

---

## 10. 审计要求

每次周回顾或协议复盘时，至少检查以下 5 项：

1. 最近 3 次偏好记录是否都写了 4 维条件；
2. 是否存在从 `[observing]` 直接跳到 `MEMORY.md` 的违规写法；
3. 是否存在 `[conflict]` 条目超过 7 天未处理；
4. `MEMORY.md` 中的偏好是否都带 `Confidence: high`；
5. 是否有已经明显变窄的偏好仍然以宽条件保存。

---

## 11. 通过标准

满足以下条件，即视为 `P2.1 偏好与冲突扩展协议 v1` 已落地：

- 至少有 1 条偏好完成 `observing -> draft -> verified`
- 至少有 1 条冲突被记录为 `[conflict]`
- 至少有 1 次冲突通过补充 4 维条件而不是拍脑袋解决
- 新进入 `MEMORY.md` 的偏好条目都带完整 4 维条件与 `Confidence: high`
- Heartbeat / 周回顾中已增加偏好与冲突的审计项

---

制定者：Q小虎
版本：v1
日期：2026-03-13
