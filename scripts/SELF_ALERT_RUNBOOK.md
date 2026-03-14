# Self Alert Runbook

Read `SELF_ALERT_QUICKSTART.md` first if you are returning to this project after a break.

## Scope

This runbook covers the current sidecar-based P1 implementation.
It does not patch OpenClaw core.
Instead, it provides a runnable evaluator, detectors, writer, state file, and an incremental poller.

## Components

- `self_alert_evaluator.mjs`: grading, dedup, state transitions.
- `self_alert_detectors.mjs`: candidate extraction from user input and tool results.
- `self_alert_writer.mjs`: route resolution, redaction, markdown write.
- `self_alert_state.mjs`: state persistence.
- `self_alert_poll.mjs`: incremental NDJSON poller.
- `self_alert_cli.mjs`: CLI entry for detect/evaluate/process.
- `self_alert_test.mjs`: minimal automated tests.

## Current P1 Coverage

Implemented:

- user remember/correction/preference detection with preference/correction priority over generic remember requests;
- tool result detection for exec errors, write failures, high-risk git;
- dedup state and four-level grading;
- route separation from severity;
- redacted markdown writes;
- atomic write using `.tmp` then rename;
- incremental poller over NDJSON input files, including cursor reset after file truncation/rotation;
- daily-memory-v2-compatible self-alert writes for daily routes;
- workspace heartbeat trigger via `HEARTBEAT.md` for periodic poll ticks.

Not yet implemented:

- direct OpenClaw real-time integration;
- webhook-style event subscription;
- heartbeat-based health sweep beyond the current poll tick;
- cron-based or daemon-style isolated execution.

## Input Files

Default input files live under:

- `runtime/self_alert_inputs/user.ndjson`
- `runtime/self_alert_inputs/tool.ndjson`

Each line must be one JSON object.

## Example Commands

Run tests:

```powershell
node --test scripts/self_alert_test.mjs
```

Detect user signals from a file:

```powershell
node scripts/self_alert_cli.mjs detect-user scripts/self_alert_example_user.json
```

Process one tool event:

```powershell
node scripts/self_alert_cli.mjs process-tool scripts/self_alert_example_tool.json memory/self_alert_state.json .
```

Poll incremental NDJSON inputs:

```powershell
node -e "import('./scripts/self_alert_poll.mjs').then(async ({ pollAlertSources }) => { const out = await pollAlertSources({ workspaceRoot: process.cwd() }); console.log(JSON.stringify(out, null, 2)); })"
```

Run the full safe automation cycle:

```powershell
node scripts/self_alert_cli.mjs tick memory/self_alert_state.json . runtime/self_alert_inputs
```

## Heartbeat Trigger

In this workspace, the main-session heartbeat is the current automation hook.
The root `HEARTBEAT.md` instructs the agent to:

- run one `tick` cycle through `self_alert_cli.mjs`;
- let `tick` perform `health-check` first and skip `poll` when polling would be unsafe;
- stay quiet when health is clean, nothing new is consumed, and nothing is written;
- surface a short alert if health issues are found, records are written, or the cycle fails.

This keeps the sidecar lightweight and avoids inventing a second scheduler before it is needed.

## Review Focus For 二两

When reviewing P1, focus on:

- false positives for user correction detection;
- false positives for high-risk git matching;
- route correctness for `ESCALATE` vs `RECORD`;
- state cursor updates in poll mode;
- redaction quality;
- whether daily/errors outputs are readable and useful.
