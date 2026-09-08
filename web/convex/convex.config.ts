import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import resend from "@convex-dev/resend/convex.config";
import r2 from "@convex-dev/r2/convex.config";
import workpool from "@convex-dev/workpool/convex.config";

const app = defineApp();
app.use(betterAuth);
app.use(resend);
app.use(r2);
app.use(workpool);

export default app;
