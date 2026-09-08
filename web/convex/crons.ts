import { cronJobs } from "convex/server";
import { internal } from "@convex/_generated/api";
import { COMPUTE_SESSION_BILLING_INTERVAL_MINUTES } from "@convex/cloud/billing";

const crons = cronJobs();

crons.interval(
  "bill compute sessions every five minutes",
  { minutes: COMPUTE_SESSION_BILLING_INTERVAL_MINUTES },
  internal.cloud.billing.billComputeSessionsFiveMinutes,
  {},
);

crons.interval(
  "enforce compute session heartbeat timeouts",
  { minutes: 1 },
  internal.computeSessions.enforceComputeSessionHeartbeatTimeouts,
  {},
);

crons.interval(
  "enforce compute session idle timeouts",
  { minutes: 1 },
  internal.computeSessions.enforceComputeSessionIdleTimeouts,
  {},
);

crons.interval(
  "enforce compute session termination timeouts",
  { minutes: 5 },
  internal.computeSessions.enforceComputeSessionTerminationTimeouts,
  {},
);

export default crons;
