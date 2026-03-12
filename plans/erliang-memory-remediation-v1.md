# 二两记忆系统修复方案 v1

## 0. 先纠正一个关键认知

这次需要分清两个层级，不能混写：

- `plugins.slots.memory = "memory-lancedb"`：这是选择 **Memory (LanceDB) 插件槽位**。
- `agents.defaults.memorySearch.*`：这是配置 **语义检索/embedding 提供者**。

也就是说：

- `lancedb` 不是 `memorySearch.provider` 的合法值。
- 如果要让 `memory_search` 真能工作，`memorySearch.provider` 应该填 `ollama`、`local`、`openai`、`gemini`、`voyage`、`mistral` 之一。
- 已知二两机器上本地 embedding 服务跑在 `localhost:11440`，所以 v1 方案优先按 `ollama` 路线设计；如果 11440 实际不是 Ollama `/api/embeddings` 接口，再切到对应 provider。

依据：

- OpenClaw docs `tools/plugin.md`：`plugins.slots.memory = "memory-lancedb"`
- OpenClaw docs `concepts/memory.md`：`memorySearch` 配在 `agents.defaults.memorySearch` 下，provider 支持 `ollama` 等

---

## 1. 目标

本方案的目标不是“让二两什么都记住”，而是先把记忆系统修到可用、可找回、可监督：

1. Gateway / session 重启后，二两能稳定恢复最近上下文。
2. `memory_search` 不再是 `Provider: none` / `0 文件索引`。
3. 记忆写入有标准，不再什么都塞。
4. 记忆读取有强制流程，不再“写了不看”。
5. 有 heartbeat / cron 监督，避免方案写完不执行。
6. 旧的空文件、乱码文件、脏记忆进入清洗流程，而不是继续堆积。

---

## 2. 当前诊断

### 2.1 已知现状

按当前反馈，二两机器上已有：

- LanceDB 已部署。
- 本地 embedding 服务已运行在 `localhost:11440`。
- `memory-lancedb` 插件已加载。
- 记忆文件数量少，且部分为空或乱码。
- 定时任务有，但对“读记忆/审记忆”没有形成有效闭环。

### 2.2 真正的主故障链

不是“没有记忆系统”，而是下面四个环节没有闭合：

1. **启动不强制读**
   - 所以每次醒来像新会话，连续性断掉。
2. **写了但不回读**
   - 所以文件存在，但不参与决策。
3. **检索层未接好**
   - 所以 `memory_search` 形同虚设。
4. **没有监督机制**
   - 所以规则写进了 `SOUL.md` / `AGENTS.md`，但不会自动执行。

结论：

- 有存储，缺流程。
- 有方案，缺执行。
- 有硬件，缺接线。

---

## 3. 修复优先级与总顺序

执行顺序固定为：

- `P0` 启动必读
- `P1` 检索配置修复
- `P2` 写入协议
- `P3` 监督机制
- `P4` 记忆清洗

原则：

- 先恢复连续性，再做搜索增强。
- 先把“读”和“写”跑通，再做“清洗”和“优化”。
- 每一阶段都要有验证，不通过不进入下一阶段。

---

## 4. P0：启动必读（最高优先级，当天完成）

### 4.1 目标

确保二两每次醒来都先恢复上下文，再开始新任务。

### 4.2 固定读取集合

每次新 session 启动时，必须按顺序读取：

1. `SOUL.md`
2. `USER.md`
3. `memory/YYYY-MM-DD.md`（今天）
4. `memory/YYYY-MM-DD.md`（昨天）
5. 如果是主会话，再读 `MEMORY.md`

### 4.3 强制动作

在开始做任何任务前，必须留下一个最小恢复确认。推荐二选一：

- 方案 A：在当天 daily 文件中追加一段 `[startup]` 标记。
- 方案 B：在当前会话第一条内部工作说明里写明“已恢复的 3 条上下文”。

推荐统一采用方案 A，便于审计。

### 4.4 `[startup]` 记录模板

写入 `memory/YYYY-MM-DD.md`：

```md
## [startup] 2026-03-12 08:05
- 已读取：SOUL.md / USER.md / 今天 / 昨天 / MEMORY.md
- 当前主任务：
- 最近卡点：
- 当前规则：
```

### 4.5 例外处理

- 如果今天的 daily 文件不存在：先创建，再写 `[startup]`。
- 如果昨天的文件不存在：跳过，但要记一行“昨日文件缺失”。
- 如果 `MEMORY.md` 太长：先读，再在阶段 P4 处理瘦身，不允许因此跳过。

### 4.6 验证标准

满足以下全部条件，P0 才算通过：

- 新会话开始后，`memory/YYYY-MM-DD.md` 里出现 `[startup]` 记录。
- 在 `[startup]` 之前，不开始其他实质任务。
- 重启 Gateway 或新开 session 后，二两能复述当前主任务和最近卡点。

