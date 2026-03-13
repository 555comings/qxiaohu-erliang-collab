# Embedding 服务部署与恢复文档

> 版本：v1.0
> 状态：已完成
> 日期：2026-03-14

---

## 1. 服务概述

- **服务名**：embedding-server
- **端口**：11440
- **模型**：all-MiniLM-L6-v2
- **功能**：文本向量化，用于记忆检索

---

## 2. 启动方法

### 2.1 启动命令

```bash
python embedding_server.py
```

或使用批处理文件：

```bash
start_embedding.bat
```

### 2.2 验证服务运行

```bash
netstat -ano | findstr "11440"
```

**预期输出：**
```
TCP    0.0.0.0:11440          0.0.0.0:0              LISTENING       <PID>
```

---

## 3. 重启方法

### 3.1 找到进程 PID

```bash
netstat -ano | findstr "11440"
```

### 3.2 结束进程

```bash
taskkill /PID <PID> /F
```

### 3.3 重新启动

```bash
python embedding_server.py
```

---

## 4. 故障排查

### 4.1 端口被占用

**症状：** 启动失败，端口已被占用

**解决：**
1. 找到占用端口的进程：`netstat -ano | findstr "11440"`
2. 结束该进程或使用其他端口

### 4.2 模型下载失败

**症状：** 首次启动报错

**解决：**
1. 检查网络连接
2. 使用国内镜像源
3. 手动下载模型

### 4.3 检索无结果

**排查步骤：**
1. 确认服务运行：`netstat -ano | findstr "11440"`
2. 测试 API：`curl http://localhost:11440/health`
3. 检查 LanceDB 数据

---

## 5. 相关文件

- `embedding_server.py` - 服务主程序
- `start_embedding.bat` - 启动批处理
- `embedding_service_README.md` - 原始说明文档
- `requirements.txt` - Python 依赖

---

**维护：memory/MEMORY_SYSTEM_OVERVIEW.md**
