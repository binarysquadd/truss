import { useCallback, useMemo, useState } from "react";
import {
  type BillingUsage,
  apiFetch,
} from "../types";

// Resource-limit enforcement for the open-source core. This loads current
// usage vs. plan limits so write actions can be gated when a limit is hit.
//
// Billing/subscription MANAGEMENT (checkout, plans, invoices, boosters,
// Lemon Squeezy, customer portal) is a cloud-only feature and lives in the
// private truss-cloud repo — it is intentionally not part of this hook.
export function useBilling(apiBaseUrl: string) {
  const [billingUsage, setBillingUsage] = useState<BillingUsage | null>(null);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");

  // ─── Billing restrictions (derived) ───────────────────────────────────────
  const billingRestrictions = useMemo(() => {
    const shadow = (billingUsage?.enforcement_mode ?? "active") === "shadow";
    if (!billingUsage || billingUsage.plan.key === "starter") {
      return { db: false, storage: false, auth: false, shadow };
    }
    const { current, limits } = billingUsage;
    return {
      db: current.db_size_gb >= limits.db_size_gb,
      storage: current.storage_size_gb >= limits.storage_size_gb,
      auth: current.auth_mau >= limits.auth_mau,
      shadow,
    };
  }, [billingUsage]);

  const loadBillingUsage = useCallback(async () => {
    setIsBillingLoading(true);
    setBillingError("");
    try {
      const resp = await apiFetch(`${apiBaseUrl}/api/billing/usage`);
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      const data = await resp.json();
      setBillingUsage({
        plan: data.plan,
        limits: data.limits,
        base_limits: data.base_limits,
        current: data.current,
        enforcement_mode: data.enforcement_mode || "active",
        active_boosters: data.active_boosters || [],
        billing_period: data.billing_period,
        snapshots: data.snapshots || [],
      });
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Failed to load billing usage.");
    } finally {
      setIsBillingLoading(false);
    }
  }, [apiBaseUrl]);

  return {
    // State
    billingUsage, setBillingUsage,
    isBillingLoading, setIsBillingLoading,
    billingError, setBillingError,
    // Derived
    billingRestrictions,
    // Callbacks
    loadBillingUsage,
  };
}
