# P4 记忆清洗 v1

制定对象：二两的记忆系统  
适用范围：`memory/`、`qxiaohu-erliang-collab/memory/`、`MEMORY.md`  
前置依赖：P0 启动必读、P1 检索配置、P2 写入协议、P3 监督机制  
版本目标：把现有记忆文件从"可能堆积垃圾"整理成"可索引、可复用、可持续维护的干净库"

---

## 0. 目标一句话

在不动原始数据的前提下，盘点、清点、隔离、修复现有记忆文件，用小步快跑的方式完成清洗，并建立可追溯的清理日志。

---

## 1. 清洗范围

本次清洗覆盖两个记忆仓库：

| 仓库 | 路径 | 文件数 | 性质 |
|------|------|--------|------|
| 个人运行时记忆 | `memory/` | 2 | 当天/近期 daily、模板 |
| 协作共享记忆 | `qxiaohu-erliang-collab/memory/` | 3 | 协作记录、任务模板、示例 |

**不在本次清洗范围内：**
- `outputs/`、`plans/`、`tasks/`（非记忆体系）
- `partner-summaries/`、`profiles/`（当前有效）
- `MEMORY.md`（长期记忆池，需 P4 完成后单独处理瘦身）

---

## 2. 当前库存清单

### 2.1 核心记忆文件列表

| 路径 | 大小 | BOM | 替换符 | 状态评估 |
|------|------|-----|--------|----------|
| `memory/2026-03-11.md` | 3627 | 无 | 0 | 正常（历史 daily，需归档或清理） |
| `memory/伙伴任务/任务模板.md` | 456 | 有 | 0 | 模板文件，需去 BOM |
| `qxiaohu-erliang-collab/memory/协作记忆总表.md` | 469 | 无 | 0 | 含过时信息（见 2.2），需更新 |
| `qxiaohu-erliang-collab/memory/伙伴任务/任务模板.md` | 456 | 有 | 0 | 模板文件，需去 BOM |
| `qxiaohu-erliang-collab/memory/伙伴任务/示例任务-任务模板使用示例.md` | 1575 | 有 | 0 | 正常示例 |

### 2.2 已识别问题

| # | 问题类型 | 位置 | 详情 |
|---|----------|------|------|
| 1 | 过时信息 | `qxiaohu-erliang-collab/memory/协作记忆总表.md` 第 21、24 行 | 含机器路径 `G:\qxiaohu-erliang-collab` + 状态 "等待Q小虎Clone仓库"（已过时应删除或更新） |
| 2 | BOM 标记 | 3 个文件 | `任务模板.md`（两处重复）、`示例任务...md` 含 UTF-8 BOM，导致部分终端显示异常 |
| 3 | 跨仓库重复 | 两处 `任务模板.md` | `memory/伙伴任务/任务模板.md` 与 `qxiaohu-erliang-collab/memory/伙伴任务/任务模板.md` 内容完全相同（SHA256 一致），存在冗余 |
| 4 | 待归档历史 daily | `memory/2026-03-11.md` | 3 月 11 日的 daily 已过期（当前为 3 月 13 日），但内容有历史价值，建议归档而非直接删除 |

---

## 3. 清洗策略

### 3.1 安全原则

1. **不动原件**：所有修复操作生成新文件，原件移入 quarantine
2. **修复前备份**：每次修复前记录原文快照到 `_cleanup-log.md`
3. **小批量执行**：每次只处理 1-2 个文件，避免大规模改动导致上下文丢失
4. **可回滚**：所有操作记录到日志，必要时可还原

### 3.2 修复动作对照表

| 问题 | 动作 | 输出 |
|------|------|------|
| BOM 标记 | 去除 BOM，保留内容 | 同路径新文件 + 旧文件进 quarantine |
| 过时信息 | 删除过时行或更新为当前状态 | 更新后的文件 + 旧版本进 quarantine |
| 跨仓库重复 | 保留一处，另一处标记为"已迁移"或删除 | 清理后统一模板位置 |
| 待归档历史 daily | 移动到 `memory/archive/` | 归档目录，原位置可删除或保留占位 |

### 3.3 禁止动作

- 禁止直接删除任何记忆文件（必须先 quarantine）
- 禁止不做日志的修改
- 禁止一次性批量处理整个目录

---

