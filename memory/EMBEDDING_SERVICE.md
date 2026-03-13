# Embedding Service Deployment and Recovery

> Version: v1.0
> Status: Completed
> Date: 2026-03-14

---

## 1. Service Overview

- **Service name**: embedding-server
- **Port**: 11440
- **Model**: all-MiniLM-L6-v2
- **Function**: Text vectorization for memory retrieval

---

## 2. Startup Method

### 2.1 Start Command

```bash
python embedding_server.py
```

Or use batch file:

```bash
start_embedding.bat
```

### 2.2 Verify Service Running

```bash
netstat -ano | findstr "11440"
```

**Expected output:**
```
TCP    0.0.0.0:11440          0.0.0.0:0              LISTENING       <PID>
```

---

## 3. Restart Method

### 3.1 Find Process PID

```bash
netstat -ano | findstr "11440"
```

### 3.2 Kill Process

```bash
taskkill /PID <PID> /F
```

### 3.3 Restart

```bash
python embedding_server.py
```

---

## 4. Troubleshooting

### 4.1 Port Already in Use

**Symptom:** Startup failed, port already in use

**Solution:**
1. Find process using port: `netstat -ano | findstr "11440"`
2. Kill that process or use different port

### 4.2 Model Download Failed

**Symptom:** First run error

**Solution:**
1. Check network connection
2. Use domestic mirror
3. Download model manually

### 4.3 Retrieval Returns Empty

**Debug steps:**
1. Verify service running: `netstat -ano | findstr "11440"`
2. Test API: `curl http://localhost:11440/health`
3. Check LanceDB data

---

## 5. Configuration

### 5.1 Port Configuration

In `embedding_server.py`:

```python
app.run(host='0.0.0.0', port=11440)
```

### 5.2 Model Configuration

```python
model = SentenceTransformer('all-MiniLM-L6-v2')
```

---

## 6. Related Files

- `embedding_server.py` - Service main program
- `start_embedding.bat` - Startup batch file
- `embedding_service_README.md` - Original documentation
- `requirements.txt` - Python dependencies

---

**Maintained in: memory/MEMORY_SYSTEM_OVERVIEW.md**
