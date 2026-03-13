# P3 监督机制文档

> 版本：v1.0
> 状态：已完成
> 日期：2026-03-14

---

## 1. 监督机制目标

定时检查记忆系统各组件状态，确保：
- embedding 服务正常运行
- Gateway 正常工作
- 文件无异常
- 检查结果自动留痕

---

## 2. 检查项目清单

| 检查项 | 验证方法 | 频率 |
|--------|---------|------|
| embedding 服务 | `netstat -ano \| findstr "11440"` | 每次检查 |
| Gateway | `openclaw gateway status` | 每次检查 |
| 空文件扫描 | 检查 < 50 bytes 文件 | 每天 |
| 乱码文件 | 检查文件名/内容异常 | 每天 |

---

## 3. 检查输出格式

每次检查输出固定 JSON 格式：

```json
{
  "timestamp": "2026-03-14T04:10:00Z",
  "checks": [
    {"item": "embedding_service", "status": "ok", "detail": "端口 11440 LISTENING"},
    {"item": "gateway", "status": "ok", "detail": "127.0.0.1:18789 正常"},
    {"item": "empty_files", "status": "ok", "detail": "无空文件"}
  ],
  "anomalies": [],
  "actions": []
}
```

---

## 4. 状态值说明

| 状态 | 含义 |
|------|------|
| ok | 正常 |
| warning | 警告 |
| error | 错误 |
| skipped | 跳过 |

---

## 5. 自动留痕规则

- 每次检查结果记录到 `memory/2026-03-14.md`
- 异常情况记录到 `anomalies` 数组
- 采取的动作记录到 `actions` 数组

---

## 6. 验收标准

- [x] 检查格式已固定为 JSON
- [x] 每次检查自动留痕
- [x] 定时检查已运行

---

**维护：memory/MEMORY_SYSTEM_OVERVIEW.md**
