// ModulePanels.tsx — Thin router that delegates to panel files
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";

import { renderAuthMain, renderAuthPaneB } from "./panels/AuthPanel";
import { renderAuthZMain, renderAuthZPaneB } from "./panels/AuthZPanel";
import { renderStorageMain, renderStoragePaneB } from "./panels/StoragePanel";
import { renderRealtimeMain, renderRealtimePaneB } from "./panels/RealtimePanel";
import { renderEdgeMain, renderEdgePaneB } from "./panels/EdgePanel";
import { renderSearchMain, renderSearchPaneB } from "./panels/SearchPanel";
import { renderWebhooksMain, renderWebhooksPaneB } from "./panels/WebhooksPanel";
import { renderSettingsMain, renderSettingsPaneB } from "./panels/SettingsPanel";
import { renderOAuth2Main, renderOAuth2PaneB } from "./panels/OAuth2Panel";
import { renderGatewayMain, renderGatewayPaneB } from "./panels/GatewayPanel";
import { renderFlagsMain, renderFlagsPaneB } from "./panels/FlagsPanel";
import { renderCacheMain, renderCachePaneB } from "./panels/CachePanel";

export function renderModulesMain(s: any): React.JSX.Element | null {
  const { primaryNav } = s;
  switch (primaryNav) {
    case "authn": return renderAuthMain(s);
    case "authz": return renderAuthZMain(s);
    case "storage": return renderStorageMain(s);
    case "realtime": return renderRealtimeMain(s);
    case "edge": return renderEdgeMain(s);
    case "search": return renderSearchMain(s);
    case "webhooks": return renderWebhooksMain(s);
    case "settings": return renderSettingsMain(s);
    case "oauth2": return renderOAuth2Main(s);
    case "gateway": return renderGatewayMain(s);
    case "flags": return renderFlagsMain(s);
    case "cache": return renderCacheMain(s);
    default: return null;
  }
}

export function renderModulesPaneB(s: any): React.JSX.Element | null {
  const { primaryNav } = s;
  switch (primaryNav) {
    case "authn": return renderAuthPaneB(s);
    case "authz": return renderAuthZPaneB(s);
    case "storage": return renderStoragePaneB(s);
    case "realtime": return renderRealtimePaneB(s);
    case "edge": return renderEdgePaneB(s);
    case "search": return renderSearchPaneB(s);
    case "webhooks": return renderWebhooksPaneB(s);
    case "settings": return renderSettingsPaneB(s);
    case "oauth2": return renderOAuth2PaneB(s);
    case "gateway": return renderGatewayPaneB(s);
    case "flags": return renderFlagsPaneB(s);
    case "cache": return renderCachePaneB(s);
    default: return null;
  }
}
