# erliang Memory System Scheme

> Version: v1.0
> Status: Official Release
> Date: 2026-03-14

---

## 1. Why Build This System

### 1.1 Problem Background

Core challenges for AI assistant during long-term operation:
- **Memory Loss**: Context lost after model refresh
- **Retrieval Failure**: Cannot search when embedding service crashes
- **Write Chaos**: Don't know where/how to mark new memories
- **Quality Issues**: History files have encoding issues, empty files, low-quality content

### 1.2 Goals

Enable erliang (AI assistant) to:
1. **Remember** - Important info not lost
2. **Retrieve** - Find when needed
3. **Self-heal** - Auto fix when issues occur
4. **Evolve** - Continuously improve

---

## 2. System Architecture

### 2.1 Overall Structure

```
+=========================================+
|         Wake-up Self-check             |
|   (auto-run after model refresh)        |
+=========================================+
|         Memory Storage Layer            |
+=========================================+
|  Short-term  |  Long-term  |  Learn   |
|   (daily)    |  (MEMORY)   | (.learn)|
+=========================================+
|         Retrieval Layer                  |
|     (embedding + LanceDB)              |
+=========================================+
|         Monitoring Layer                 |
|   (auto check + structured record)      |
+=========================================+
```

### 2.2 Core Files

| File | Purpose |
|------|---------|
| MEMORY.md | Long-term memory (identity, user info, important matters) |
| USER.md | Current user preferences and tasks |
| memory/YYYY-MM-DD.md | Daily work log |
| .learnings/*.md | Learning notes |

---

## 3. P0-P4 Definitions

### P0: Infrastructure
- Embedding service deployment
- LanceDB database initialization
- Retrieval API configuration

### P1: Retrieval Recovery
- Embedding service fault recovery
- Index rebuild
- Retrieval verification

### P2: Write Protocol
- Define what to write
- Determine write location
- Standardize status markers
- Define template format

### P3: Monitoring Mechanism
- Scheduled embedding service check
- Gateway status check
- Empty/anomaly file scan
- Structured check records

### P4: Cleanup & Freeze
- Normal file organization
- Historical damaged file freeze
- Backfill strategy

---

## 4. What Was Fixed This Time

### 4.1 P1 Fix
- Embedding service recovery (port 11440)
- Retrieval verified working
- Index rebuilt to 39/39

### 4.2 P2 Implementation
- Defined write types: identity/preference/daily/learning/temp
- Determined write locations and status markers
- Created minimum templates

### 4.3 P3 Establishment
- Fixed check output format (JSON)
- Auto record for each check

### 4.4 P4 Processing
- Scanned and froze 22 historical damaged files
- Confirmed normal files don't need cleanup

---

## 5. Current Status

### 5.1 Completion Status

| Item | Status |
|------|--------|
| P0 Infrastructure | Done |
| P1 Retrieval Recovery | Done, Stable |
| P2-A Write Protocol Definition | Done |
| P2-B Write Protocol Verification | In Progress |
| P3 Monitoring Mechanism | Stable |
| P4-A Historical Freeze | Frozen (22 files) |
| P4-B Normal Files | No cleanup needed |

### 5.2 System Status

- Embedding service: Running (port 11440)
- Gateway: Running (port 18789)
- Retrieval: Normal
- Index: 39/39

---

## 6. Reusable Parts

### 6.1 Startup Checklist

Run after each model refresh:
1. Read MEMORY.md - Confirm who I am
2. Read USER.md - Confirm task
3. Read memory/today.md - Confirm today's work
4. Scan .learnings/ - Load recent 3 files
5. Check embedding service status

### 6.2 Retrieval Config Rules

- Embedding service port: 11440
- Model: all-MiniLM-L6-v2
- Verify command: `netstat -ano | findstr "11440"`

### 6.3 Write Protocol Template

```markdown
# Memory Entry

> Time: 2026-03-14
> Type: [identity/preference/daily/learning/temp]
> Status: [draft/confirmed/archived]

## Core Content
- ...

## Source
- ...

## Next Need
- ...
```

### 6.4 Monitoring Format

```json
{
  "timestamp": "2026-03-14T04:10:00Z",
  "checks": [
    {"item": "embedding_service", "status": "ok", "detail": "Port 11440 normal"},
    {"item": "gateway", "status": "ok", "detail": "Port 18789 normal"},
    {"item": "empty_files", "status": "ok", "detail": "No empty files"}
  ],
  "anomalies": [],
  "actions": []
}
```

### 6.5 Cleanup/Freeze Boundaries

| Type | Boundary | Handling |
|------|----------|----------|
| Empty file | < 50 bytes | Check if valid |
| Small file | < 200 bytes | Check content value |
| Corrupted file | Filename/content corrupted | Freeze, no auto-fix |
| Low quality | Duplicate > 80% | Evaluate then process |

### 6.6 Embedding Service Deployment

**Start command:**
```bash
python embedding_server.py
```

**Verify:**
```bash
netstat -ano | findstr "11440"
```

**Restart:**
```bash
# Kill old process first
taskkill /PID <PID> /F
# Then start
python embedding_server.py
```

---

## 7. Acceptance Criteria

### P1 Acceptance
- [ ] Embedding service running
- [ ] Retrieval working
- [ ] Index complete

### P2 Acceptance
- [ ] Write types defined
- [ ] Location standards determined
- [ ] Status markers unified
- [ ] Templates created

### P3 Acceptance
- [ ] Check format fixed
- [ ] Auto record implemented
- [ ] Scheduled checks running

### P4 Acceptance
- [ ] Problem files frozen
- [ ] Normal files confirmed
- [ ] Boundaries defined

---

## 8. Troubleshooting

### 8.1 Embedding Service Won't Start

**Symptom:** Port 11440 not listening

**Debug:**
1. Check Python process: `Get-Process python`
2. Check error logs
3. Restart service

### 8.2 Retrieval Returns Empty

**Symptom:** Search returns no results

**Debug:**
1. Verify service status
2. Verify index integrity
3. Check LanceDB data

### 8.3 File Encoding Issues

**Symptom:** Filename/content shows garbled characters

**Cause:** Encoding issue during write

**Handling:** Freeze processing, no auto-fix

---

**Document Location: memory/ directory**
**Version Control: Git**