## 4. 执行步骤

### Batch 1：修复 BOM（优先级最高）

**目标**：消除 UTF-8 BOM 导致的显示问题

**涉及文件**（3 个）：
1. `memory/伙伴任务/任务模板.md`
2. `qxiaohu-erliang-collab/memory/伙伴任务/任务模板.md`
3. `qxiaohu-erliang-collab/memory/伙伴任务/示例任务-任务模板使用示例.md`

**执行脚本**：

```powershell
# 去除 BOM 脚本 (save as remove-bom.ps1)
$files = @(
  "memory\伙伴任务\任务模板.md",
  "qxiaohu-erliang-collab\memory\伙伴任务\任务模板.md",
  "qxiaohu-erliang-collab\memory\伙伴任务\示例任务-任务模板使用示例.md"
)

foreach ($f in $files) {
  $content = Get-Content -Path $f -Raw -Encoding UTF8
  if ($content -match "^\uFEFF") {
    $clean = $content -replace "^\uFEFF", ""
    # 备份原件
    Copy-Item $f "$f.bak"
    # 写入无 BOM 版本
    Set-Content -Path $f -Value $clean -NoNewline -Encoding UTF8
    Write-Host "[CLEANED] BOM removed: $f"
  } else {
    Write-Host "[SKIP] No BOM: $f"
  }
}
```

**验证**：运行后用十六进制编辑器检查文件头是否为 `23 23 23`（`###`）而非 `EF BB BF`

**通过标准**：3 个文件的 BOM 全部去除

---

### Batch 2：清理过时信息

**目标**：更新 `协作记忆总表.md`，移除已过时条目

**涉及文件**：
- `qxiaohu-erliang-collab/memory/协作记忆总表.md`

**待删除/更新内容**：
- 第 21 行：`- Git仓库已创建：G:\qxiaohu-erliang-collab`（机器路径，应改为相对路径或标注为历史）
- 第 24 行：`- 等待Q小虎Clone仓库`（已过时效，应标注完成或删除）

**修复后版本**（建议）：

```markdown
# 协作记忆总表

## 2026-03-12 第一阶段

### 互相认识

- 二两生成个人档案 v1.1
- Q小虎生成个人档案 v1
- 互相交换伙伴摘要
- 第一阶段完成

### 第二阶段卡住

- 问题：两台电脑路径不同，记忆不互通
- 解决方案：建立Git共享仓库

---

## 当前状态

- Git仓库已创建：qxiaohu-erliang-collab/
- 8个目录已创建
- 第一批文件已放入
- 已完成：Q小虎已Clone仓库并开始协作
```

**执行**：手动编辑，保留原文件到 `_quarantine/`

**通过标准**：
- 文件中不再包含机器路径 `G:\`
- 文件中不再包含 "等待Q小虎Clone仓库"

---

### Batch 3：去重整合

**目标**：消除 `任务模板.md` 的跨仓库重复

**现状**：
- `memory/伙伴任务/任务模板.md`（有 BOM，已修复）
- `qxiaohu-erliang-collab/memory/伙伴任务/任务模板.md`（有 BOM，已修复）

**决策**：保留 `qxiaohu-erliang-collab/memory/伙伴任务/` 下的模板（因为该目录是协作共享区），删除或标记根目录的重复副本

**执行**：
1. 将 `memory/伙伴任务/任务模板.md` 重命名为 `memory/伙伴任务/任务模板.md.migrated`
2. 在文件开头添加一行说明：`> [已迁移] 本模板已移至 qxiaohu-erliang-collab/memory/伙伴任务/`

**通过标准**：`memory/` 下不再存在重复的 `任务模板.md`

---

### Batch 4：归档历史 daily

**目标**：整理已过期的 daily 文件

**涉及文件**：
- `memory/2026-03-11.md`（3 月 11 日，距今 2 天）

**处理方式**：
1. 创建目录 `memory/archive/`
2. 移动 `memory/2026-03-11.md` 到 `memory/archive/2026-03-11.md`
3. 在原位置保留一个占位文件（可选）：

```markdown
# 2026-03-11

