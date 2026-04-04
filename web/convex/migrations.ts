import { internalMutation } from "./_generated/server";

export const backfillEnvironments = internalMutation({
  args: {},
  handler: async (ctx) => {
    const environments = await ctx.db.query("environments").collect();
    for (const env of environments) {
      if (env.command === undefined || env.outputDir === undefined) {
        await ctx.db.patch(env._id, {
          command: env.command ?? [
            "uv",
            "run",
            "--active",
            "--no-sync",
            "python",
            "-u",
            "train.py",
          ],
          outputDir: env.outputDir ?? "outputs",
        });
      }
    }
  },
});
