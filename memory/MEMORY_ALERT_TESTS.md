# Memory Alert Tests

## Test Strategy

The system should be validated across trigger accuracy, dedup behavior, grading, write safety, and promotion discipline.

## 1. Trigger Tests

### Remember Request

Input:

- user says "记一下今天确认了 X"

Expected:

- one candidate event detected;
- routed to same-day memory;
- durable record contains evidence.

### User Correction

Input:

- user says "不对，二两是我姐姐，不是你姐姐"

Expected:

- correction trigger fires;
- event is not ignored;
- durable record is written to daily memory or learnings based on policy.

### Preference or Style Correction

Input:

- user says "以后别用代码块转发给二两"

Expected:

- preference correction captured;
- evidence preserved in redacted form;
- promotion target is not immediate `MEMORY.md` unless verified later.

## 2. Dedup Tests

### Repeated Remember Signal

Input:

- same user repeats the same remember request twice within 10 minutes

Expected:

- one durable record only;
- second event updates evidence or count instead of creating a duplicate.

### Repeated Exec Error

Input:

- same command fails three times with the same error signature

Expected:

- first failure counts only;
- later failure crosses threshold;
- one durable record is produced;
- status becomes `recorded` or `escalated` as appropriate.

## 3. False-Positive Tests

### Non-Correction Phrase

Input:

- user says "其实还好"

Expected:

- no correction record.

### Casual Phrase

Input:

- user says "你不对劲"

Expected:

- no factual-correction record.

### Ordinary Git Push

Input:

- command is ordinary `git push`

Expected:

- may produce reminder-level signal at most;
- must not produce high-risk escalation.

## 4. Escalation Tests

### High-Risk Git Operation

Input:

- `git reset --hard`

Expected:

- immediate escalation;
- no dependence on repeat count.

### Memory Health Failure

Input:

- status reports `Provider: none` or `Indexed: 0` unexpectedly

Expected:

- immediate escalation;
- routed to daily memory or errors file with evidence.

### Privacy Risk

Input:

- commit diff includes likely API key material

Expected:

- immediate escalation;
- evidence must be redacted.

## 5. Write Failure Tests

### Primary Target Write Failure

Input:

- target file is unavailable or write fails

Expected:

- retry sequence executes;
- if retries fail, fallback write goes to `memory/emergency.md`;
- if fallback fails, escalation is created.

### Partial-Write Protection

Input:

- simulated interruption during write

Expected:

- target file is not left half-written;
- atomic write flow leaves either old content or complete new content.

## 6. Promotion Tests

### Daily to Long-Term Promotion

Input:

- same verified rule observed across separate tasks or explicit user confirmation

Expected:

- daily evidence remains preserved;
- stable condensed version may be promoted to `MEMORY.md`.

### Anti-Pollution Guard

Input:

- one-off noisy failure or same-day detail

Expected:

- must not be promoted to `MEMORY.md`.

## 7. Acceptance Criteria

The implementation passes only if all are true:

- repeated noise does not spam repeated durable records;
- high-risk and privacy events escalate immediately;
- every durable record includes evidence;
- secrets are redacted before write;
- `MEMORY.md` receives only stable verified facts;
- failure handling includes retry and fallback;
- false-positive cases above do not create wrong records.
