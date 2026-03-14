# Self Alert Runbook

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
- incremental poller over NDJSON input files, including cursor reset after file truncation/rotation.

Not yet implemented:

- direct OpenClaw real-time integration;
- webhook-style event subscription;
- heartbeat-based health sweep.

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

## Review Focus For 二两

When reviewing P1, focus on:

- false positives for user correction detection;
- false positives for high-risk git matching;
- route correctness for `ESCALATE` vs `RECORD`;
- state cursor updates in poll mode;
- redaction quality;
- whether daily/errors outputs are readable and useful.
