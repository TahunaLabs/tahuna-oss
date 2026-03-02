import { Resend } from "@convex-dev/resend";
import { components } from "./_generated/api";

const resend = new Resend(components.resend, {
  testMode: false,
});

type OtpEmailPayload = {
  email: string;
  otp: string;
};

export async function sendOtpEmail(ctx: unknown, { email, otp }: OtpEmailPayload) {
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "";
  if (!from) {
    throw new Error("OTP delivery is not configured");
  }

  await resend.sendEmail(ctx as any, {
    from,
    to: email,
    subject: "Your Tahuna verification code",
    text: `Your Tahuna verification code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your Tahuna verification code is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
  });
}
