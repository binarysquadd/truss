import { useCallback, useEffect, useRef, useState } from "react";
import {
  type TenantSession,
  type UserPermissions,
  type AuthScreenView,
  apiFetch,
  setDemoMode,
  isDemoMode,
  setOnDemoWriteBlocked,
  setOnSessionExpired,
  base64urlToBuffer,
  bufferToBase64url,
  deleteCookie,
} from "../types";

export function useAuth(apiBaseUrl: string) {
  // ─── Tenant auth gate state ─────────────────────────────────────────────────
  const [authChecked, setAuthChecked] = useState(false);
  const [authRequired, setAuthRequired] = useState(true);
  const [session, setSession] = useState<TenantSession | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [authScreenView, setAuthScreenView] = useState<AuthScreenView>("login");
  // import.meta.env.DEV is statically false in `vite build`, so these dev-only
  // prefills are dead-code-eliminated from production bundles.
  const [authGateEmail, setAuthGateEmail] = useState(import.meta.env.DEV ? "admin@truss.dev" : "");
  const [authGatePassword, setAuthGatePassword] = useState(import.meta.env.DEV ? "truss-admin-2026" : "");
  const [authGateError, setAuthGateError] = useState("");
  const [authGateLoading, setAuthGateLoading] = useState(false);
  const [authGateDisplayName, setAuthGateDisplayName] = useState("");
  const [authLoginMethod, setAuthLoginMethod] = useState<"password" | "code" | "magic-link">("password");
  const [authGateCode, setAuthGateCode] = useState("");
  const [authCodeFlowId, setAuthCodeFlowId] = useState("");
  const [authCodeSent, setAuthCodeSent] = useState(false);
  const [showDemoWelcome, setShowDemoWelcome] = useState(false);
  const [demoToastVisible, setDemoToastVisible] = useState(false);
  const _demoToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Dev tenant switcher (only active when VITE_DEV_MODE=true) ─────────────
  const [devTenants, setDevTenants] = useState<Array<{ id: string; displayName: string; plan: string; email: string; active?: boolean; isAdmin?: boolean }>>([]);
  const [devCurrentTenant, setDevCurrentTenant] = useState("");
  const [showDevTenantDropdown, setShowDevTenantDropdown] = useState(false);
  const [devTenantsLoaded, setDevTenantsLoaded] = useState(false);

  // ─── Profile (settings) password change ────────────────────────────────────
  const [profileNewPassword, setProfileNewPassword] = useState("");
  const [profileConfirmPassword, setProfileConfirmPassword] = useState("");
  const [profilePasswordError, setProfilePasswordError] = useState("");
  const [profilePasswordSuccess, setProfilePasswordSuccess] = useState("");

  // ─── Demo detection (runs once synchronously on first render) ──────────────
  const _demoDetected = useRef(false);
  if (!_demoDetected.current) {
    _demoDetected.current = true;
    if (window.location.pathname.match(/\/demo(\/|$)/)) {
      setDemoMode(true);
    }
  }

  // ─── Callbacks ─────────────────────────────────────────────────────────────

  const refreshSession = useCallback(() => {
    return apiFetch(`${apiBaseUrl}/api/auth/session`)
      .then(r => r.ok ? r.json() : r.json().catch(() => null))
      .then(data => {
        if (data?.authRequired !== undefined) setAuthRequired(data.authRequired);
        if (data?.tenant) {
          // If the API returns a demo tenant but user didn't navigate to /demo/,
          // treat as unauthenticated — show the login screen, not the demo dashboard.
          if (data.tenant.isDemo && !isDemoMode()) {
            // Don't set session — user will see auth gate
            setAuthChecked(true);
            return;
          }
          // Real (non-demo) tenant returned — clear demo mode flag so apiFetch
          // stops sending X-Demo header. Without this, navigating away from /demo/
          // still sends X-Demo:true on every request → API returns demo data.
          if (!data.tenant.isDemo && isDemoMode()) {
            setDemoMode(false);
          }
          setSession(data.tenant);
          if (data.tenant.isDemo) setShowDemoWelcome(true);
        }
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, [apiBaseUrl]);

  const handleLogin = useCallback(async () => {
    setAuthGateError("");
    setAuthGateLoading(true);
    try {
      const flowRes = await apiFetch(`${apiBaseUrl}/api/auth/login`);
      const flow = await flowRes.json();
      if (!flow.id) throw new Error("Failed to initialize login");

      const submitRes = await apiFetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          flowId: flow.id,
          method: "password",
          identifier: authGateEmail,
          password: authGatePassword,
        }),
      });
      const data = await submitRes.json();

      // Extract errors from Kratos — can be in ui.messages OR ui.nodes[].messages
      const uiMsgs = data.ui?.messages?.filter((m: any) => m.type === "error") || [];
      const nodeMsgs = (data.ui?.nodes || []).flatMap((n: any) => (n.messages || []).filter((m: any) => m.type === "error"));
      const loginErrors = [...uiMsgs, ...nodeMsgs];

      if (!submitRes.ok || loginErrors.length > 0) {
        const msg = loginErrors[0]?.text || (typeof data.error === "string" ? data.error : data.error?.message) || "Login failed";
        throw new Error(msg);
      }

      // API flow returns session_token in the body
      if (!data.session_token) {
        throw new Error("Login succeeded but no session was created. Please try again.");
      }

      // Clear stale CSRF cookie + demo mode before session check
      deleteCookie("truss_csrf");
      setDemoMode(false);

      const sessRes = await apiFetch(`${apiBaseUrl}/api/auth/session`);
      const sessData = await sessRes.json();
      if (sessData?.tenant) {
        setSession(sessData.tenant);
        setAuthGatePassword("");
        // Clear URL to root so the app loads fresh with the user's own org
        const base = window.location.pathname.match(/^(\/(?:proxy\/\d+\/)?absproxy\/\d+)/)?.[1] || "";
        window.history.replaceState(null, "", base || "/");
      } else {
        throw new Error("Session not established. Please try again.");
      }
    } catch (err) {
      setAuthGateError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setAuthGateLoading(false);
    }
  }, [authGateEmail, authGatePassword, apiBaseUrl]);

  const handleCodeLogin = useCallback(async () => {
    setAuthGateError("");
    setAuthGateLoading(true);
    try {
      if (!authCodeSent) {
        // Step 1: Init flow + send code
        const flowRes = await apiFetch(`${apiBaseUrl}/api/auth/login`);
        const flow = await flowRes.json();
        if (!flow.id) throw new Error("Failed to initialize login");

        const submitRes = await apiFetch(`${apiBaseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ flowId: flow.id, method: "code", identifier: authGateEmail }),
        });
        const data = await submitRes.json();

        // If Kratos returns a 400 with a new flow (code sent), that's the expected behavior
        if (data.session_token) {
          // Unlikely but handle instant session (cookie set by API)
          deleteCookie("truss_csrf");
          setDemoMode(false);
          const sessRes = await apiFetch(`${apiBaseUrl}/api/auth/session`);
          const sessData = await sessRes.json();
          if (sessData?.tenant) {
            setSession(sessData.tenant);
            const cb = window.location.pathname.match(/^(\/(?:proxy\/\d+\/)?absproxy\/\d+)/)?.[1] || "";
            window.history.replaceState(null, "", cb || "/");
            return;
          }
        }

        // Code was sent — save the flow ID for step 2
        const newFlowId = data.id || flow.id;
        setAuthCodeFlowId(newFlowId);
        setAuthCodeSent(true);
      } else {
        // Step 2: Verify code
        const submitRes = await apiFetch(`${apiBaseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ flowId: authCodeFlowId, method: "code", code: authGateCode }),
        });
        const data = await submitRes.json();

        if (!submitRes.ok) {
          const msg = data.ui?.messages?.[0]?.text || data.error?.message || "Invalid code";
          throw new Error(msg);
        }

        if (data.session_token) {
          deleteCookie("truss_csrf");
          setDemoMode(false);
        }

        const sessRes = await apiFetch(`${apiBaseUrl}/api/auth/session`);
        const sessData = await sessRes.json();
        if (sessData?.tenant) {
          setSession(sessData.tenant);
          setAuthGateCode("");
          setAuthCodeSent(false);
          const cb2 = window.location.pathname.match(/^(\/(?:proxy\/\d+\/)?absproxy\/\d+)/)?.[1] || "";
          window.history.replaceState(null, "", cb2 || "/");
        } else {
          throw new Error("Session not established");
        }
      }
    } catch (err) {
      setAuthGateError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setAuthGateLoading(false);
    }
  }, [authGateEmail, authGateCode, authCodeSent, authCodeFlowId, apiBaseUrl]);

  const handleMagicLink = useCallback(async () => {
    setAuthGateError("");
    setAuthGateLoading(true);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/auth/login/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: authGateEmail }),
      });
      const data = await r.json();
      if (data.ok) {
        setAuthCodeSent(true); // reuse the "sent" state to show confirmation
      } else {
        throw new Error(data.error || "Failed to send magic link");
      }
    } catch (err) {
      setAuthGateError(err instanceof Error ? err.message : "Failed to send magic link");
    } finally {
      setAuthGateLoading(false);
    }
  }, [authGateEmail, apiBaseUrl]);

  const handlePasskeyLogin = useCallback(async () => {
    setAuthGateError("");
    setAuthGateLoading(true);
    try {
      // Step 1: Get passkey options from Kratos via our API
      const initRes = await apiFetch(`${apiBaseUrl}/api/auth/login/passkey`);
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || "Passkey login not available");

      const { flow_id, passkey_options } = initData;
      const publicKey = passkey_options.publicKey || passkey_options;

      // Convert base64url fields to ArrayBuffer
      if (publicKey.challenge && typeof publicKey.challenge === "string") {
        publicKey.challenge = base64urlToBuffer(publicKey.challenge);
      }
      if (publicKey.allowCredentials) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        publicKey.allowCredentials = publicKey.allowCredentials.map((c: any) => ({
          ...c,
          id: typeof c.id === "string" ? base64urlToBuffer(c.id) : c.id,
        }));
      }

      // Step 2: Browser WebAuthn assertion
      const credential = await navigator.credentials.get({ publicKey }) as PublicKeyCredential;
      if (!credential) throw new Error("Passkey authentication was cancelled");

      const response = credential.response as AuthenticatorAssertionResponse;
      const loginPayload = JSON.stringify({
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          authenticatorData: bufferToBase64url(response.authenticatorData),
          clientDataJSON: bufferToBase64url(response.clientDataJSON),
          signature: bufferToBase64url(response.signature),
          userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : undefined,
        },
      });

      // Step 3: Submit assertion to verify
      const verifyRes = await apiFetch(`${apiBaseUrl}/api/auth/login/passkey`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flow_id, passkey_login: loginPayload }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || "Passkey verification failed");

      // Step 4: Clear stale state + check session
      deleteCookie("truss_csrf");
      setDemoMode(false);
      const sessRes = await apiFetch(`${apiBaseUrl}/api/auth/session`);
      const sessData = await sessRes.json();
      if (sessData?.tenant) {
        setSession(sessData.tenant);
        const pkBase = window.location.pathname.match(/^(\/(?:proxy\/\d+\/)?absproxy\/\d+)/)?.[1] || "";
        window.history.replaceState(null, "", pkBase || "/");
      } else {
        throw new Error("Session not established");
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setAuthGateError("Passkey authentication was cancelled or timed out.");
      } else {
        setAuthGateError(err instanceof Error ? err.message : "Passkey login failed");
      }
    } finally {
      setAuthGateLoading(false);
    }
  }, [apiBaseUrl]);

  const handleRegister = useCallback(async () => {
    setAuthGateError("");
    setAuthGateLoading(true);
    try {
      const flowRes = await apiFetch(`${apiBaseUrl}/api/auth/register`);
      const flow = await flowRes.json();
      if (!flow.id) throw new Error("Failed to initialize registration");

      const submitRes = await apiFetch(`${apiBaseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          flowId: flow.id,
          method: "password",
          traits: { email: authGateEmail },
          password: authGatePassword,
        }),
      });
      const data = await submitRes.json();

      // Extract errors from Kratos response — errors can be in ui.messages OR ui.nodes[].messages
      const uiMessages = data.ui?.messages?.filter((m: any) => m.type === "error") || [];
      const nodeMessages = (data.ui?.nodes || []).flatMap((n: any) => (n.messages || []).filter((m: any) => m.type === "error"));
      const allErrors = [...uiMessages, ...nodeMessages];

      if (!submitRes.ok || allErrors.length > 0) {
        const msg = allErrors[0]?.text || (typeof data.error === "string" ? data.error : data.error?.message) || "Registration failed";
        throw new Error(msg);
      }

      if (!data.session_token) {
        throw new Error("Registration succeeded but no session was created. Please try logging in.");
      }

      // Clear stale CSRF cookie + demo mode before session check
      deleteCookie("truss_csrf");
      setDemoMode(false);

      const sessRes = await apiFetch(`${apiBaseUrl}/api/auth/session`);
      const sessData = await sessRes.json();
      if (sessData?.tenant) {
        setSession(sessData.tenant);
        setAuthGatePassword("");
        // Clear URL to root so the app loads fresh with the user's own org
        const regBase = window.location.pathname.match(/^(\/(?:proxy\/\d+\/)?absproxy\/\d+)/)?.[1] || "";
        window.history.replaceState(null, "", regBase || "/");
      } else {
        throw new Error("Session not established. Please try logging in.");
      }
    } catch (err) {
      setAuthGateError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setAuthGateLoading(false);
    }
  }, [authGateEmail, authGatePassword, apiBaseUrl]);

  const handleLogout = useCallback(async () => {
    try {
      await apiFetch(`${apiBaseUrl}/api/auth/logout`, { method: "POST" });
    } catch { /* ignore */ }
    setSession(null);
    setPermissions(null);
    setDemoMode(false);
    deleteCookie("truss_csrf");
    setAuthScreenView("login");
    setAuthGateError("");
    setAuthCodeSent(false);
    // Clean URL — navigate to /login so user sees a fresh auth screen
    const base = window.location.pathname.match(/^(\/(?:proxy\/\d+\/)?absproxy\/\d+)/)?.[1] || "";
    window.history.replaceState(null, "", `${base}/login`);
  }, [apiBaseUrl]);

  const handleDevTenantSwitch = useCallback(async (tenantId: string) => {
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/dev/switch-tenant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (res.ok) {
        console.info(`[truss:tenant] switched to ${tenantId}`);
        // Rewrite the URL to reflect the new tenant prefix before reloading.
        // Without this, the old /@tenantId in the URL would override the cookie
        // and snap the user back to the previous tenant on reload.
        const currentPath = window.location.pathname;
        // Detect proxy prefix (e.g. /absproxy/5173)
        const proxyMatch = currentPath.match(/^(\/(?:abs)?proxy\/\d+)/);
        const proxyPrefix = proxyMatch ? proxyMatch[1] : "";
        // Strip proxy prefix, then strip existing /@tenantId prefix
        let rest = currentPath.slice(proxyPrefix.length);
        rest = rest.replace(/^\/@[^/]+/, "");
        if (!rest || rest === "") rest = "/";
        // Build new URL with new tenant prefix (or none for "local")
        const tenantPrefix = tenantId && tenantId !== "local" ? `/@${tenantId}` : "";
        const newPath = `${proxyPrefix}${tenantPrefix}${rest}`;
        window.location.href = newPath + window.location.search;
      }
    } catch { /* ignore */ }
  }, [apiBaseUrl]);

  const changePassword = useCallback(async () => {
    setProfilePasswordError("");
    setProfilePasswordSuccess("");
    try {
      const flowRes = await apiFetch(`${apiBaseUrl}/api/auth/settings`);
      const flow = await flowRes.json();
      if (!flow.id) throw new Error("Failed to initialize settings flow");
      const submitRes = await apiFetch(`${apiBaseUrl}/api/auth/settings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flowId: flow.id, method: "password", password: profileNewPassword }),
      });
      if (!submitRes.ok) {
        const data = await submitRes.json();
        throw new Error(data.ui?.messages?.[0]?.text || "Password change failed");
      }
      setProfilePasswordSuccess("Password updated successfully");
      setProfileNewPassword("");
      setProfileConfirmPassword("");
    } catch (err) {
      setProfilePasswordError(err instanceof Error ? err.message : "Password change failed");
    }
  }, [profileNewPassword, apiBaseUrl]);

  // ─── Effects ───────────────────────────────────────────────────────────────

  // Session refresh on mount
  useEffect(() => { refreshSession(); }, []);

  // Permissions fetch after session
  useEffect(() => {
    if (session) {
      apiFetch(`${apiBaseUrl}/api/auth/permissions`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setPermissions(data); })
        .catch(() => {});
    } else {
      setPermissions(null);
    }
  }, [session, apiBaseUrl]);

  // Wire up demo write-blocked toast
  useEffect(() => {
    if (!isDemoMode()) return;
    setOnDemoWriteBlocked(() => () => {
      setDemoToastVisible(true);
      if (_demoToastTimer.current) clearTimeout(_demoToastTimer.current);
      _demoToastTimer.current = setTimeout(() => setDemoToastVisible(false), 3000);
    });
    return () => setOnDemoWriteBlocked(null);
  }, []);

  // Wire up 401 session expiry interceptor — force re-check session on auth failure
  useEffect(() => {
    setOnSessionExpired(() => {
      refreshSession();
    });
    return () => setOnSessionExpired(null);
  }, [refreshSession]);

  // Dev tenant switcher: load tenants when VITE_DEV_MODE is enabled
  useEffect(() => {
    if (import.meta.env.VITE_DEV_MODE !== "true" || devTenantsLoaded) return;
    setDevTenantsLoaded(true);
    apiFetch(`${apiBaseUrl}/api/dev/tenants`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.tenants) {
          setDevTenants(data.tenants);
          // Set current tenant from the active flag or first tenant
          const active = data.tenants.find((t: { active?: boolean }) => t.active);
          if (active) setDevCurrentTenant(active.id);
          else if (data.tenants.length > 0) setDevCurrentTenant(data.tenants[0].id);
        }
      })
      .catch(() => {});
  }, [apiBaseUrl, devTenantsLoaded]);

  return {
    // Auth gate state
    authChecked, setAuthChecked,
    authRequired, setAuthRequired,
    session, setSession,
    permissions, setPermissions,
    authScreenView, setAuthScreenView,
    authGateEmail, setAuthGateEmail,
    authGatePassword, setAuthGatePassword,
    authGateError, setAuthGateError,
    authGateLoading, setAuthGateLoading,
    authGateDisplayName, setAuthGateDisplayName,
    authLoginMethod, setAuthLoginMethod,
    authGateCode, setAuthGateCode,
    authCodeFlowId, setAuthCodeFlowId,
    authCodeSent, setAuthCodeSent,
    showDemoWelcome, setShowDemoWelcome,
    demoToastVisible, setDemoToastVisible,
    // Dev tenant switcher
    devTenants, setDevTenants,
    devCurrentTenant, setDevCurrentTenant,
    showDevTenantDropdown, setShowDevTenantDropdown,
    devTenantsLoaded, setDevTenantsLoaded,
    // Profile password change
    profileNewPassword, setProfileNewPassword,
    profileConfirmPassword, setProfileConfirmPassword,
    profilePasswordError, setProfilePasswordError,
    profilePasswordSuccess, setProfilePasswordSuccess,
    // Callbacks
    refreshSession,
    handleLogin,
    handleCodeLogin,
    handleMagicLink,
    handlePasskeyLogin,
    handleRegister,
    handleLogout,
    handleDevTenantSwitch,
    changePassword,
  };
}
