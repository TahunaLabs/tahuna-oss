export const CLOUD_EMAIL_CONFIG = {
  otpFromEmail: {
    production: "hi@tahuna.app",
    nonProduction: "onboarding@resend.dev",
  },
} as const;

export const CLOUD_BILLING_CONFIG = {
  currency: "USD",
  initialCreditCents: 1000,
  computeVolumeGbHourlyRateCents: 2,
  unknownGpuPricePerHour: 1.39,
  storageGiBDeltaRateCents: 3,
  minimumChargeCents: 1,
} as const;
