# P2 Write Protocol

> Version: v1.0
> Status: Completed
> Date: 2026-03-14

---

## 1. Protocol Goals

Standardize memory writing behavior, solve:
- Don't know what to write
- Don't know where to write
- Don't know how to mark status

---

## 2. Write Type Definitions

| Type | Write Location | Status Marker | Example |
|------|---------------|---------------|---------|
| Identity/Long-term | MEMORY.md | [confirmed] | User birthday, anniversary |
| User Preference | USER.md | [confirmed] | Chat style, emoji preference |
| Daily Work Log | memory/YYYY-MM-DD.md | [draft->confirmed] | Completed tasks, todos |
| Learning Notes | .learnings/*.md | [draft] | New skills, knowledge |
| Temp/Pending | memory/temp.md | [draft] | Info needing confirmation |

---

## 3. Status Markers

| Status | Meaning | Use Case |
|--------|---------|----------|
| [draft] | Draft/Pending confirmation | Newly written content, awaiting confirmation |
| [confirmed] | Confirmed | Verified reliable information |
| [archived] | Archived | Outdated but need to keep |

---

## 4. Minimum Template

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

---

## 5. Write Checklist

Before each write, check:
- [ ] Is this worth recording? (not流水账)
- [ ] Is it in the correct location?
- [ ] Is status marked?
- [ ] Can it be retrieved next time?

---

## 6. Implemented Files

- MEMORY.md - Added status markers
- memory/user_memory.md - Added status markers

---

## 7. Pending Verification (P2-B)

Observe if new memory writes follow the protocol:
- [ ] Using correct types
- [ ] Using correct locations
- [ ] Marking status
- [ ] Using template format

---

**Maintained in: memory/MEMORY_SYSTEM_OVERVIEW.md**
