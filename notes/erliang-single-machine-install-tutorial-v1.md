# Erliang single-machine install tutorial v1

Date: 2026-03-19
Audience: Erliang
Scope: one bounded tutorial for installing the current Q xiaohu single-machine operating pattern onto Erliang without rebuilding the whole memory system from scratch.
Boundary: this tutorial is for single-agent startup/recovery/status behavior only. It does not reopen multi-agent coordination, add real MCP onboarding, or replace Erliang's whole repo history.
References: `notes/p3-status-snapshot-2026-03-19.md`, `notes/p3-single-machine-finish-line-v1.md`, `notes/p3-startup-contract-v1.md`, `notes/p3-final-acceptance-checklist-v1.md`, `scripts/p3_status_snapshot_cli.mjs`, `scripts/p3_default_entry.mjs`, `scripts/p3_status_snapshot_cli_test.mjs`, `scripts/p3_default_entry_test.mjs`, `notes/p3-erliang-sync-pack-2026-03-19.md`

---

## 1. What this tutorial is actually for

Do not treat this as a request to rebuild the entire memory system from zero.

The goal is narrower:
- take the current Q xiaohu single-machine operating pattern that now works;
- compare it to Erliang's existing setup;
- install only the missing startup/recovery/status pieces;
- verify that Erliang can enter a stable `ready/stop` loop instead of waking up half-blind.

Shortest summary:
- reuse the existing memory-system base;
- transplant the working single-machine operating layer.

---

## 2. What already exists and should not be rebuilt

Assume these are already solved enough and should be reused:
- the repo already contains memory-system plans, notes, scripts, and coordination history;
- P3.1 startup recovery already passed on the Q xiaohu single-machine line;
- P3.2 Skills Recall already has runnable preview/helper assets;
- P3.3 already has an inspect-first MCP entry helper with a truthful zero-server stop line;
- the new single-machine status/entry flow already exists and is tested.

So this tutorial is not about writing new theory.
It is about getting Erliang onto the same operating path.

---

## 3. What Erliang must install, exactly

Erliang needs these four things working together.

### 3.1 A default startup entry

Erliang must adopt this startup order:

```powershell
node scripts/p3_default_entry.mjs enter --brief
node scripts/p3_default_entry.mjs enter
node scripts/p3_status_snapshot_cli.mjs status --validate-live
```

Meaning:
- first command gives the one-line `READY | ...` or `STOP | ...` read;
- second command gives the structured JSON read;
- third command is the deep layer truth check.

### 3.2 A state interpretation rule

Erliang must read status like this:
- `single-machine-mainline` means continue;
- `ready` means current default path is safe;
- `stop` means inspect the finish-line and startup-contract notes before doing anything wider;
- `frozen-zero-server-boundary` is a valid healthy P3.3 stop line on a machine with no configured MCP servers.

### 3.3 A stop-line rule

Erliang must not widen scope automatically when the machine says:
- `needs-server-selector`
- `no-configured-servers`

That is not a failure.
That is the truthful stop line for the current machine.

### 3.4 A validation rule

Erliang must treat these as the minimum acceptance checks:
- `node --test scripts/p3_default_entry_test.mjs scripts/p3_status_snapshot_cli_test.mjs`
- `node scripts/p3_default_entry.mjs enter --brief`
- `node scripts/p3_default_entry.mjs enter`
- `node scripts/p3_status_snapshot_cli.mjs status --validate-live`

If these fail, Erliang is not installed yet.

---

## 4. Install procedure

Follow this order exactly.

### Step 1: Read the current single-machine finish line

Read these files in order:
1. `notes/p3-erliang-sync-pack-2026-03-19.md`
2. `notes/p3-status-snapshot-2026-03-19.md`
3. `notes/p3-single-machine-finish-line-v1.md`
4. `notes/p3-startup-contract-v1.md`
5. `notes/p3-final-acceptance-checklist-v1.md`

Why:
- this gives Erliang the current truthful scope before touching behavior.

### Step 2: Read the executable entry layer

Read these files next:
1. `scripts/p3_default_entry.mjs`
2. `scripts/p3_status_snapshot_cli.mjs`
3. `scripts/p3_default_entry_test.mjs`
4. `scripts/p3_status_snapshot_cli_test.mjs`

Why:
- Erliang must not only know the notes;
- Erliang must understand the actual executable startup path.

### Step 3: Adopt the startup contract

From this point on, Erliang should use:

```powershell
node scripts/p3_default_entry.mjs enter --brief
```

as the default first step before claiming to know the current machine state.

Rule:
- no direct note-hunting first;
- no freestyle "I remember the system" first;
- no reopening MCP work first.

