# Billing Audit — 17 May 2026

Historical note: this audit predates the training compute-session billing model. It documents why provider-machine lifetime must be billed from provider provisioning time. Current training billing should use `computeSessions` as the ledger reference, not run-level compute settlement events.

## 1. Initial Comparison (May 16)

Only one `run_compute_settlement_debit` existed for May 16:
- Duration: 354,202 ms · GPU: RTX 3090 · Charged: **$0.06**

RunPod dashboard for the same day: **$0.289 compute + $0.007 storage = $0.296**

Backing out our 1.2× markup: `$0.289 / 1.2 = ~$0.24` expected RunPod cost for the billed run alone — but RunPod shows $0.296 total, meaning **~$0.236 of compute was never billed**.

Root cause: 3 runs were force-deleted (`run rm -f`). The deletion path wiped the `runs` row without ever calling `settleTerminalRunUsage`.

---

## 2. Fix

`deleteRunForUserId` in `runsLifecycle.ts` called `applyRunDeletionPlan`, which has no access to the billing composition and deletes all run data immediately. Settlement was never triggered.

**Fix:** settle before deleting, guarded to active runs only (terminal runs are already settled via their terminal event):

```ts
// runsLifecycle.ts — deleteRunForUserId
if (composition?.settleTerminalRunUsage && ACTIVE_STATUSES.has(row.status)) {
  await composition.settleTerminalRunUsage(ctx, row);
}
await applyRunDeletionPlan(ctx, runId, row, plan);
```

---

## 3. Test (May 17)

Force-deleted a running RTX 3090 run (`jh73768t1k4bncrjh46cfkwmbd86xww3`).

Result in `usageEvents`:
- `run_compute_settlement_debit` generated ✅
- `duration_ms`: 19,900ms · `charge_cents`: 1

RunPod dashboard for May 17: **$0.07 compute**

---

## 4. Second Gap: Provisioning Time

Our 1¢ charge covers 20 seconds. RunPod charged $0.07 ≈ **~9 minutes**.

The difference is provisioning time: RunPod bills from pod creation; our `computeStartedAt` is only set when the runtime reports running. Image pull + bootstrap + dependency install happen in between — billed by RunPod, invisible to us.

**Fix needed:** record billing start at `planMachineProvisioned` (when RunPod confirms the pod exists), not when the runtime reports running.
