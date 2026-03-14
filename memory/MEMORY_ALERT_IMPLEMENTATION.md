# Memory Alert Implementation

## Runtime State

Primary runtime state file:

- `memory/self_alert_state.json`

Recommended state shape:

```json
{
  "version": 1,
  "updatedAt": "2026-03-14T09:30:00+08:00",
  "records": [
    {
      "signal_type": "exec_error",
      "topic_scope": "memory-index",
      "error_signature": "EBUSY-main-sqlite-rename",
      "day_bucket": "2026-03-14",
      "last_time": "2026-03-14T09:20:00+08:00",
      "count": 2,
      "status": "counting"
    }
  ]
}
```

## Required Status Values

Each tracked key should use one of:

- `counting`
- `recorded`
- `escalated`
- `promoted`

## Configuration Knobs

Do not hard-code these values in logic.
They should remain configurable.

Suggested defaults:

- remember/correction dedup window: 10 minutes
- repeated exec error dedup window: 30 minutes
- state retention window: 24 hours
- ordinary failure record threshold: 2 or 3 repeats
- write retries: 3
- retry interval: 1 second

## Detection Pipeline

### Step 1: Candidate Detection

Input sources:

- user messages
- tool results
- command lines
- memory health probes
- task-state transitions

Output:

- zero or more candidate events

### Step 2: Event Normalization

Normalize each candidate into a common structure.

Recommended fields:

- `signal_type`
- `topic_scope`
- `error_signature`
- `source`
- `raw_evidence`
- `timestamp`

## Decision Flow

Pseudocode:

```text
for each candidate_event:
  normalized = normalize(candidate_event)
  key = build_dedup_key(normalized)
  state = load_state(key)

  if matches_escalation_rules(normalized):
    record_escalation(normalized, state)
    continue

  if matches_ignore_rules(normalized):
    update_count_if_needed(state, normalized)
    continue

  if should_count_only(normalized, state):
    increment_count(state)
    persist_state(state)
    continue

  if should_record(normalized, state):
    durable_record = build_record(normalized)
    safe_write(route_record(durable_record), durable_record)
    state.status = "recorded"
    persist_state(state)
```

## Dedup Update Rules

- increment `count` when the same dedup key repeats inside the active window;
- update `last_time` on every accepted repeat;
- expire state entries beyond the retention window;
- when count crosses threshold, create one durable record and flip status to `recorded`;
- if a later event must escalate, change status to `escalated` rather than creating competing state entries.

## Write Model

Durable writes should use an atomic pattern:

1. build a redacted record;
2. write to a temporary file;
3. rename into place;
4. verify the target file is readable.

If write fails:

1. retry up to configured limit;
2. if still failing, write to `memory/emergency.md`;
3. if fallback also fails, create an escalation event.

## Record Format

Recommended durable record fields:

- `Time`
- `Type`
- `Trigger`
- `Evidence`
- `Scope`
- `What Happened`
- `Why It Matters`
- `What to Do Differently`
- `Promote To`

## Routing Logic

Suggested routing function:

```text
if event is same-day and not yet stable:
  route to memory/YYYY-MM-DD.md
else if event is a repeated systemic failure:
  route to .learnings/ERRORS.md
else if event is a reusable operating lesson:
  route to .learnings/LEARNINGS.md
else if event is stable, verified, and cross-day useful:
  route to MEMORY.md
```

## Redaction

Before any write, run evidence through a redaction pass.
At minimum, mask likely:

- bearer tokens
- API keys
- cookies
- passwords
- secret-style env var values

Redaction should preserve enough context to explain the incident without copying the secret itself.

## Health Checks

The alert system should periodically self-check:

- memory provider available;
- index non-empty when expected;
- write target reachable;
- SQLite not locked for prolonged operations.

If self-check fails, emit a memory-health escalation event.
