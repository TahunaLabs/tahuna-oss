import { cronJobs } from "convex/server";
import { internal } from "@convex/_generated/api";

const crons = cronJobs();

crons.interval(
  "bill running compute each minute",
  { minutes: 1 },
  internal.cloud.billing.billRunningComputeMinute,
  {},
);

crons.interval(
  "bill serving compute each minute",
  { minutes: 1 },
  internal.cloud.billing.billServingComputeMinute,
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

export default crons;
