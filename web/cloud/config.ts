export const CLOUD_EMAIL_CONFIG = {
  otpFromEmail: {
    production: "hi@tahuna.app",
    nonProduction: "onboarding@resend.dev",
  },
} as const;

export const REDEEMABLE_CODE_CONFIG = {
  authorizedCreatorEmails: ["monaim@tahuna.app", "mehdi@tahuna.app"],
  defaultMaxRedemptions: 0,
} as const;

// TODO: move back to main config?
// TODO: check duplicate with BILLING_CONFIG in web/config.ts
export const CLOUD_BILLING_CONFIG = {
  currency: "USD",
  initialCreditCents: 0,
  computePriceMarkupMultiplier: 1.2,
  computeVolumeGbMonthlyRateCents: 12,
  minimumChargeCents: 1,
  fixedTopUpAmountCents: [1000, 2500, 10000],
  minimumTopUpAmountCents: 100,
  maximumTopUpAmountCents: 100000,
  runLaunchEstimateHours: 1,
} as const;