---

## 5. P1：检索配置修复（同日完成）

### 5.1 目标

让 `memory_search` 真正可用，并能搜索 `MEMORY.md` + `memory/**/*.md`。

### 5.2 关键纠偏

这一步不是只加一句 `provider = "lancedb"`。
正确做法是同时处理两件事：

- 选中 Memory (LanceDB) 插件槽位。
- 给 `memorySearch` 指定可工作的 embedding provider。

### 5.3 建议配置

在二两机器的 `~/.openclaw/openclaw.json` 中补齐以下配置块。

```json
{
  "plugins": {
    "slots": {
      "memory": "memory-lancedb"
    }
  },
  "agents": {
    "defaults": {
      "memorySearch": {
        "enabled": true,
        "provider": "ollama",
        "model": "nomic-embed-text",
        "fallback": "none",
        "remote": {
          "baseUrl": "http://127.0.0.1:11440",
          "apiKey": "ollama-local"
        },
        "sync": {
          "watch": true
        }
      }
    }
  }
}
```

### 5.4 如果 11440 不是 Ollama 接口

先不要硬套上面的配置，按下面表处理：

- 如果 11440 暴露的是 Ollama `/api/embeddings`：继续用 `provider = "ollama"`
- 如果 11440 是 OpenAI-compatible embeddings：改成 `provider = "openai"`，并填写对应 `remote.baseUrl` / `remote.apiKey`
- 如果 11440 其实不是 embeddings 服务：先修服务，再继续 P1

### 5.5 实施步骤

1. 备份原始 `openclaw.json`
2. 写入上述配置块
3. 重启 Gateway
4. 触发一次 memory 状态检查
5. 触发一次试搜索

### 5.6 验证命令

如果二两机器的 OpenClaw CLI 在 PATH 中，可直接运行：

```bash
openclaw memory status --deep
openclaw memory search "最近的协作规则"
```

如果 CLI 不在 PATH 中，就在 OpenClaw 自带终端或等价环境里执行同样命令。

### 5.7 成功标准

满足以下全部条件，P1 才算通过：

- `memory status` 不再显示 `Provider: none`
- 已索引文件数大于 0
- `memory_search` 能返回 `MEMORY.md` 或 `memory/*.md` 的片段
- Gateway 重启后，检索仍可用

---

## 6. P2：写入协议（次日完成）

### 6.1 目标

把“什么该记、记到哪、什么时候写”固定下来，避免记忆垃圾化。

### 6.2 记忆分层

#### 长期记忆：`MEMORY.md`

只记录稳定信息：

- 稳定偏好
- 长期角色关系
- 已验证规则
- 长期项目状态
- 经过复盘沉淀的结论

不写：

- 一次性小任务细节
- 临时情绪
- 未验证猜测
- 每日流水账

#### 每日记忆：`memory/YYYY-MM-DD.md`

记录当天：

- 正在推进的任务
- 新出现的卡点
- 交接信息
- 当天决策
- `[startup]` 恢复记录

#### 不进入记忆

直接排除：

- 没有来源的推测
- 没有确认的身份信息
- 与后续无关的聊天噪音
- 重复、空洞、无行动价值的描述

### 6.3 记忆状态字段（v1 就开始用）

新增简单状态，不追求复杂数据库：

- `draft`：刚记下，未验证
- `verified`：已验证
- `stale`：可能过期
- `deprecated`：已被新信息替代

推荐写法：

```md
- [verified] 当前协作规则：返工时必须同步预计交付时间。
- [draft] 二两可能更适合先做审核者而不是执行者。
```

### 6.4 写入触发条件

以下事件发生后，必须在当日记忆中补 1 条：

- 任务完成
- 任务返工
- 明确决策形成
- 发现系统性错误
- 学到一条后续可复用规则

### 6.5 成功标准

- 连续 3 个任务都能在 daily 里看到对应记录
- `MEMORY.md` 只出现稳定事实，不再混入流水账
- 二两能说清楚“为什么这条写进长期，那条只写当天”

---

## 7. P3：监督机制（次日完成）

### 7.1 目标

不是靠“记得要做”，而是让系统定时检查“有没有做”。

### 7.2 Heartbeat 用途

Heartbeat 负责周期性 awareness，适合管：

- 今天的 daily 文件是否存在
- `[startup]` 是否已经写入
- 最近是否有未收口的任务
- 是否长时间没有更新记忆

### 7.3 建议 HEARTBEAT.md 内容

```md
# Heartbeat checklist

- 检查今天的 `memory/YYYY-MM-DD.md` 是否存在；不存在则创建
- 检查今天是否已有 `[startup]` 记录；没有则提醒补齐
- 检查最近一次任务是否已写入 daily
- 如果超过 8 小时没有任何记忆更新，提示做一次简短同步
- 如果发现记忆检索不可用，立刻报告而不是静默跳过
```

