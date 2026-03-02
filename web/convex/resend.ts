import { Resend } from "@convex-dev/resend";
import { components } from "@convex/_generated/api";
import type { MutationCtx } from "@convex/_generated/server";

const resend = new Resend(components.resend, {
  testMode: false,
});

type OtpEmailPayload = {
  email: string;
  otp: string;
};

export async function sendOtpEmail(ctx: MutationCtx, { email, otp }: OtpEmailPayload) {
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "";
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
