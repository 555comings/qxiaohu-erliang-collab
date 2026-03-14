# Memory Alert Rules

## Detection Model

Detection is two-stage.

1. Rule detection nominates a candidate event.
2. Trigger confirmation decides whether the event should enter the alert pipeline.

Rules may use keyword patterns, regexes, command signatures, tool results, and health checks.
Rules do not claim semantic understanding; they only surface candidates.

## Trigger Classes

### 1. Remember Requests

Examples:

- "记一下"
- equivalent direct remember requests

These should usually route to daily memory first.

### 2. User Corrections

Examples:

- factual correction
- identity or relationship correction
- preference correction
- tone or style correction

These are high-value because they often affect future replies.

### 3. Tool and Command Failures

Examples:

- unexpected `exec` failure
- repeated write failure
- repeated validation failure

Expected trial-and-error, user cancellations, and known sandbox limits should not be escalated automatically.

### 4. High-Risk Operations

Immediate escalation class:

- `git push --force`
- `git checkout -f`
- `git reset --hard`
- `git clean -fd`
- overwrite-style restore actions

Reminder-only class:

- ordinary `git push`
- ordinary `git pull`
- ordinary `git merge`

High-risk matching should use full command patterns, not loose substring matching.

### 5. Memory-System Health Failures

Immediate escalation class:

- `Provider: none`
- `Indexed: 0`
- `memory_search` returns empty when it should not
- SQLite lock conditions
- write-path failure to memory files

### 6. Privacy and Outbound Risk

Immediate escalation class:

- API key or token exposure risk
- sensitive content staged for commit or push
- outbound action prepared without required confirmation

### 7. Task-State Changes

Track transitions including:

- `blocked`
- `handoff`
- `rework`
- `done`
- execution drift, meaning "said it would be done but did not happen"

## Deduplication

Deduplication key must include at least:

- `signal_type`
- `topic_scope`
- `error_signature`
- `day_bucket`

Recommended windows:

- same user-remember or correction signal plus same topic: once per 10 minutes;
- same exec error signature: at most one upgrade per 30 minutes;
- same systemic lesson: one durable record per day, then append evidence.

Dedup should not simply drop useful follow-up evidence.
If the record already exists, append new redacted evidence instead of creating a parallel duplicate.

## Risk Grading

Four levels are required.

### `IGNORE`

Use for:

- user interruption;
- expected trial-and-error;
- manual cancellation;
- known sandbox restriction;
- obvious low-value noise.

### `COUNT`

Use for:

- first-time ordinary failure;
- weak signal that may matter later but is not yet a lesson.

This updates state but does not create a durable learning record.

### `RECORD`

Use for:

- repeated same-category failure reaching threshold;
- confirmed daily lesson;
- event worth preserving in daily notes or learnings.

### `ESCALATE`

Use immediately for:

- privacy risk;
- memory-system health failure;
- destructive or forceful git action;
- systemic write-path failure;
- user-flagged important mistake.

## Required Decision Order

The grading order must be:

1. check `ESCALATE`;
2. check `IGNORE`;
3. then decide `COUNT` vs `RECORD`.

Do not let a "first-time error" rule suppress an event that should escalate immediately.

## Write Routing

Route records by layer:

- `memory/YYYY-MM-DD.md`: same-day events and fresh lessons;
- `.learnings/ERRORS.md`: systemic errors and repeated failure patterns;
- `.learnings/LEARNINGS.md`: reusable operating lessons;
- `MEMORY.md`: only stable, cross-day, verified facts.

Default route is daily memory.
Promotion to `MEMORY.md` happens later and only after verification.

## Evidence Rules

Every durable record must contain evidence.
Accepted evidence sources include:

- user quote;
- tool result;
- file path;
- commit id;
- command line;
- validation output.

Evidence must be redacted before writing.
The system must mask secrets such as:

- API keys;
- tokens;
- cookies;
- passwords;
- other credentials.

## Promotion Rules

A record may be promoted to `MEMORY.md` only if all are true:

- it is stable across time;
- it has been verified;
- it is expected to help future work beyond the current day.

## Failure Handling

If the intended write target fails:

- retry according to configured limits;
- if still failing, fall back to `memory/emergency.md`;
- if repeated failure continues, raise an escalation event.
