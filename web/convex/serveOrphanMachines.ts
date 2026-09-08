import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ActionCtx } from "@convex/_generated/server";
import { enqueueTerminateServeMachineJob } from "@convex/convexJobQueue";
import { createTerminateServeMachineJob } from "@convex/core/jobQueue";
import { terminateRuntimeMachine } from "@convex/runtimeProvisioning";

export async function terminateServeMachineProvisionedAfterSessionTermination(
  ctx: ActionCtx,
  args: {
    serveId: Id<"serves">;
    computeSessionId: Id<"computeSessions">;
    providerMachineId: string;
  },
) {
  try {
    await terminateRuntimeMachine(ctx, { providerMachineId: args.providerMachineId });
  } catch {
    await enqueueTerminateServeMachineJob(
      ctx,
      createTerminateServeMachineJob({
        serveId: String(args.serveId),
        providerMachineId: args.providerMachineId,
        force: true,
      }),
    );
  }
  await ctx.runMutation(internal.computeSessions.internalRecordOrphanedMachineTermination, {
    computeSessionId: args.computeSessionId,
    providerMachineId: args.providerMachineId,
  });
}
