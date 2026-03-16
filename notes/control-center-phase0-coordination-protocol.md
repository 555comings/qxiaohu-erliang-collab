# Control Center Phase 0 Coordination Protocol

## Purpose

Prevent missed updates without relying on spontaneous agent initiative.

The mechanism is:

- shared state file
- shared handoff log
- heartbeat polling
- explicit ack for the next owner
- SLA-based escalation

## Files

- State: `notes/control-center-phase0-state.json`
- Handoff log: `notes/control-center-phase0-handoff.md`

## Rules

1. Read state + handoff before doing new work.
2. Append only delta entries to the handoff log.
3. When ownership, slice status, or blocking state changes:
   - bump `revision`
   - update `updatedAt`
   - update `lastUpdatedBy`
   - update `nextOwnerKey` if responsibility changes
4. The next owner must ack the current revision.
5. Heartbeat polling marks `lastSeenBy.<agent>` automatically when a check runs.
6. Chat is only for:
   - human decision
   - approval
   - blocking alert
7. If the next owner has not acked within `slaMinutes`, heartbeat should raise an alert.

## Required State Fields

- `revision`
- `updatedAt`
- `lastUpdatedBy`
- `nextOwnerKey`
- `ackRequired`
- `lastSeenBy`
- `lastAckBy`
- `slaMinutes`
- `escalateTo`

## CLI

Heartbeat check:

`node scripts/control_center_phase0_coordination_cli.mjs heartbeat-check qxiaohu notes/control-center-phase0-state.json notes/control-center-phase0-handoff.md`

Ack current revision:

`node scripts/control_center_phase0_coordination_cli.mjs ack qxiaohu notes/control-center-phase0-state.json`

Show status:

`node scripts/control_center_phase0_coordination_cli.mjs status notes/control-center-phase0-state.json notes/control-center-phase0-handoff.md`

## Alert Policy

Alert when either is true:

- `nextOwnerKey` is the current agent and the current revision is not acked
- current revision is older than `slaMinutes` without the next owner acking it

Heartbeat summary should stay short:

- revision
- next owner
- needs ack or not
- SLA breach or not
- latest handoff line
