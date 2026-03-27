import { Resend } from "@convex-dev/resend";
import { components } from "@convex/_generated/api";
import type { MutationCtx } from "@convex/_generated/server";
import { EMAIL_CONFIG } from "@convex/appConfig";

const resend = new Resend(components.resend, {
  testMode: false,
});

type OtpEmailPayload = {
  email: string;
  otp: string;
};

function resolveOtpFromEmail() {
  if (process.env.NODE_ENV === "production") {
    return EMAIL_CONFIG.otpFromEmail.production.trim();
  }
  return EMAIL_CONFIG.otpFromEmail.nonProduction.trim();
}

export async function sendOtpEmail(ctx: MutationCtx, { email, otp }: OtpEmailPayload) {
  const from = resolveOtpFromEmail();
  if (!from) {
    throw new Error("OTP delivery is not configured");
  }

  await resend.sendEmail(ctx, {
    from,
    to: email,
    subject: "Your Tahuna verification code",
    text: `Your Tahuna verification code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your Tahuna verification code is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
  });
}
