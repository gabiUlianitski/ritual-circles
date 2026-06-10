import type { GroupSizeState } from "./groupSize";
import { groupSizeSplitDivisor, splitCostMayDecrease } from "./groupSize";

export type CostCurrency = "USD" | "EUR" | "ILS";
export type CostPaymentType = "free" | "split" | "per_person";

export type CostPaymentPayload = {
  type: CostPaymentType;
  totalCost?: number;
  pricePerPerson?: number;
  currency: CostCurrency;
  paymentNote?: string;
};

export type CostPaymentState = {
  type: CostPaymentType;
  totalCost: number;
  pricePerPerson: number;
  currency: CostCurrency;
  paymentNote: string;
};

export const COST_CURRENCIES: { code: CostCurrency; label: string }[] = [
  { code: "USD", label: "USD ($)" },
  { code: "EUR", label: "EUR (€)" },
  { code: "ILS", label: "ILS (₪)" },
];

export const DEFAULT_COST_PAYMENT: CostPaymentState = {
  type: "free",
  totalCost: 50,
  pricePerPerson: 10,
  currency: "USD",
  paymentNote: "",
};

function parsePositiveAmount(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function formatCurrencyAmount(amount: number, currency: CostCurrency): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function estimateSplitCostPerPerson(
  totalCost: number,
  groupSize: GroupSizeState,
  memberCount?: number,
): number | null {
  const amount = parsePositiveAmount(totalCost);
  if (amount == null) return null;
  const divisor = Math.max(1, memberCount ?? groupSizeSplitDivisor(groupSize));
  return amount / divisor;
}

export function validateCostPayment(state: CostPaymentState): string | null {
  if (state.type === "free") return null;
  if (state.type === "split") {
    if (parsePositiveAmount(state.totalCost) == null) return "Please enter a valid amount";
    return null;
  }
  if (parsePositiveAmount(state.pricePerPerson) == null) return "Please enter a valid amount";
  return null;
}

export function toCostPaymentPayload(state: CostPaymentState): CostPaymentPayload {
  const note = state.paymentNote.trim();
  if (state.type === "free") {
    return {
      type: "free",
      currency: state.currency,
      ...(note ? { paymentNote: note } : {}),
    };
  }
  if (state.type === "split") {
    return {
      type: "split",
      totalCost: parsePositiveAmount(state.totalCost)!,
      currency: state.currency,
      ...(note ? { paymentNote: note } : {}),
    };
  }
  return {
    type: "per_person",
    pricePerPerson: parsePositiveAmount(state.pricePerPerson)!,
    currency: state.currency,
    ...(note ? { paymentNote: note } : {}),
  };
}

export function costPaymentStateFromPayload(
  payload: CostPaymentPayload | null | undefined,
): CostPaymentState {
  if (!payload) return { ...DEFAULT_COST_PAYMENT };
  return {
    type: payload.type,
    totalCost: payload.totalCost ?? DEFAULT_COST_PAYMENT.totalCost,
    pricePerPerson: payload.pricePerPerson ?? DEFAULT_COST_PAYMENT.pricePerPerson,
    currency: payload.currency ?? DEFAULT_COST_PAYMENT.currency,
    paymentNote: payload.paymentNote ?? "",
  };
}

export function formatCostPaymentSummary(
  payload: CostPaymentPayload,
  groupSize?: GroupSizeState,
): string {
  if (payload.type === "free") return "Free — no payment required";
  if (payload.type === "per_person" && payload.pricePerPerson != null) {
    return `${formatCurrencyAmount(payload.pricePerPerson, payload.currency)} per person`;
  }
  if (payload.type === "split" && payload.totalCost != null && groupSize) {
    const perPerson = estimateSplitCostPerPerson(payload.totalCost, groupSize);
    if (perPerson == null) return "Split cost";
    const est = formatCurrencyAmount(perPerson, payload.currency);
    const dynamic = splitCostMayDecrease(groupSize) ? " (est.)" : "";
    return `Split ${formatCurrencyAmount(payload.totalCost, payload.currency)} — ~${est} each${dynamic}`;
  }
  if (payload.type === "split" && payload.totalCost != null) {
    return `Split ${formatCurrencyAmount(payload.totalCost, payload.currency)} total`;
  }
  return "Payment required";
}
