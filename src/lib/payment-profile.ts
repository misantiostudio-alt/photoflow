export type PaymentAccount = {
  name: string;
  number: string;
  qrUrl: string;
};

export type PaymentProfile = {
  version: 1;
  notes: string;
  gcash: PaymentAccount;
  maya: PaymentAccount;
};

const PREFIX = "PHOTOFLOW_PAYMENT_V1:";

export function emptyPaymentProfile(): PaymentProfile {
  return {
    version: 1,
    notes: "",
    gcash: { name: "", number: "", qrUrl: "" },
    maya: { name: "", number: "", qrUrl: "" },
  };
}

export function parsePaymentProfile(value?: string | null): PaymentProfile {
  const fallback = emptyPaymentProfile();
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;

  if (!raw.startsWith(PREFIX)) {
    return { ...fallback, notes: raw };
  }

  try {
    const parsed = JSON.parse(raw.slice(PREFIX.length)) as Partial<PaymentProfile>;
    return {
      version: 1,
      notes: String(parsed.notes ?? ""),
      gcash: {
        name: String(parsed.gcash?.name ?? ""),
        number: String(parsed.gcash?.number ?? ""),
        qrUrl: String(parsed.gcash?.qrUrl ?? ""),
      },
      maya: {
        name: String(parsed.maya?.name ?? ""),
        number: String(parsed.maya?.number ?? ""),
        qrUrl: String(parsed.maya?.qrUrl ?? ""),
      },
    };
  } catch {
    return { ...fallback, notes: raw };
  }
}

export function serializePaymentProfile(profile: PaymentProfile) {
  return PREFIX + JSON.stringify({
    version: 1,
    notes: profile.notes.trim(),
    gcash: {
      name: profile.gcash.name.trim(),
      number: profile.gcash.number.trim(),
      qrUrl: profile.gcash.qrUrl.trim(),
    },
    maya: {
      name: profile.maya.name.trim(),
      number: profile.maya.number.trim(),
      qrUrl: profile.maya.qrUrl.trim(),
    },
  });
}