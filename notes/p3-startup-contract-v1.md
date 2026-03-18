# P3 startup contract v1

Date: 2026-03-19
Scope: define the formal first-step contract for entering the current single-machine mainline.
Boundary: this note defines startup behavior only. It does not reopen P3.1/P3.2/P3.3 logic, add MCP config, or widen into multi-agent coordination.
References: `scripts/p3_default_entry.mjs`, `scripts/p3_status_snapshot_cli.mjs`, `notes/p3-default-entry-v1.md`, `notes/p3-default-entry-cli-v2.md`, `notes/p3-single-machine-finish-line-v1.md`

---

## 1. Contract

From now on, the formal first step for entering the current single-machine mainline is:

```powershell
node scripts/p3_default_entry.mjs enter --brief
```

If more detail is needed immediately after that, the second step is:

```powershell
node scripts/p3_default_entry.mjs enter
```

If raw layer detail is needed after that, the third step is:

```powershell
node scripts/p3_status_snapshot_cli.mjs status --validate-live
```

This is the startup order. Do not skip straight into note-hunting unless the entry command reports `STOP` or the command itself fails.

---

## 2. Why this is now the contract

This startup contract is valid because the entry path now has all three properties:
- executable
- tested
- non-mutating to the tracked startup-recovery state during live checks

What the first step now guarantees:
- one-line human-readable readiness signal
- truthful top-line state for P3.1, P3.2, and P3.3
- immediate stop reasons when the machine drifts off the expected single-machine line

---

## 3. Expected healthy startup read

Healthy startup should read like this:
- `READY | single-machine-mainline | P3.1 passed, P3.2 usable, P3.3 implemented and currently frozen at the zero-server boundary on this machine. | Use the current single-machine mainline as-is and keep MCP at the inspect-first zero-server boundary.`

Interpretation:
- continue with the current single-machine mainline
- keep MCP frozen at `needs-server-selector`
- do not widen into config/auth/tool-call work

---

## 4. Stop conditions

Treat startup as blocked if any of these happens:
- the brief command exits non-zero
- the brief command prints `STOP`
- the full JSON entry returns `readiness != "ready"`
- the live status CLI drifts away from `single-machine-mainline`
- P3.3 no longer reports `no-configured-servers`

When blocked:
- inspect `notes/p3-default-entry-v1.md`
- inspect `notes/p3-single-machine-finish-line-v1.md`
- only then decide whether to reopen one bounded layer

---

## 5. Exact validation checks

```powershell
git diff --check -- notes/p3-startup-contract-v1.md
node --test scripts/p3_default_entry_test.mjs scripts/p3_status_snapshot_cli_test.mjs
node scripts/p3_default_entry.mjs enter --brief
node scripts/p3_default_entry.mjs enter
```

Expected results:
- `git diff --check` returns clean output
- the tests pass
- the brief command prints a single `READY | ...` line
- the full command returns `readiness = "ready"`

---

## 6. Exact files changed

- `notes/p3-startup-contract-v1.md`

Author: Q xiaohu
Version: v1
