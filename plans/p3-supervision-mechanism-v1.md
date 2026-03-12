# P3 监督机制 v1

制定对象：二两的记忆系统  
适用范围：HEARTBEAT.md、Cron 任务、Alert 监控  
前置依赖：P0 启动必读、P1 检索配置、P2 写入协议  
版本目标：将“记得要做”变成“系统自动检查”，形成记忆闭环。

---

## 0. 目标一句话

让系统自动检查“有没有读、有没有写、有没有坏”，不再依赖人工记得。

---

## 1. 职责划分：Heartbeat vs Cron

| 维度 | Heartbeat | Cron |
|------|------------|------|
| **触发方式** | 被动轮询（每隔 N 分钟） | 主动定时（精确时间） |
| **执行位置** | 主会话内部 | 独立进程/子会话 |
| **适用场景** | 批量 awareness 检查、状态轮询 | 精确时间兜底、强制创建文件 |
| **优势** | 上下文共享、可组合判断 | 时间精确、隔离性好 |
| **劣势** | 时间不精确、受会话状态影响 | 孤立执行、无法共享上下文 |

### 1.1 归类原则

**归入 Heartbeat：**
- 检查今天 daily 是否存在
- 检查是否有 `[startup]` 记录
- 检查最近是否有过记忆写入
- 检查 memory search 是否可用

**归入 Cron：**
- 每天 08:05 强制创建今天 daily（精确时间）
- 每天 22:30 检查当天记忆是否过少
- 每周一 09:00 检查 MEMORY.md 是否需要更新

---

## 2. HEARTBEAT.md 清单设计

### 2.1 完整 checklist

```markdown
# Heartbeat checklist

## 2.1.1 启动检查（每次 heartbeat 都做）
- [ ] 检查今天的 `memory/YYYY-MM-DD.md` 是否存在
  - 不存在：创建并写入 `[startup]` 模板
- [ ] 检查今天是否已有 `[startup]` 记录
  - 没有：立即写入 `[startup]`
- [ ] 检查上次会话是否有未收口任务
  - 有：在今天 daily 中继续记录

## 2.1.2 记忆写入检查（每次 heartbeat 都做）
- [ ] 距离上次记忆写入是否超过 4 小时
  - 是：提醒自己是否需要同步当前状态
- [ ] 最近是否有任务完成/返工/决策但未写入
  - 是：补写 daily 记录

## 2.1.3 检索健康检查（每次 heartbeat 都做）
- [ ] 测试 `memory_search` 是否可用
  - 不可用：记录 alert，不静默跳过
- [ ] 已索引文件数是否大于 0
  - 是 0：记录 alert

## 2.1.4 周期性深度检查（每 3 次 heartbeat 做一次）
- [ ] 检查昨天 daily 是否存在（如果今天还没检查过昨天）
- [ ] 检查 MEMORY.md 长度是否超过 2000 行
  - 超过：标记待瘦身
- [ ] 检查是否有 3 天以上的 daily 完全空白
  - 有：记录待清理
```

### 2.2 状态跟踪文件

创建 `memory/heartbeat-state.json` 用于跨 heartbeat 状态跟踪：

```json
{
  "lastStartupCheck": "2026-03-13T08:05:00Z",
  "lastMemoryWrite": "2026-03-13T10:30:00Z",
  "lastDeepCheck": "2026-03-13T08:00:00Z",
  "startupMissingCount": 0,
  "searchUnavailableCount": 0,
  "alerts": []
}
```

每次 heartbeat 读取该文件，更新字段后写回。

---

## 3. Alert 条件矩阵

### 3.1 红色 Alert（立即需要人工介入）

| 条件 | 触发阈值 | 动作 |
|------|----------|------|
| 启动后 30 分钟内无 `[startup]` | 1 次 | 通知：立即补写 startup |
| `memory_search` 连续 3 次不可用 | 3 次 | 报告：检索可能已坏 |
| 已索引文件数突然降为 0 | 1 次 | 报告：索引可能丢失 |

### 3.2 黄色 Alert（当天需要处理）

| 条件 | 触发阈值 | 动作 |
|------|----------|------|
| 今天 daily 不存在且当前时间 > 08:10 | 1 次 | 自动创建 + 标记需补 startup |
| 超过 8 小时无任何记忆写入 | 1 次 | 提醒：是否需要同步状态 |
| 昨天 daily 完全空白 | 1 次 | 记录：可能漏记 |

### 3.3 蓝色 Alert（定期清理提示）

| 条件 | 触发阈值 | 动作 |
|------|----------|------|
| MEMORY.md 超过 2000 行 | 1 次 | 标记待瘦身 |
| 存在 7 天以上空白 daily | 1 次 | 标记待清理 |
| 单一事实同时出现在 daily 和 MEMORY.md | 1 次 | 标记需去重 |

---

## 4. Cron 配置建议

### 4.1 早晨建档（精确时间兜底）