### Step 4: Run the acceptance commands yourself

Run from `qxiaohu-erliang-collab/`.

```powershell
node --test scripts/p3_default_entry_test.mjs scripts/p3_status_snapshot_cli_test.mjs
node scripts/p3_default_entry.mjs enter --brief
node scripts/p3_default_entry.mjs enter
node scripts/p3_status_snapshot_cli.mjs status --validate-live
```

Expected current-machine read:
- `brief` prints `READY | single-machine-mainline | ...`
- full entry returns `readiness = "ready"`
- live status returns:
  - `P3.1 healthy`
  - `P3.2 usable`
  - `P3.3 frozen-zero-server-boundary`
  - `no-configured-servers`

### Step 5: Compare Erliang's actual behavior to the contract

After Erliang reads and runs the commands, ask only these questions:
1. Did Erliang actually start from `enter --brief`?
2. Did Erliang describe `frozen-zero-server-boundary` as healthy instead of broken?
3. Did Erliang avoid widening into auth/config/tool-call work?
4. Did Erliang correctly say `ready` vs `stop`?

If the answer to any item is no, the gap is in behavior adoption, not in missing files.

---

## 5. Difference-repair checklist

Only repair these gaps first.

### Gap A: Erliang skips the startup entry

Fix:
- force the first step to be `node scripts/p3_default_entry.mjs enter --brief`
- do not allow freeform status claims before that command runs

### Gap B: Erliang confuses zero-server boundary with unfinished implementation

Fix:
- point back to `notes/p3-single-machine-finish-line-v1.md`
- point back to `notes/p3-plan-vs-actual-audit-v1.md`
- require Erliang to repeat the distinction:
  - `no-configured-servers` is an environment fact;
  - it is not proof that P3.3 is missing.

### Gap C: Erliang reads notes but not scripts

Fix:
- require reading both the note and the executable file pair:
  - `notes/p3-startup-contract-v1.md`
  - `scripts/p3_default_entry.mjs`
  - `scripts/p3_status_snapshot_cli.mjs`

### Gap D: Erliang still behaves like a reviewer only

Fix:
- keep reviewer instincts for risk spotting,
- but make startup entry an operator duty first.

Meaning:
- first establish the machine truth;
- then review from that truth.

---

## 6. What not to do

Do not do any of these during installation:
- do not rewrite the whole memory system from scratch;
- do not reopen P3.1/P3.2/P3.3 design unless fresh defect evidence appears;
- do not start MCP auth/config/tool-call work just because P3.3 mentions MCP;
- do not treat old Erliang confusion as proof that all existing files are useless;
- do not ask for a new big theory packet before running the actual entry commands.

Shortest rule:
- first install the working startup/status behavior;
- only then judge what is still missing.

---

## 7. Minimal acceptance for Erliang

Erliang counts as minimally installed when all of these are true:
- Erliang starts from `node scripts/p3_default_entry.mjs enter --brief`
- Erliang can explain the `ready/stop` meaning correctly
- Erliang treats `frozen-zero-server-boundary` as the current healthy P3.3 stop line
- Erliang does not widen into MCP work on its own
- Erliang can reproduce the current-machine status using the validated commands

That is enough for a first successful install.
Stable polish can come later.

---

## 8. Exact validation checks for this tutorial

Run from `qxiaohu-erliang-collab/`.

```powershell
git diff --check -- notes/erliang-single-machine-install-tutorial-v1.md
node -e "const fs=require('fs'); const text=fs.readFileSync('notes/erliang-single-machine-install-tutorial-v1.md','utf8'); const required=['## 1. What this tutorial is actually for','## 3. What Erliang must install, exactly','## 4. Install procedure','## 5. Difference-repair checklist','## 8. Exact validation checks for this tutorial']; for (const token of required) { if (!text.includes(token)) throw new Error('missing '+token); } const mustInclude=['node scripts/p3_default_entry.mjs enter --brief','single-machine-mainline','frozen-zero-server-boundary','no-configured-servers','do not rewrite the whole memory system from scratch']; for (const token of mustInclude) { if (!text.includes(token)) throw new Error('missing token '+token); } console.log('erliang-install-tutorial-note-ok');"
node --test scripts/p3_default_entry_test.mjs scripts/p3_status_snapshot_cli_test.mjs
node scripts/p3_default_entry.mjs enter --brief
```

Expected results:
- `git diff --check` returns clean output for this tutorial
- the structure check prints `erliang-install-tutorial-note-ok`
- the test files pass
- the brief entry command prints a single `READY | ...` line

---

## 9. Exact files changed

- `notes/erliang-single-machine-install-tutorial-v1.md`

Author: Q xiaohu
Version: v1
