import { describe, expect, it } from "vitest"

import { billingAuditRows, type UsageEventRow } from "@/components/features/dashboard/audit-logs-view"
import type { RunRow } from "@/lib/dashboard-api-types"

function runRow(name: string, computeSessionId: string): RunRow {
  return {
    run_id: name,
    name,
    created_at: 1,
    uptime_ms: 1,
    environment_id: "env_1",
    status: "completed",
    compute_session_id: computeSessionId,
    execution_mode: "session",
    effective_gpu_type: "RTX 3090",
    effective_gpu_count: 1,
    effective_volume_gb: 40,
  }
}

function usageEvent(overrides: Partial<UsageEventRow>): UsageEventRow {
  return {
    event_type: "run_compute_settlement_debit",
    credits_delta_cents: -14,
    balance_after_cents: 825,
    reference_type: "compute_session",
    reference_id: "session_1",
    metadata: { duration_ms: (15 * 60 + 40) * 1000 },
    updated_at: 1,
    ...overrides,
  }
}

describe("audit log billing rows", () => {
  it("shows compute-session debit rows as training compute with session uptime and attached runs", () => {
    const rows = billingAuditRows(
      [usageEvent({})],
      new Map([["session_1", [runRow("baseline", "session_1"), runRow("sweep", "session_1")]]]),
    )

    expect(rows[0].title).toBe("Training Compute Settlement Debit")
    expect(rows[0].amount).toContain("0.14")
    expect(rows[0].detail).toContain("Balance after")
    expect(rows[0].detail).toContain("compute session session_1")
    expect(rows[0].detail).toContain("uptime 15m 40s")
    expect(rows[0].detail).toContain("2 runs: baseline, sweep")
  })

  it("keeps run debit rows labeled as run compute", () => {
    const rows = billingAuditRows([
      usageEvent({
        reference_type: "run",
        reference_id: "run_1",
        metadata: { duration_ms: 60_000 },
      }),
    ])

    expect(rows[0].title).toBe("Run Compute Settlement Debit")
    expect(rows[0].detail).not.toContain("compute session")
  })
})