```bash
# 每天 08:05 检查并创建今天 daily
# 如果已存在则跳过
```

**实现方式：**  
在 OpenClaw 所在机器的 crontab 或任务计划中添加：

```cron
5 8 * * * cd /home/erliang/.openclaw/workspace && node -e "
const fs = require('fs');
const path = require('path');
const today = new Date().toISOString().slice(0,10);
const file = path.join('memory', today + '.md');
if (!fs.existsSync(file)) {
  fs.writeFileSync(file, '# ' + today + '\n\n## [startup] ' + new Date().toISOString().slice(0,16).replace('T', ' ') + '\n- 自动创建\n');
  console.log('Created ' + file);
}
"
```

### 4.2 晚间回顾提醒

```bash
# 每天 22:30 检查当天记忆更新次数
# 如果少于 2 条，发送提醒
```

**实现方式：**

```cron
30 22 * * * cd /home/erliang/.openclaw/workspace && node -e "
const fs = require('fs');
const path = require('path');
const today = new Date().toISOString().slice(0,10);
const file = path.join('memory', today + '.md');
if (fs.existsSync(file)) {
  const content = fs.readFileSync(file, 'utf8');
  const memCount = (content.match(/- \[.*\]/g) || []).length;
  if (memCount < 2) console.log('ALERT: Today has only ' + memCount + ' memory entries. Consider adding a summary.');
}
"
```

### 4.3 周维护

```bash
# 每周一 09:00 检查 MEMORY.md 长度和清洗需求
```

---

## 5. 验证步骤

### 5.1 模拟启动失败

1. 删除今天的 `memory/2026-03-13.md`
2. 重启会话
3. 检查：是否自动创建文件？是否有 `[startup]` 记录？
4. **通过标准**：文件自动创建 + 有 startup 记录

### 5.2 模拟记忆漏写

1. 手动删除今天任何 memory 条目
2. 等待超过 4 小时后的下一次 heartbeat
3. 检查：是否在 console 或日志中提示"超过 4 小时无写入"？
4. **通过标准**：有提醒输出

### 5.3 模拟检索损坏

1. 临时修改配置使 `memorySearch` 失效
2. 触发 heartbeat
3. 检查：是否在 alerts 中记录"search unavailable"？
4. **通过标准**：不静默跳过，有 alert 记录

### 5.4 模拟 cron 兜底

1. 确保今天 daily 不存在
2. 手动运行早晨 cron 脚本
3. 检查：是否创建了文件？内容是否包含 `[startup]`？
4. **通过标准**：文件存在 + 有基本模板

---

## 6.  rollout 顺序

### 第 1 天：部署 Heartbeat 清单

1. 创建 `memory/heartbeat-state.json`（初始化为空状态）
2. 更新 `HEARTBEAT.md` 为完整 checklist（见 2.1）
3. 手动触发一次 heartbeat，观察日志输出
4. 验证：是否能检测到"今天 daily 不存在"这个状态？

### 第 2 天：启用 Cron 兜底

1. 添加早晨 08:05 cron 任务
2. 添加晚间 22:30 cron 任务
3. 验证：第二天早上检查是否自动创建了 daily

### 第 3 天：Alert 联调

1. 故意制造红色 alert 场景
2. 检查 alert 是否被正确触发和记录
3. 验证完整链路：检测 -> 记录 -> 通知

---

## 7. 通过标准

满足以下全部条件，P3 监督机制 v1 算通过：

- [ ] `HEARTBEAT.md` 包含完整的 2.1 节 checklist
- [ ] `memory/heartbeat-state.json` 存在并被更新
- [ ] 至少 1 条 cron 任务已部署并验证有效
- [ ] 红色/黄色 alert 条件各至少有 1 条能被触发
- [ ] 连续 3 天，每天都有 startup 检查记录
- [ ] 出现"今天没读记忆"的情况时，系统能主动报警（不是静默跳过）

---

## 8. 风险与回退

### 风险 1：Heartbeat 频繁触发导致 token 消耗

**处理：**  
将 heartbeat 间隔设为 30 分钟（不要低于 15 分钟），deep check 每 3 次做一次。

### 风险 2：Cron 和 Heartbeat 重复检查

**处理：**  
明确分工：Heartbeat 负责"发现"，Cron 负责"兜底创建"。Heartbeat 不负责创建文件，Cron 只在精确时间创建。

### 风险 3：Alert 太多导致狼来了

**处理：**  
Alert 加次数阈值（见第 3 节），不一次就报，只在重复确认后报。

---

## 9. 关联文档

- P0 启动必读：`erliang-memory-remediation-v1.md` 第 4 节
- P1 检索配置：`erliang-memory-remediation-v1.md` 第 5 节
- P2 写入协议：`p2-writing-protocol-v1.md`
- 记忆清洗：`erliang-memory-remediation-v1.md` 第 8 节

---

制定者：Q小虎  
版本：v1  
日期：2026-03-13  