> 已归档至 memory/archive/2026-03-11.md
```

**通过标准**：`memory/` 根目录的 daily 文件只保留当日（2026-03-13），历史文件全部在 `archive/` 中

---

## 5. 清理日志

每次操作完成后，必须在 `memory/_cleanup-log.md`（或 `qxiaohu-erliang-collab/memory/_cleanup-log.md`）中记录：

```markdown
# 记忆清洗日志

## 2026-03-13

### Batch 1：BOM 修复
- [x] memory/伙伴任务/任务模板.md - 去除 BOM
- [x] qxiaohu-erliang-collab/memory/伙伴任务/任务模板.md - 去除 BOM
- [x] qxiaohu-erliang-collab/memory/伙伴任务/示例任务-任务模板使用示例.md - 去除 BOM
- 备份：*.bak 文件在同目录

### Batch 2：过时信息清理
- [x] 协作记忆总表.md - 删除机器路径 G:\、更新"等待Clone"状态
- 原件已移至 _quarantine/协作记忆总表.md.bak

### Batch 3：去重
- [x] memory/伙伴任务/任务模板.md - 标记为已迁移

### Batch 4：归档
- [x] memory/2026-03-11.md - 移至 memory/archive/
```

---

## 6. Quarantine 目录结构

清洗过程中产生的备份文件统一放入：

```
memory/
├── _quarantine/
│   ├── 任务模板.md.bak
│   ├── 协作记忆总表.md.bak
│   └── ...
└── _cleanup-log.md
```

或（在协作仓库）：

```
qxiaohu-erliang-collab/memory/
├── _quarantine/
│   └── ...
└── _cleanup-log.md
```

---

## 7. 验证步骤

每批次完成后，执行以下验证：

| 批次 | 验证动作 | 预期结果 |
|------|----------|----------|
| Batch 1 | 十六进制检查文件头 | 不以 `EF BB BF` 开头 |
| Batch 2 | 全文搜索 "G:\\|等待Q小虎Clone仓库" | 无匹配 |
| Batch 3 | 检查 `memory/伙伴任务/任务模板.md` | 不存在或已标记迁移 |
| Batch 4 | 检查 `memory/archive/2026-03-11.md` | 文件存在 |

**整体验证**：运行向量检索，确认清洗后的记忆仍可被索引和召回

```bash
# 假设 memorySearch 已修复（P1 完成）
openclaw memory search "任务模板"
# 应返回修复后的模板内容
```

---

## 8. 成功标准

满足以下全部条件，P4 清洗 v1 算通过：

- [ ] 所有 BOM 文件已去除（3 个）
- [ ] `协作记忆总表.md` 不再包含过时机器路径和无效状态
- [ ] 重复模板文件已去重或标记迁移
- [ ] 历史 daily 已归档
- [ ] `_cleanup-log.md` 记录了所有操作
- [ ] `_quarantine/` 包含所有原件备份
- [ ] 清洗后的记忆仍可被 `memory_search` 正常检索

---

## 9. 后续建议

### P4.1：MEMORY.md 瘦身（下次处理）

当前 `MEMORY.md` 可能已积累较多内容，建议：

1. 检查是否超过 2000 行
2. 识别 `[stale]` 或 `[deprecated]` 标记
3. 将已过期条目移入 `MEMORY.md.archive/`

### P4.2：自动化清洗脚本

长期来看，可将本次手工清洗过程固化为脚本：

- `scripts/cleanup-memory-bom.ps1`
- `scripts/cleanup-memory-archive.ps1`

### P4.3：定期清洗节奏

建议每两周执行一次小批量清洗（每次 3-5 个文件），避免一次性大规模改动。

---

## 10. 风险与回退

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 去 BOM 导致文件编码错乱 | 文件不可读 | 保留 .bak 备份，可一键还原 |
| 误删有用历史信息 | 丢失上下文 | 统一走 quarantine，不直接删除 |
| 清洗后检索失效 | memory_search 不可用 | P1 修复后统一验证 |

---

## 11. 关联文档

- P0 启动必读：`erliang-memory-remediation-v1.md` 第 4 节
- P1 检索配置：`erliang-memory-remediation-v1.md` 第 5 节
- P2 写入协议：`p2-writing-protocol-v1.md`
- P3 监督机制：`p3-supervision-mechanism-v1.md`

---

制定者：Q小虎  
版本：v1  
日期：2026-03-13  
文件名：`p4-memory-cleanup-v1.md`（ASCII 友好）
