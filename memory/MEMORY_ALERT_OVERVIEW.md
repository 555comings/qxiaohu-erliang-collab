# Memory Alert Overview

## Purpose

The active memory alert system is a low-noise guardrail for memory hygiene.
It is designed to catch events worth remembering, route them to the right layer,
and avoid turning normal execution noise into permanent memory pollution.

This system is not a general "save everything" logger.
It is a selective alert-and-record pipeline.

## Goals

- Catch important memory-worthy events early.
- Distinguish noise from reusable lessons.
- Preserve evidence for later review.
- Promote only stable, cross-day facts into `MEMORY.md`.
- Keep the system explainable and testable.

## Core Flow

Signal detection -> Deduplication -> Risk grading -> Safe write -> Promotion

## Trigger Families

The system must support these trigger families:

1. User explicitly asks to remember something.
2. User correction, including identity, relationship, preference, and style corrections.
3. Tool or command failures that are not expected trial-and-error.
4. High-risk operations, especially destructive or forceful git actions.
5. Memory-system health failures, such as empty indexes or locked stores.
6. Privacy or outbound-risk events.
7. Task-state transitions, such as blocked, handoff, rework, done, or execution drift.

## Design Principles

- Default to daily notes, not `MEMORY.md`.
- Record only what helps future judgment or execution.
- Attach evidence to every durable record.
- Deduplicate aggressively to avoid alert fatigue.
- Escalate privacy, memory-health, and destructive-operation risks immediately.
- Store sensitive evidence only in redacted form.

## Document Map

- `MEMORY_ALERT_RULES.md`: trigger rules, dedup, grading, write routing, redaction.
- `MEMORY_ALERT_IMPLEMENTATION.md`: state model, pseudocode, config knobs, write flow.
- `MEMORY_ALERT_TESTS.md`: validation scenarios and acceptance criteria.
- `self_alert_state.template.json`: runtime state template.

## Non-Goals

This system should not:

- Replace normal task notes.
- Copy raw session history into memory files.
- Treat every tool failure as a lesson.
- Write directly to `MEMORY.md` on first contact.
- Store secrets or raw tokens as evidence.

## Success Criteria

The design is considered successful when:

- repeated noise does not create repeated records;
- important failures are not missed;
- every durable record has traceable evidence;
- `MEMORY.md` stays clean and stable;
- the full pipeline is testable and reproducible.
