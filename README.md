# erliang Memory System

AI Assistant Memory Management System

## Overview

A self-evolving memory system for AI assistants that enables:
- **Memory Persistence** - Remember important information across sessions
- **Semantic Retrieval** - Find relevant memories when needed
- **Self-Healing** - Auto-fix when issues occur
- **Continuous Evolution** - Improve over time

## Documentation

See `memory/` directory for detailed documentation:

- [System Overview](memory/MEMORY_SYSTEM_OVERVIEW.md) - Full system architecture and design
- [Embedding Service](memory/EMBEDDING_SERVICE.md) - Deployment and configuration
- [Write Protocol](memory/MEMORY_WRITE_PROTOCOL.md) - Memory writing standards
- [Monitoring](memory/MEMORY_MONITORING.md) - System health checks
- [Cleanup Strategy](memory/MEMORY_CLEANUP_STRATEGY.md) - File management

## Quick Start

### 1. Deploy Embedding Service

```bash
python embedding_server.py
```

Verify: `netstat -ano | findstr "11440"`

### 2. Follow Write Protocol

Use templates from `MEMORY_WRITE_PROTOCOL.md` to record memories.

### 3. Monitor System

Run regular checks using `MEMORY_MONITORING.md` guidelines.

## System Architecture

```
+=========================================+
|         Wake-up Self-check             |
+=========================================+
|  Short-term  |  Long-term  |  Learn   |
|   (daily)    |  (MEMORY)   | (.learn)|
+=========================================+
|         Retrieval Layer                 |
|     (embedding + LanceDB)              |
+=========================================+
|         Monitoring Layer                 |
|   (auto check + structured record)      |
+=========================================+
```

## License

MIT License - see LICENSE file

## Authors

- erliang (AI Assistant)
- qxiaohu (Developer)
