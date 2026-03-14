# Self Alert Quickstart

Read this first if you are touching the self alert project after a break.

## What This Is

This project is a sidecar tool.
It is not an OpenClaw core patch.
It is not a plugin that must be installed into OpenClaw.
It is not an npm setup task.

It is a small set of Node scripts that you run directly from the repo.

## What It Does

The pipeline is:

- read an event
- detect whether it is memory-worthy
- deduplicate and grade it
- write a redacted record to the correct place
- update state so repeated noise is not written again and again

## The Key Files

- `scripts/self_alert_cli.mjs`: main CLI entry
- `scripts/self_alert_test.mjs`: automated tests
- `scripts/self_alert_poll.mjs`: incremental poller
- `memory/self_alert_state.json`: runtime state and dedup memory
- `runtime/self_alert_inputs/user.ndjson`: user-event input
- `runtime/self_alert_inputs/tool.ndjson`: tool-event input

## The One Thing People Get Wrong

Do not ask "how do I install this into OpenClaw?"
That is the wrong question.

The right question is:
"Can I run the scripts, update the state file, and see the expected writes?"

## Minimal Bring-Up

1. Go to the repo root: `qxiaohu-erliang-collab`
2. Make sure `memory/self_alert_state.json` exists
3. If it does not exist, copy `memory/self_alert_state.template.json` to `memory/self_alert_state.json`
4. Run the tests: `node --test scripts/self_alert_test.mjs`
5. Run one real processing command, for example:
   - `node scripts/self_alert_cli.mjs process-user scripts/self_alert_example_user.json memory/self_alert_state.json .`
   - or `node scripts/self_alert_cli.mjs process-tool scripts/self_alert_example_tool.json memory/self_alert_state.json .`

## What Counts As Working

It is working if all of these are true:

- the command does not crash
- `memory/self_alert_state.json` updates
- a target file is written when a record should be written
- sensitive strings are redacted
- repeated events are deduplicated instead of being written every time

## Poll Mode

`poll` reads incremental events from:

- `runtime/self_alert_inputs/user.ndjson`
- `runtime/self_alert_inputs/tool.ndjson`

Each line is one JSON object.
The poller remembers how far it has read and continues from there.

This is still not "installation".
It is just another way to run the sidecar.

## Heartbeat Automation In This Workspace

This workspace now uses `HEARTBEAT.md` to run one `poll` tick periodically.
That means the sidecar no longer depends only on manual `process-user` or `process-tool` calls.

Heartbeat behavior is:

- run one `poll` tick
- if nothing new is consumed and nothing is written, stay quiet with `HEARTBEAT_OK`
- if records are written or poll fails, surface a short alert

## If You Get Stuck

Report these three things:

- the exact command you ran
- the full error text
- whether `memory/self_alert_state.json` exists

## Rule For Future You

Before touching self alert again, read this file first and only then open `SELF_ALERT_RUNBOOK.md` if deeper detail is needed.