### 7.4 Heartbeat 配置建议

在 `openclaw.json` 中增加：

```json
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "30m",
        "target": "last",
        "activeHours": {
          "start": "08:00",
          "end": "23:00"
        }
      }
    }
  }
}
```

### 7.5 Cron 用途

Cron 只做精确时间的兜底动作，不替代 heartbeat。

建议加两条：

1. **早晨建档**
   - 每天 08:05
   - 检查今天 daily 是否存在，不存在就创建
2. **晚间回顾提醒**
   - 每天 22:30
   - 如果当天任务很多但记忆更新少，提醒补一段 summary

### 7.6 成功标准

- 一周内至少 5 天能自动检测到 daily / startup 状态
- 出现“今天没读记忆”的情况时，系统能主动报警
- 不再完全依赖猫爸人工提醒

---

## 8. P4：记忆清洗（在 P0-P3 稳定后做）

### 8.1 目标

把现有 33 个左右的记忆文件从“可能是垃圾堆”整理成“可以继续索引的干净库”。

### 8.2 清洗顺序

按下面顺序来，不要一口气全删：

1. **空文件**
   - 先列出大小接近 0 的 `.md`
   - 标记为待处理
2. **乱码文件**
   - 先判断是“文件内容编码错”还是“终端显示错”
   - 不确定时保留原件，复制出修复版
3. **重复内容**
   - 同一事实在 daily 和 MEMORY.md 重复出现时，只保留长期版 + 当天版的职责边界
4. **过期规则**
   - 不再适用的规则标为 `deprecated`

### 8.3 清洗策略

v1 阶段不做直接删除，统一采用：

- `保留原件`
- `建立 quarantine 清单`
- `修复后替换`

推荐新增：

- `memory/_cleanup-log.md`
- `memory/_quarantine/`

### 8.4 单次清洗节奏

每次只处理 3-5 个文件，避免一次性大改把历史上下文弄丢。

### 8.5 成功标准

- 空文件数量明显下降
- 乱码文件都有去向记录
- 重要记忆能被稳定索引和召回

---

## 9. 推荐落地顺序（可执行版）

### 第 0 天（当天）

1. 备份 `openclaw.json`
2. 完成 P0：启动必读 + `[startup]` 记录
3. 完成 P1：修 `plugins.slots.memory` 和 `agents.defaults.memorySearch`
4. 重启 Gateway
5. 跑一次 `memory status --deep`
6. 跑一次 `memory search`

### 第 1 天

1. 建立 P2 写入协议
2. 更新 `HEARTBEAT.md`
3. 打开 heartbeat
4. 增加 2 条 cron 兜底任务

### 第 2-3 天

1. 观察是否还会“醒来失忆”
2. 检查 daily / MEMORY.md 是否按协议写入
3. 收集一轮实际问题

### 第 4 天以后

1. 进入 P4 清洗
2. 每次只处理 3-5 个文件
3. 清洗结果写入 `_cleanup-log.md`

---

## 10. 风险与回退

### 风险 1：11440 不是 Ollama embeddings 接口

处理：

- 不要强上 `provider = "ollama"`
- 先确认接口类型，再匹配 provider

### 风险 2：memory-lancedb 已启用，但检索仍不可用

处理：

- 分开排查插件层和 embedding 层
- 插件启用不等于 `memory_search` 自动可用

### 风险 3：heartbeat 开了但还是没人执行

处理：

- 检查 heartbeat 是否真的启用
- 检查 `HEARTBEAT.md` 是否为空
- 检查是否在 group session 中误以为 heartbeat 会工作

### 风险 4：清洗过猛导致历史信息丢失

处理：

- v1 阶段不直接删除
- 统一走 quarantine + cleanup log

---

## 11. 验收清单

只要以下 8 条全部满足，就可以认定“二两记忆系统 v1 已修通”：

- [ ] 新会话启动后会先读 `SOUL.md` / `USER.md` / today / yesterday / `MEMORY.md`
- [ ] 当天 daily 中有 `[startup]` 记录
- [ ] `memory status --deep` 不再是 `Provider: none`
- [ ] 已索引文件数大于 0
- [ ] `memory_search` 能召回真实记忆片段
- [ ] 最近 3 个任务都能在 daily 中找到记录
- [ ] `HEARTBEAT.md` 在提醒“读记忆/补记忆”方面真正工作
- [ ] 空文件/乱码文件进入清洗队列，而不是继续裸奔

---

## 12. 给二两的执行建议

执行时不要追求一步到位，按下面节奏：

- 先修“醒来先读”
- 再修“搜得到”
- 再修“写得准”
- 最后修“历史垃圾”

一句话版：

> 先让记忆能回来，再让记忆能搜索，再让记忆写得值钱，最后才谈记忆变聪明。

---

制定者：Q小虎  
版本：v1  
日期：2026-03-12
