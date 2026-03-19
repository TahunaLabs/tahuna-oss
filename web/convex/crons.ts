import { cronJobs } from "convex/server";
import { internal } from "@convex/_generated/api";

const crons = cronJobs();

crons.interval(
  "bill running compute each minute",
  { minutes: 1 },
  internal.runs.billRunningComputeMinute,
  {},
);

export default crons;
