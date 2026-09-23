export const CLOUD_EMAIL_CONFIG = {
  otpFromEmail: {
    production: process.env.TAHUNA_OTP_FROM_EMAIL?.trim() ?? "",
    nonProduction: "onboarding@resend.dev",
  },
} as const;

export const REDEEMABLE_CODE_CONFIG = {
  authorizedCreatorEmails: (process.env.TAHUNA_REDEEMABLE_CODE_CREATOR_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean),
  defaultMaxRedemptions: 0,
} as const;

function nonNegativeNumberEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return value;
}

// TODO: move back to main config?
// TODO: check duplicate with BILLING_CONFIG in web/config.ts
export const CLOUD_BILLING_CONFIG = {
  currency: "USD",
  initialCreditCents: nonNegativeNumberEnv("TAHUNA_INITIAL_CREDIT_CENTS", 0),
  computePriceMarkupMultiplier: nonNegativeNumberEnv("TAHUNA_COMPUTE_MARKUP_MULTIPLIER", 1.2),
  computeVolumeGbMonthlyRateCents: 12,
  minimumChargeCents: 1,
  fixedTopUpAmountCents: [1000, 2500, 10000],
  minimumTopUpAmountCents: 100,
  maximumTopUpAmountCents: 100000,
  runLaunchEstimateHours: 1,
} as const;
