export const CLOUD_EMAIL_CONFIG = {
  otpFromEmail: {
    production: "hi@tahuna.app",
    nonProduction: "onboarding@resend.dev",
  },
} as const;

export const CLOUD_BILLING_CONFIG = {
  currency: "USD",
  initialCreditCents: 500,
  computeVolumeGbHourlyRateCents: 2,
  storageGiBDeltaRateCents: 3,
  minimumChargeCents: 1,
  fixedTopUpAmountCents: [1000, 2500, 10000],
  minimumTopUpAmountCents: 100,
  maximumTopUpAmountCents: 100000,
  runLaunchEstimateHours: 1,
} as const;
