// FlagsPanel.tsx — Feature Flags panel (flagd integration)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import {
  ArrowRight,
  ArrowsClockwise,
  CaretDown,
  CaretRight,
  CheckCircle,
  ClipboardText,
  ClockCounterClockwise,
  Code,
  Copy,
  Flag,
  FlagBanner,
  Funnel,
  Gauge,
  ListBullets,
  MagnifyingGlass,
  Minus,
  PencilSimple,
  Play,
  Plus,
  SlidersHorizontal,
  Tag,
  Trash,
  UsersThree,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import { apiFetch } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  if (diff < 0) return "just now";
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

/** Convert variants from any format (object or array) to [{key, value}] array */
function toVariantsArray(v: any): Array<{ key: string; value: any }> {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return Object.entries(v).map(([k, val]) => ({ key: k, value: val }));
  return [];
}

// ─── Type Badges ─────────────────────────────────────────────────────────────

const TYPE_BADGE_STYLES: Record<string, string> = {
  boolean: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  string: "bg-purple-500/10 text-purple-300 border-purple-500/20",
  number: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  object: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
};

function TypeBadge({ type }: { type: string }) {
  const style = TYPE_BADGE_STYLES[type] || "bg-slate-700/50 text-slate-300 border-slate-600/30";
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${style}`}>
      {type}
    </span>
  );
}

// ─── Toggle Switch ───────────────────────────────────────────────────────────

function ToggleSwitch({ enabled, onChange, size = "md" }: { enabled: boolean; onChange: () => void; size?: "sm" | "md" }) {
  const w = size === "sm" ? "w-7" : "w-9";
  const h = size === "sm" ? "h-4" : "h-5";
  const dot = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const translate = size === "sm" ? "translate-x-3" : "translate-x-4";
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`relative inline-flex ${w} ${h} shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${enabled ? "bg-emerald-500" : "bg-slate-600"}`}
    >
      <span className={`pointer-events-none inline-block ${dot} transform rounded-full bg-white shadow transition-transform duration-200 ${enabled ? translate : "translate-x-0.5"}`} />
    </button>
  );
}

// ─── Environment Dots ────────────────────────────────────────────────────────

function EnvDots({ environments }: { environments?: Record<string, { enabled: boolean }> }) {
  const envs = environments || {};
  const order = ["dev", "staging", "prod"];
  return (
    <div className="flex items-center gap-1" title={order.map(e => `${e}: ${envs[e]?.enabled ? "on" : "off"}`).join(", ")}>
      {order.map(env => (
        <span
          key={env}
          className={`inline-block h-2 w-2 rounded-full ${envs[env]?.enabled ? "bg-emerald-400" : "bg-slate-600"}`}
          title={`${env}: ${envs[env]?.enabled ? "enabled" : "disabled"}`}
        />
      ))}
    </div>
  );
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, onConfirm, onCancel }: { title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-sm rounded border border-slate-700 bg-slate-900 p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <p className="mt-2 text-xs text-slate-400">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
          <button onClick={onConfirm} className="rounded border border-red-700 bg-red-900/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-900/60">Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Error/Info Banner ───────────────────────────────────────────────────────

function Banner({ message, type, onClose }: { message: string; type: "error" | "info" | "success"; onClose: () => void }) {
  const colors = type === "error" ? "border-red-800/50 bg-red-950/30 text-red-300" : type === "success" ? "border-emerald-800/50 bg-emerald-950/30 text-emerald-300" : "border-accent-800/50 bg-accent-950/30 text-accent-300";
  return (
    <div className={`flex items-center justify-between rounded border px-3 py-2 text-xs ${colors}`}>
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100"><XCircle size={14} /></button>
    </div>
  );
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner() {
  return <span className="truss-spinner" />;
}

// ─── Targeting Rule Builder ──────────────────────────────────────────────────

type Condition = {
  id: string;
  attribute: string;
  operator: string;
  value: string;
};

type ConditionGroup = {
  id: string;
  logic: "and" | "or";
  conditions: Condition[];
  variant: string;
};

const STRING_OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "in", label: "in (comma-separated)" },
];

const NUMBER_OPERATORS = [
  { value: "==", label: "==" },
  { value: "!=", label: "!=" },
  { value: ">", label: ">" },
  { value: ">=", label: ">=" },
  { value: "<", label: "<" },
  { value: "<=", label: "<=" },
];

const SEMVER_OPERATORS = [
  { value: "=", label: "=" },
  { value: "!=", label: "!=" },
  { value: ">", label: ">" },
  { value: ">=", label: ">=" },
  { value: "<", label: "<" },
  { value: "<=", label: "<=" },
  { value: "~", label: "~ (patch)" },
  { value: "^", label: "^ (minor)" },
];

function getOperatorsForContext(attribute: string): Array<{ value: string; label: string }> {
  if (attribute === "version" || attribute.includes("semver")) return SEMVER_OPERATORS;
  if (attribute === "age" || attribute === "count" || attribute.includes("number")) return NUMBER_OPERATORS;
  return STRING_OPERATORS;
}

function newConditionId() {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function newGroupId() {
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function conditionToJsonLogic(cond: Condition): any {
  const varRef = { var: cond.attribute };
  if (SEMVER_OPERATORS.some(o => o.value === cond.operator)) {
    return { sem_ver: [varRef, cond.operator, cond.value] };
  }
  switch (cond.operator) {
    case "equals": case "==": return { "==": [varRef, cond.value] };
    case "not_equals": case "!=": return { "!=": [varRef, cond.value] };
    case "contains": return { in: [cond.value, varRef] };
    case "starts_with": return { "starts_with": [varRef, cond.value] };
    case "ends_with": return { "ends_with": [varRef, cond.value] };
    case "in": return { in: [varRef, cond.value.split(",").map(s => s.trim())] };
    case ">": return { ">": [varRef, Number(cond.value) || cond.value] };
    case ">=": return { ">=": [varRef, Number(cond.value) || cond.value] };
    case "<": return { "<": [varRef, Number(cond.value) || cond.value] };
    case "<=": return { "<=": [varRef, Number(cond.value) || cond.value] };
    default: return { "==": [varRef, cond.value] };
  }
}

function groupsToJsonLogic(groups: ConditionGroup[]): any {
  if (groups.length === 0) return null;
  const parts = groups.map(g => {
    const condLogic = g.conditions.map(conditionToJsonLogic);
    if (condLogic.length === 0) return null;
    if (condLogic.length === 1) return condLogic[0];
    return { [g.logic]: condLogic };
  }).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return { and: parts };
}

function ConditionRow({ condition, onChange, onRemove }: { condition: Condition; onChange: (c: Condition) => void; onRemove: () => void }) {
  const operators = getOperatorsForContext(condition.attribute);
  return (
    <div className="flex items-center gap-2">
      <input
        value={condition.attribute}
        onChange={e => onChange({ ...condition, attribute: e.target.value })}
        placeholder="attribute"
        className="w-32 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-accent-400"
      />
      <select
        value={condition.operator}
        onChange={e => onChange({ ...condition, operator: e.target.value })}
        className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 focus:outline-none"
      >
        {operators.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
      </select>
      <input
        value={condition.value}
        onChange={e => onChange({ ...condition, value: e.target.value })}
        placeholder="value"
        className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-accent-400"
      />
      <button onClick={onRemove} className="text-slate-500 hover:text-red-400"><Minus size={14} weight="regular" /></button>
    </div>
  );
}

function ConditionGroupEditor({
  group,
  variants,
  onChange,
  onRemove,
}: {
  group: ConditionGroup;
  variants: Array<{ key: string; value: any }>;
  onChange: (g: ConditionGroup) => void;
  onRemove: () => void;
}) {
  const addCondition = () => {
    onChange({
      ...group,
      conditions: [...group.conditions, { id: newConditionId(), attribute: "", operator: "equals", value: "" }],
    });
  };
  const updateCondition = (idx: number, c: Condition) => {
    const updated = [...group.conditions];
    updated[idx] = c;
    onChange({ ...group, conditions: updated });
  };
  const removeCondition = (idx: number) => {
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== idx) });
  };

  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase">When</span>
          <select
            value={group.logic}
            onChange={e => onChange({ ...group, logic: e.target.value as "and" | "or" })}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] text-slate-200 focus:outline-none"
          >
            <option value="and">ALL</option>
            <option value="or">ANY</option>
          </select>
          <span className="text-[10px] text-slate-400">of these conditions match, serve</span>
          <select
            value={group.variant}
            onChange={e => onChange({ ...group, variant: e.target.value })}
            className="rounded border border-accent-600/40 bg-slate-950 px-2 py-0.5 text-[10px] text-accent-300 focus:outline-none"
          >
            <option value="">-- variant --</option>
            {variants.map(v => <option key={v.key} value={v.key}>{v.key}</option>)}
          </select>
        </div>
        <button onClick={onRemove} className="text-slate-500 hover:text-red-400 text-[10px]"><Trash size={13} weight="regular" /></button>
      </div>
      <div className="space-y-1.5 pl-2">
        {group.conditions.map((cond, ci) => (
          <ConditionRow key={cond.id} condition={cond} onChange={c => updateCondition(ci, c)} onRemove={() => removeCondition(ci)} />
        ))}
      </div>
      <button onClick={addCondition} className="flex items-center gap-1 text-[10px] text-accent-400 hover:text-accent-300 pl-2">
        <Plus size={11} weight="regular" /> Add condition
      </button>
    </div>
  );
}

function TargetingRuleBuilder({
  groups,
  setGroups,
  variants,
  fallbackVariant,
  setFallbackVariant,
  jsonMode,
  setJsonMode,
  jsonOverride,
  setJsonOverride,
}: {
  groups: ConditionGroup[];
  setGroups: (g: ConditionGroup[]) => void;
  variants: Array<{ key: string; value: any }>;
  fallbackVariant: string;
  setFallbackVariant: (v: string) => void;
  jsonMode: boolean;
  setJsonMode: (v: boolean) => void;
  jsonOverride: string;
  setJsonOverride: (v: string) => void;
}) {
  const addGroup = () => {
    setGroups([...groups, {
      id: newGroupId(),
      logic: "and",
      conditions: [{ id: newConditionId(), attribute: "", operator: "equals", value: "" }],
      variant: variants[0]?.key || "",
    }]);
  };
  const updateGroup = (idx: number, g: ConditionGroup) => {
    const updated = [...groups];
    updated[idx] = g;
    setGroups(updated);
  };
  const removeGroup = (idx: number) => {
    setGroups(groups.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">Targeting Rules</h4>
        <button
          onClick={() => {
            if (!jsonMode) {
              setJsonOverride(JSON.stringify(groupsToJsonLogic(groups), null, 2) || "null");
            }
            setJsonMode(!jsonMode);
          }}
          className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300"
        >
          <Code size={12} weight="regular" /> {jsonMode ? "Visual mode" : "JSON mode"}
        </button>
      </div>

      {jsonMode ? (
        <div className="space-y-2">
          <textarea
            value={jsonOverride}
            onChange={e => setJsonOverride(e.target.value)}
            rows={12}
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-accent-400"
            placeholder="JsonLogic targeting rules..."
          />
          <p className="text-[10px] text-slate-500">Edit raw JsonLogic targeting rules. Must be valid JSON.</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {groups.map((g, gi) => (
              <ConditionGroupEditor
                key={g.id}
                group={g}
                variants={variants}
                onChange={gr => updateGroup(gi, gr)}
                onRemove={() => removeGroup(gi)}
              />
            ))}
          </div>
          <button onClick={addGroup} className="flex items-center gap-1 rounded border border-dashed border-slate-700 px-3 py-1.5 text-[11px] text-slate-400 hover:border-accent-600/50 hover:text-accent-300">
            <Plus size={13} weight="regular" /> Add rule group
          </button>
        </>
      )}

      <div className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/40 px-3 py-2">
        <span className="text-[10px] text-slate-400 font-semibold uppercase">Fallback variant:</span>
        <select
          value={fallbackVariant}
          onChange={e => setFallbackVariant(e.target.value)}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-200 focus:outline-none"
        >
          <option value="">-- select --</option>
          {variants.map(v => <option key={v.key} value={v.key}>{v.key}</option>)}
        </select>
        <span className="text-[10px] text-slate-500">Served when no targeting rules match</span>
      </div>
    </div>
  );
}

// ─── Rollout Slider ──────────────────────────────────────────────────────────

function RolloutEditor({
  rolloutPercentage,
  setRolloutPercentage,
  variants,
}: {
  rolloutPercentage: number;
  setRolloutPercentage: (n: number) => void;
  variants: Array<{ key: string; value: any }>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide mb-2">Gradual Rollout</h4>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={100}
            value={rolloutPercentage}
            onChange={e => setRolloutPercentage(Number(e.target.value))}
            className="flex-1 accent-accent-500"
          />
          <span className="text-sm font-semibold text-slate-100 w-12 text-right">{rolloutPercentage}%</span>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">Percentage of users who will receive the flag evaluation (vs. default).</p>
      </div>

      {variants.length > 1 && (
        <div>
          <h4 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide mb-2">Variant Distribution</h4>
          <div className="flex h-6 w-full overflow-hidden rounded border border-slate-700">
            {variants.map((v, i) => {
              const pct = Math.round(100 / variants.length);
              const colors = ["bg-accent-500", "bg-blue-500", "bg-purple-500", "bg-amber-500", "bg-cyan-500", "bg-emerald-500"];
              return (
                <div key={v.key} className={`${colors[i % colors.length]} flex items-center justify-center text-[9px] font-semibold text-white`} style={{ width: `${pct}%` }}>
                  {v.key}
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            {variants.map(v => <span key={v.key}>{v.key}: {Math.round(100 / variants.length)}%</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Environment Cards ───────────────────────────────────────────────────────

function EnvironmentsEditor({
  environments,
  setEnvironments,
  onPromote,
}: {
  environments: Record<string, { enabled: boolean; rollout: number; overrideTargeting: boolean }>;
  setEnvironments: (e: Record<string, any>) => void;
  onPromote: (from: string, to: string) => void;
}) {
  const envOrder = ["dev", "staging", "prod"];
  const envLabels: Record<string, string> = { dev: "Development", staging: "Staging", prod: "Production" };
  const envColors: Record<string, string> = {
    dev: "border-blue-500/30",
    staging: "border-amber-500/30",
    prod: "border-emerald-500/30",
  };

  return (
    <div className="space-y-3">
      <h4 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">Environments</h4>
      <div className="grid gap-3 sm:grid-cols-3">
        {envOrder.map((env, idx) => {
          const cfg = environments[env] || { enabled: false, rollout: 100, overrideTargeting: false };
          return (
            <div key={env} className={`rounded border ${envColors[env]} bg-slate-900/40 p-3 space-y-2`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-200">{envLabels[env]}</span>
                <ToggleSwitch
                  size="sm"
                  enabled={cfg.enabled}
                  onChange={() => setEnvironments({ ...environments, [env]: { ...cfg, enabled: !cfg.enabled } })}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Rollout %</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={cfg.rollout}
                  onChange={e => setEnvironments({ ...environments, [env]: { ...cfg, rollout: Number(e.target.value) } })}
                  className="w-full accent-accent-500"
                />
                <span className="text-[10px] text-slate-400">{cfg.rollout}%</span>
              </div>
              <label className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <input
                  type="checkbox"
                  checked={cfg.overrideTargeting}
                  onChange={e => setEnvironments({ ...environments, [env]: { ...cfg, overrideTargeting: e.target.checked } })}
                />
                Override targeting
              </label>
              {idx < envOrder.length - 1 && (
                <button
                  onClick={() => onPromote(env, envOrder[idx + 1])}
                  className="flex items-center gap-1 rounded border border-accent-600/30 px-2 py-1 text-[10px] text-accent-300 hover:bg-accent-900/20 w-full justify-center"
                >
                  <ArrowRight size={11} weight="regular" /> Promote to {envLabels[envOrder[idx + 1]]}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Variant Editor ──────────────────────────────────────────────────────────

function VariantEditor({
  variants,
  setVariants,
  flagType,
}: {
  variants: Array<{ key: string; value: any }>;
  setVariants: (v: Array<{ key: string; value: any }>) => void;
  flagType: string;
}) {
  const addVariant = () => {
    const key = `variant-${variants.length + 1}`;
    let value: any = "";
    if (flagType === "boolean") value = variants.length === 0;
    else if (flagType === "number") value = 0;
    else if (flagType === "object") value = "{}";
    setVariants([...variants, { key, value }]);
  };
  const updateVariant = (idx: number, field: "key" | "value", val: any) => {
    const updated = [...variants];
    updated[idx] = { ...updated[idx], [field]: val };
    setVariants(updated);
  };
  const removeVariant = (idx: number) => {
    setVariants(variants.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Variants</label>
        <button onClick={addVariant} className="flex items-center gap-1 text-[10px] text-accent-400 hover:text-accent-300"><Plus size={11} weight="regular" /> Add variant</button>
      </div>
      {variants.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <span className="w-36 text-[9px] uppercase tracking-widest text-slate-600 font-medium">Variant Key</span>
          <span className="w-4" />
          <span className="flex-1 text-[9px] uppercase tracking-widest text-slate-600 font-medium">Value</span>
          <span className="w-[13px]" />
        </div>
      )}
      {variants.map((v, i) => (
        <div key={i} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${i % 2 === 0 ? "bg-slate-900/20" : ""}`}>
          <input
            value={v.key}
            onChange={e => updateVariant(i, "key", e.target.value)}
            placeholder="key"
            className="w-36 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-accent-400"
          />
          <span className="text-[10px] text-slate-600">=</span>
          {flagType === "object" ? (
            <textarea
              value={typeof v.value === "string" ? v.value : JSON.stringify(v.value, null, 2)}
              onChange={e => updateVariant(i, "value", e.target.value)}
              rows={2}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          ) : flagType === "boolean" ? (
            <select
              value={String(v.value)}
              onChange={e => updateVariant(i, "value", e.target.value === "true")}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 focus:outline-none"
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              value={String(v.value)}
              onChange={e => updateVariant(i, "value", flagType === "number" ? Number(e.target.value) || 0 : e.target.value)}
              placeholder="value"
              type={flagType === "number" ? "number" : "text"}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          )}
          <button onClick={() => removeVariant(i)} className="text-slate-500 hover:text-red-400"><Trash size={13} weight="regular" /></button>
        </div>
      ))}
    </div>
  );
}

// ─── Metadata Editor ─────────────────────────────────────────────────────────

function MetadataEditor({ metadata, setMetadata }: { metadata: Array<{ key: string; value: string }>; setMetadata: (m: Array<{ key: string; value: string }>) => void }) {
  const add = () => setMetadata([...metadata, { key: "", value: "" }]);
  const update = (idx: number, field: "key" | "value", val: string) => {
    const updated = [...metadata];
    updated[idx] = { ...updated[idx], [field]: val };
    setMetadata(updated);
  };
  const remove = (idx: number) => setMetadata(metadata.filter((_, i) => i !== idx));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Metadata</label>
        <button onClick={add} className="flex items-center gap-1 text-[10px] text-accent-400 hover:text-accent-300"><Plus size={11} weight="regular" /> Add</button>
      </div>
      {metadata.map((m, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={m.key} onChange={e => update(i, "key", e.target.value)} placeholder="key" className="w-36 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-accent-400" />
          <span className="text-[10px] text-slate-600">=</span>
          <input value={m.value} onChange={e => update(i, "value", e.target.value)} placeholder="value" className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-accent-400" />
          <button onClick={() => remove(i)} className="text-slate-500 hover:text-red-400"><Trash size={13} weight="regular" /></button>
        </div>
      ))}
    </div>
  );
}

// ─── Tags Editor ─────────────────────────────────────────────────────────────

function TagsEditor({ tags, setTags }: { tags: string[]; setTags: (t: string[]) => void }) {
  const [input, setInput] = React.useState("");
  const add = () => {
    const tag = input.trim();
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setInput("");
  };
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Tags</label>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map(t => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
            {t}
            <button onClick={() => setTags(tags.filter(x => x !== t))} className="text-slate-500 hover:text-red-400"><XCircle size={10} /></button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add tag..."
          className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent-400"
        />
      </div>
    </div>
  );
}

// ─── Create Flag View ────────────────────────────────────────────────────────

function CreateFlagView({ apiBaseUrl, onBack, onCreated }: { apiBaseUrl: string; onBack: () => void; onCreated: () => void }) {
  const [name, setName] = React.useState("");
  const [key, setKey] = React.useState("");
  const [keyManual, setKeyManual] = React.useState(false);
  const [description, setDescription] = React.useState("");
  const [flagType, setFlagType] = React.useState("boolean");
  const [variants, setVariants] = React.useState<Array<{ key: string; value: any }>>([
    { key: "on", value: true },
    { key: "off", value: false },
  ]);
  const [defaultVariant, setDefaultVariant] = React.useState("off");
  const [tags, setTags] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!keyManual) setKey(toKebabCase(name));
  }, [name, keyManual]);

  React.useEffect(() => {
    if (flagType === "boolean") {
      setVariants([{ key: "on", value: true }, { key: "off", value: false }]);
      setDefaultVariant("off");
    } else if (flagType === "string") {
      setVariants([{ key: "value-a", value: "a" }, { key: "value-b", value: "b" }]);
      setDefaultVariant("value-a");
    } else if (flagType === "number") {
      setVariants([{ key: "low", value: 10 }, { key: "high", value: 100 }]);
      setDefaultVariant("low");
    } else {
      setVariants([{ key: "default", value: "{}" }]);
      setDefaultVariant("default");
    }
  }, [flagType]);

  const create = () => {
    if (!key) return;
    setSaving(true);
    setError("");
    apiFetch(`${apiBaseUrl}/api/flags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, name: name || key, description, type: flagType, variants, defaultVariant, tags }),
    })
      .then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.error || `HTTP ${r.status}`); });
        return r.json();
      })
      .then(() => { onCreated(); onBack(); })
      .catch(e => setError(e.message))
      .finally(() => setSaving(false));
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-xs text-slate-400 hover:text-slate-200">&larr; Back</button>
        <h2 className="text-sm font-medium text-slate-100">Create Feature Flag</h2>
      </div>
      {error && <Banner message={error} type="error" onClose={() => setError("")} />}
      <div className="space-y-5">
        {/* Identity section */}
        <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 p-4 space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Identity</p>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="My Feature Flag" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Flag Key</label>
            <input
              value={key}
              onChange={e => { setKey(e.target.value); setKeyManual(true); }}
              placeholder="my-feature-flag"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
            <p className="mt-0.5 text-[10px] text-slate-500">Auto-generated from name. Edit to customize.</p>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="What this flag controls..." className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400" />
          </div>
        </div>

        {/* Configuration section */}
        <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 p-4 space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Configuration</p>
          <div>
            <label className="mb-1.5 block text-[11px] text-slate-400">Type</label>
            <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
              {["boolean", "string", "number", "object"].map((t, i) => (
                <button
                  key={t}
                  onClick={() => setFlagType(t)}
                  className={`px-3.5 py-1.5 text-[11px] font-medium transition-colors ${i > 0 ? "border-l border-slate-700" : ""} ${flagType === t ? "bg-accent-900/40 text-accent-200" : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-300"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <VariantEditor variants={variants} setVariants={setVariants} flagType={flagType} />
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Default Variant</label>
            <select
              value={defaultVariant}
              onChange={e => setDefaultVariant(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
            >
              {variants.map(v => <option key={v.key} value={v.key}>{v.key}</option>)}
            </select>
          </div>
        </div>

        {/* Metadata section */}
        <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 p-4 space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Metadata</p>
          <TagsEditor tags={tags} setTags={setTags} />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button onClick={onBack} className="border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg px-4 py-2 text-xs font-medium transition-colors">Cancel</button>
          <button onClick={create} disabled={!key || saving} className="flex-1 bg-accent-500 hover:bg-accent-400 text-white rounded-lg px-4 py-2 text-xs font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-1">
            {saving ? <Spinner /> : null} Create Flag
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Flag Detail View ────────────────────────────────────────────────────────

function FlagDetailView({
  flag,
  apiBaseUrl,
  onBack,
  onReload,
}: {
  flag: any;
  apiBaseUrl: string;
  onBack: () => void;
  onReload: () => void;
}) {
  const [activeTab, setActiveTab] = React.useState<"config" | "targeting" | "rollout" | "environments" | "history">("config");
  const [flagData, setFlagData] = React.useState<any>(flag);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [info, setInfo] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  // Editable fields
  const [name, setName] = React.useState(flag.name || "");
  const [description, setDescription] = React.useState(flag.description || "");
  const [variants, setVariants] = React.useState<Array<{ key: string; value: any }>>(toVariantsArray(flag.variants));
  const [defaultVariant, setDefaultVariant] = React.useState(flag.default_variant || flag.defaultVariant || "");
  const [metadata, setMetadata] = React.useState<Array<{ key: string; value: string }>>(
    flag.metadata ? Object.entries(flag.metadata).map(([k, v]) => ({ key: k, value: String(v) })) : []
  );
  const [tags, setTags] = React.useState<string[]>(flag.tags || []);

  // Targeting
  const [targetingGroups, setTargetingGroups] = React.useState<ConditionGroup[]>([]);
  const [fallbackVariant, setFallbackVariant] = React.useState(flag.defaultVariant || "");
  const [jsonMode, setJsonMode] = React.useState(false);
  const [jsonOverride, setJsonOverride] = React.useState("");

  // Rollout
  const [rolloutPercentage, setRolloutPercentage] = React.useState(flag.rollout?.percentage ?? 100);

  // Environments
  const [environments, setEnvironments] = React.useState<Record<string, any>>(flag.environments || {
    dev: { enabled: true, rollout: 100, overrideTargeting: false },
    staging: { enabled: false, rollout: 100, overrideTargeting: false },
    prod: { enabled: false, rollout: 100, overrideTargeting: false },
  });

  // History
  const [history, setHistory] = React.useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const historyLoadedRef = React.useRef(false);

  const loadedRef = React.useRef(false);

  // Auto-load full flag detail
  React.useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      setLoading(true);
      apiFetch(`${apiBaseUrl}/api/flags/${flag.key}`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(d => {
          const f = d.flag || d;
          setFlagData(f);
          setName(f.name || "");
          setDescription(f.description || "");
          setVariants(toVariantsArray(f.variants));
          setDefaultVariant(f.default_variant || f.defaultVariant || "");
          setMetadata(f.metadata ? Object.entries(f.metadata).map(([k, v]) => ({ key: k, value: String(v) })) : []);
          setTags(f.tags || []);
          setRolloutPercentage(f.rollout?.percentage ?? 100);
          setEnvironments(f.environments || environments);
          setFallbackVariant(f.targeting?.fallbackVariant || f.defaultVariant || "");
        })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [apiBaseUrl, flag.key]);

  const loadHistory = React.useCallback(() => {
    setHistoryLoading(true);
    apiFetch(`${apiBaseUrl}/api/flags/activity?flagKey=${flag.key}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => setHistory(d.entries || d.activity || []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [apiBaseUrl, flag.key]);

  React.useEffect(() => {
    if (activeTab === "history" && !historyLoadedRef.current) {
      historyLoadedRef.current = true;
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  const save = () => {
    setSaving(true);
    setError("");
    const metaObj: Record<string, string> = {};
    metadata.forEach(m => { if (m.key) metaObj[m.key] = m.value; });
    const targeting = jsonMode ? (() => { try { return JSON.parse(jsonOverride); } catch { return null; } })() : groupsToJsonLogic(targetingGroups);
    apiFetch(`${apiBaseUrl}/api/flags/${flag.key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, description, variants, defaultVariant, metadata: metaObj, tags,
        targeting: { rules: targeting, fallbackVariant },
        rollout: { percentage: rolloutPercentage },
        environments,
      }),
    })
      .then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.error || `HTTP ${r.status}`); });
        return r.json();
      })
      .then(() => { setInfo("Flag saved successfully"); onReload(); setTimeout(() => setInfo(""), 3000); })
      .catch(e => setError(e.message))
      .finally(() => setSaving(false));
  };

  const toggleFlag = () => {
    apiFetch(`${apiBaseUrl}/api/flags/${flag.key}/toggle`, { method: "PATCH" })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        setFlagData({ ...flagData, state: d.state || (flagData.state === "ENABLED" ? "DISABLED" : "ENABLED") });
        onReload();
      })
      .catch(e => setError(e.message));
  };

  const deleteFlag = () => {
    apiFetch(`${apiBaseUrl}/api/flags/${flag.key}`, { method: "DELETE" })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        onReload();
        onBack();
      })
      .catch(e => setError(e.message));
  };

  const promoteEnv = (from: string, to: string) => {
    apiFetch(`${apiBaseUrl}/api/flags/${flag.key}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (d.environments) setEnvironments(d.environments);
        setInfo(`Promoted ${from} to ${to}`);
        setTimeout(() => setInfo(""), 3000);
      })
      .catch(e => setError(e.message));
  };

  const isEnabled = flagData?.state === "ENABLED";
  const tabs: Array<{ key: typeof activeTab; label: string }> = [
    { key: "config", label: "Configuration" },
    { key: "targeting", label: "Targeting" },
    { key: "rollout", label: "Rollout" },
    { key: "environments", label: "Environments" },
    { key: "history", label: "History" },
  ];

  if (loading) {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-4 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Flag"
          message={`Are you sure you want to delete "${flag.key}"? This action cannot be undone.`}
          onConfirm={() => { setConfirmDelete(false); deleteFlag(); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors">
            <svg width="14" height="14" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Flags
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${isEnabled ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]" : "bg-slate-500"}`} />
            <code className="text-base font-mono font-medium text-slate-100 truncate">{flag.key}</code>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${isEnabled ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20" : "bg-slate-700/50 text-slate-400 border border-slate-700"}`}>
              {isEnabled ? "Enabled" : "Disabled"}
            </span>
            {flagData?.type && <TypeBadge type={flagData.type} />}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ToggleSwitch enabled={isEnabled} onChange={toggleFlag} />
            <button onClick={() => setConfirmDelete(true)} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-red-300 hover:border-red-900/50 hover:bg-red-950/20 transition-all">
              <Trash size={13} weight="regular" />
            </button>
          </div>
        </div>
      </div>

      {error && <Banner message={error} type="error" onClose={() => setError("")} />}
      {info && <Banner message={info} type="success" onClose={() => setInfo("")} />}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-800/60">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 -mb-px transition-colors ${activeTab === t.key ? "border-accent-500 text-accent-300" : "border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="max-w-3xl">
        {activeTab === "config" && (
          <div className="space-y-4">
            {/* Identity card */}
            <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 p-4 space-y-4">
              <h4 className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Identity</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] text-slate-500">Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-slate-500">Type</label>
                  <div className="pt-1"><TypeBadge type={flagData?.type || "boolean"} /></div>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-slate-500">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400" />
              </div>
            </div>
            {/* Variants card */}
            <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 p-4 space-y-4">
              <VariantEditor variants={variants} setVariants={setVariants} flagType={flagData?.type || "boolean"} />
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500 font-medium">Default Variant</label>
                <select
                  value={defaultVariant}
                  onChange={e => setDefaultVariant(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
                >
                  {variants.map(v => <option key={v.key} value={v.key}>{v.key}</option>)}
                </select>
              </div>
            </div>
            {/* Metadata card */}
            <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 p-4 space-y-4">
              <MetadataEditor metadata={metadata} setMetadata={setMetadata} />
              <TagsEditor tags={tags} setTags={setTags} />
            </div>
          </div>
        )}

        {activeTab === "targeting" && (
          <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 p-4">
          <TargetingRuleBuilder
            groups={targetingGroups}
            setGroups={setTargetingGroups}
            variants={variants}
            fallbackVariant={fallbackVariant}
            setFallbackVariant={setFallbackVariant}
            jsonMode={jsonMode}
            setJsonMode={setJsonMode}
            jsonOverride={jsonOverride}
            setJsonOverride={setJsonOverride}
          />
          </div>
        )}

        {activeTab === "rollout" && (
          <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 p-4">
          <RolloutEditor
            rolloutPercentage={rolloutPercentage}
            setRolloutPercentage={setRolloutPercentage}
            variants={variants}
          />
          </div>
        )}

        {activeTab === "environments" && (
          <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 p-4">
          <EnvironmentsEditor
            environments={environments}
            setEnvironments={setEnvironments}
            onPromote={promoteEnv}
          />
          </div>
        )}

        {activeTab === "history" && (
          <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">Change History</h4>
              <button onClick={loadHistory} className="text-[11px] text-slate-500 hover:text-slate-300">Refresh</button>
            </div>
            {historyLoading && <p className="text-xs text-slate-400"><Spinner /> Loading...</p>}
            {!historyLoading && history.length === 0 && <p className="text-xs text-slate-500">No history available.</p>}
            <div className="space-y-1">
              {history.map((entry: any, idx: number) => (
                <ActivityEntry key={entry.id || idx} entry={entry} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Save button (shown for config, targeting, rollout, environments) */}
      {activeTab !== "history" && (
        <div className="flex justify-end border-t border-slate-800/60 pt-4">
          <button
            onClick={save}
            disabled={saving}
            className="bg-accent-500 hover:bg-accent-400 text-white rounded-lg px-5 py-2 text-xs font-medium disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            {saving ? <Spinner /> : null} Save Changes
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Activity Entry ──────────────────────────────────────────────────────────

const ACTION_STYLES: Record<string, string> = {
  created: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  updated: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  toggled: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  deleted: "bg-red-500/10 text-red-300 border-red-500/20",
  env_updated: "bg-purple-500/10 text-purple-300 border-purple-500/20",
  promoted: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
};

function ActivityEntry({ entry }: { entry: any }) {
  const [expanded, setExpanded] = React.useState(false);
  const actionStyle = ACTION_STYLES[entry.action] || "bg-slate-700/50 text-slate-300 border-slate-600/30";
  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 p-2.5">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {expanded ? <CaretDown size={12} className="text-slate-500" /> : <CaretRight size={12} className="text-slate-500" />}
        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${actionStyle}`}>
          {entry.action}
        </span>
        <code className="text-[11px] font-mono text-slate-300">{entry.flagKey || entry.flag_key}</code>
        {entry.actor && <span className="text-[10px] text-slate-500">by {entry.actor}</span>}
        <span className="ml-auto text-[10px] text-slate-600">{entry.timestamp ? relativeTime(entry.timestamp) : ""}</span>
      </div>
      {expanded && entry.payload && (
        <pre className="mt-2 rounded border border-slate-800 bg-slate-950 p-2 text-[10px] text-slate-400 font-mono overflow-auto max-h-40">
          {typeof entry.payload === "string" ? entry.payload : JSON.stringify(entry.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Segments View ───────────────────────────────────────────────────────────

function SegmentsView({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [segments, setSegments] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<any>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const loadedRef = React.useRef(false);

  // Form fields
  const [segKey, setSegKey] = React.useState("");
  const [segName, setSegName] = React.useState("");
  const [segDescription, setSegDescription] = React.useState("");
  const [segRules, setSegRules] = React.useState<ConditionGroup[]>([]);
  const [saving, setSaving] = React.useState(false);

  const loadSegments = React.useCallback(() => {
    setLoading(true);
    apiFetch(`${apiBaseUrl}/api/flags/segments`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => setSegments(d.segments || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiBaseUrl]);

  React.useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadSegments();
    }
  }, [loadSegments]);

  const resetForm = () => {
    setSegKey(""); setSegName(""); setSegDescription("");
    setSegRules([]);
  };

  const openCreate = () => {
    resetForm();
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (seg: any) => {
    setSegKey(seg.key);
    setSegName(seg.name || "");
    setSegDescription(seg.description || "");
    setSegRules([]);
    setEditing(seg);
    setCreating(true);
  };

  const saveSegment = () => {
    const isEdit = !!editing;
    setSaving(true);
    setError("");
    const rules = groupsToJsonLogic(segRules);
    const method = isEdit ? "PUT" : "POST";
    const url = isEdit ? `${apiBaseUrl}/api/flags/segments/${editing.key}` : `${apiBaseUrl}/api/flags/segments`;
    apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: segKey, name: segName, description: segDescription, rules }),
    })
      .then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.error || `HTTP ${r.status}`); });
        return r.json();
      })
      .then(() => { setCreating(false); resetForm(); loadSegments(); })
      .catch(e => setError(e.message))
      .finally(() => setSaving(false));
  };

  const deleteSegment = (key: string) => {
    apiFetch(`${apiBaseUrl}/api/flags/segments/${key}`, { method: "DELETE" })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        loadSegments();
      })
      .catch(e => setError(e.message))
      .finally(() => setConfirmDelete(null));
  };

  if (creating) {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4 max-w-2xl">
        <div className="flex items-center gap-3">
          <button onClick={() => { setCreating(false); resetForm(); }} className="text-xs text-slate-400 hover:text-slate-200">&larr; Back</button>
          <h2 className="text-sm font-medium text-slate-100">{editing ? "Edit Segment" : "Create Segment"}</h2>
        </div>
        {error && <Banner message={error} type="error" onClose={() => setError("")} />}
        <div className="rounded border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Segment Key</label>
            <input value={segKey} onChange={e => setSegKey(e.target.value)} disabled={!!editing} placeholder="beta-users" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:opacity-50" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Name</label>
            <input value={segName} onChange={e => setSegName(e.target.value)} placeholder="Beta Users" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Description</label>
            <textarea value={segDescription} onChange={e => setSegDescription(e.target.value)} rows={2} placeholder="Users who opted in to beta features..." className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400" />
          </div>
          <div>
            <label className="mb-2 block text-[11px] font-semibold text-slate-300 uppercase tracking-wide">Segment Rules</label>
            <div className="space-y-2">
              {segRules.map((g, gi) => (
                <ConditionGroupEditor
                  key={g.id}
                  group={g}
                  variants={[]}
                  onChange={gr => { const u = [...segRules]; u[gi] = gr; setSegRules(u); }}
                  onRemove={() => setSegRules(segRules.filter((_, i) => i !== gi))}
                />
              ))}
            </div>
            <button
              onClick={() => setSegRules([...segRules, { id: newGroupId(), logic: "and", conditions: [{ id: newConditionId(), attribute: "", operator: "equals", value: "" }], variant: "" }])}
              className="mt-2 flex items-center gap-1 rounded border border-dashed border-slate-700 px-3 py-1.5 text-[11px] text-slate-400 hover:border-accent-600/50 hover:text-accent-300"
            >
              <Plus size={13} weight="regular" /> Add rule group
            </button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => { setCreating(false); resetForm(); }} className="rounded border border-slate-700 px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
            <button onClick={saveSegment} disabled={!segKey || saving} className="rounded border border-accent-700 bg-accent-900/40 px-4 py-1.5 text-xs text-accent-200 hover:bg-accent-900/60 disabled:opacity-50">
              {saving ? <Spinner /> : null} {editing ? "Update Segment" : "Create Segment"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Segment"
          message={`Are you sure you want to delete segment "${confirmDelete}"?`}
          onConfirm={() => deleteSegment(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Segments</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">Reusable user segments for targeting rules</p>
        </div>
        <button onClick={openCreate} className="truss-btn rounded border border-accent-600 bg-accent-600/20 px-3 py-1.5 text-xs text-accent-300 hover:bg-accent-600/30">
          <Plus size={14} weight="regular" /> Create Segment
        </button>
      </div>

      {error && <Banner message={error} type="error" onClose={() => setError("")} />}
      {loading && <p className="text-xs text-slate-400"><Spinner /> Loading...</p>}

      {!loading && segments.length === 0 && (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-6 text-center">
          <UsersThree size={32} className="mx-auto mb-2 text-slate-600" />
          <p className="text-sm text-slate-400">No segments defined</p>
          <p className="text-[11px] text-slate-500 mt-1">Create segments to group users by attributes for targeting.</p>
        </div>
      )}

      <div className="space-y-2">
        {segments.map((seg: any) => (
          <div key={seg.key} className="hover-reveal-actions rounded border border-slate-800 bg-slate-900/40 p-4 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-slate-200">{seg.key}</code>
                {seg.name && <span className="text-xs text-slate-400">{seg.name}</span>}
              </div>
              <div className="row-actions flex gap-1">
                <button onClick={() => openEdit(seg)} className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200">
                  <PencilSimple size={12} weight="regular" /> Edit
                </button>
                <button onClick={() => setConfirmDelete(seg.key)} className="rounded border border-red-800/40 px-2 py-0.5 text-[10px] text-red-400 hover:bg-red-900/20">
                  <Trash size={12} weight="regular" /> Delete
                </button>
              </div>
            </div>
            {seg.description && <p className="text-[11px] text-slate-500">{seg.description}</p>}
            {seg.rules && (
              <p className="mt-1 text-[10px] text-slate-600 font-mono truncate">
                {typeof seg.rules === "string" ? seg.rules : JSON.stringify(seg.rules)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Evaluation Playground ───────────────────────────────────────────────────

function PlaygroundView({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [flags, setFlags] = React.useState<any[]>([]);
  const [selectedFlag, setSelectedFlag] = React.useState("");
  const [context, setContext] = React.useState(`{
  "targetingKey": "user-123",
  "email": "test@example.com",
  "plan": "pro",
  "version": "2.1.0"
}`);
  const [result, setResult] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [bulkMode, setBulkMode] = React.useState(false);
  const [bulkResult, setBulkResult] = React.useState<any>(null);
  const flagsLoadedRef = React.useRef(false);

  React.useEffect(() => {
    if (!flagsLoadedRef.current) {
      flagsLoadedRef.current = true;
      apiFetch(`${apiBaseUrl}/api/flags`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(d => setFlags(d.flags || []))
        .catch(() => {});
    }
  }, [apiBaseUrl]);

  const evaluate = () => {
    setLoading(true);
    setError("");
    setResult(null);
    setBulkResult(null);
    let parsedCtx: any;
    try { parsedCtx = JSON.parse(context); } catch { setError("Invalid JSON context"); setLoading(false); return; }

    if (bulkMode) {
      apiFetch(`${apiBaseUrl}/api/flags/evaluate/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: parsedCtx }),
      })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(d => setBulkResult(d))
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    } else {
      if (!selectedFlag) { setError("Select a flag"); setLoading(false); return; }
      const start = performance.now();
      apiFetch(`${apiBaseUrl}/api/flags/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagKey: selectedFlag, context: parsedCtx }),
      })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(d => { setResult({ ...d, duration: Math.round(performance.now() - start) }); })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Evaluation Playground</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">Test flag evaluations with custom context</p>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer select-none">
          <input type="checkbox" checked={bulkMode} onChange={e => setBulkMode(e.target.checked)} className="rounded" />
          Bulk evaluate
        </label>
      </div>

      {error && <Banner message={error} type="error" onClose={() => setError("")} />}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: Input */}
        <div className="space-y-3">
          {!bulkMode && (
            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-slate-500 font-medium">Flag Key</label>
              <div className="relative">
                <Flag size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" weight="regular" />
                <select
                  value={selectedFlag}
                  onChange={e => setSelectedFlag(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 pl-8 pr-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-accent-400"
                >
                  <option value="">Select a flag...</option>
                  {flags.map((f: any) => <option key={f.key} value={f.key}>{f.key}</option>)}
                </select>
              </div>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-slate-500 font-medium">Evaluation Context (JSON)</label>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              rows={10}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-[11px] text-slate-200 font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          </div>
          <button
            onClick={evaluate}
            disabled={loading}
            className="w-full bg-accent-500 hover:bg-accent-400 text-white rounded-lg px-4 py-2 text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
          >
            {loading ? <Spinner /> : <Play size={14} weight="regular" />} Evaluate
          </button>
        </div>

        {/* Right: Result */}
        <div>
          {result && !bulkMode && (
            <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 p-4 space-y-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Result</p>
              {/* Variant — prominent display */}
              <div className="text-center py-3">
                <span className={`inline-block rounded-lg px-4 py-2 text-sm font-semibold font-mono ${
                  result.reason === "ERROR" ? "bg-red-500/15 text-red-300 border border-red-500/20" :
                  (result.variant === "on" || result.value === true || result.value === "true") ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20" :
                  "bg-slate-700/50 text-slate-200 border border-slate-600/30"
                }`}>{String(result.variant || result.value || "N/A")}</span>
              </div>
              {/* Reason + Duration pills */}
              <div className="flex items-center justify-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                  result.reason === "TARGETING_MATCH" ? "bg-emerald-500/10 text-emerald-300" :
                  result.reason === "DEFAULT" ? "bg-slate-700/50 text-slate-300" :
                  result.reason === "STATIC" ? "bg-blue-500/10 text-blue-300" :
                  result.reason === "ERROR" ? "bg-red-500/10 text-red-300" :
                  "bg-slate-700/50 text-slate-300"
                }`}>{result.reason || "UNKNOWN"}</span>
                <span className="rounded-full bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-400 font-mono">{result.duration}ms</span>
              </div>
              {/* Collapsible JSON details */}
              <details className="group">
                <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-slate-500 font-medium hover:text-slate-400 flex items-center gap-1">
                  <CaretRight size={10} className="group-open:rotate-90 transition-transform" /> Full Response
                </summary>
                <pre className="mt-2 rounded-lg border border-slate-800/60 bg-slate-950 p-2.5 text-[10px] text-slate-400 font-mono overflow-auto max-h-52">
{JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          )}

          {bulkResult && bulkMode && (
            <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Bulk Results</p>
              {bulkResult.results ? (
                <div className="rounded-lg border border-slate-800/60 overflow-hidden divide-y divide-slate-800/50">
                  {Object.entries(bulkResult.results).map(([key, val]: [string, any]) => (
                    <div key={key} className="flex items-center gap-2 bg-slate-900/40 px-3 py-2">
                      <code className="text-[11px] font-mono text-slate-300 w-40 truncate">{key}</code>
                      <span className="rounded-full bg-accent-900/30 px-2 py-0.5 text-[10px] font-mono text-accent-300">{String(val?.variant || val?.value || val)}</span>
                      {val?.reason && <span className="text-[10px] text-slate-500">{val.reason}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="rounded-lg border border-slate-800/60 bg-slate-950 p-2.5 text-[10px] text-slate-400 font-mono overflow-auto max-h-52">
{JSON.stringify(bulkResult, null, 2)}
                </pre>
              )}
            </div>
          )}

          {!result && !bulkResult && (
            <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 py-12 px-6 text-center flex flex-col items-center justify-center h-full min-h-[200px]">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-slate-800/60 bg-slate-900/50">
                <Gauge size={24} className="text-slate-500" weight="regular" />
              </div>
              <p className="text-sm font-medium text-slate-300">Select a flag and click Evaluate</p>
              <p className="mt-1.5 text-xs text-slate-500 max-w-xs">Configure a flag key and evaluation context on the left, then run the evaluation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Activity Log View ───────────────────────────────────────────────────────

function ActivityView({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [entries, setEntries] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const loadedRef = React.useRef(false);

  const loadActivity = React.useCallback(() => {
    setLoading(true);
    apiFetch(`${apiBaseUrl}/api/flags/activity`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => setEntries(d.entries || d.activity || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiBaseUrl]);

  React.useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadActivity();
    }
  }, [loadActivity]);

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Activity Log</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">Chronological feed of all flag changes</p>
        </div>
        <button onClick={loadActivity} disabled={loading} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
          {loading ? <Spinner /> : <ArrowsClockwise size={14} />} Refresh
        </button>
      </div>

      {error && <Banner message={error} type="error" onClose={() => setError("")} />}
      {loading && <p className="text-xs text-slate-400"><Spinner /> Loading...</p>}

      {!loading && entries.length === 0 && (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-6 text-center">
          <ClockCounterClockwise size={32} className="mx-auto mb-2 text-slate-600" />
          <p className="text-sm text-slate-400">No activity yet</p>
          <p className="text-[11px] text-slate-500 mt-1">Flag changes will appear here as they happen.</p>
        </div>
      )}

      <div className="space-y-1">
        {entries.map((entry: any, idx: number) => (
          <ActivityEntry key={entry.id || idx} entry={entry} />
        ))}
      </div>
    </div>
  );
}

// ─── Developer/SDK View ──────────────────────────────────────────────────────

function DeveloperView({ apiBaseUrl, editorTheme }: { apiBaseUrl: string; editorTheme: string }) {
  const baseUrl = apiBaseUrl || "http://localhost:8787";

  // Inline SDK snippets as fallback in case the API module doesn't exist yet
  const snippets = [
    {
      language: "JavaScript (Web)",
      install: "npm install @openfeature/web-sdk @openfeature/flagd-web-provider",
      code: `import { OpenFeature } from '@openfeature/web-sdk';
import { FlagdWebProvider } from '@openfeature/flagd-web-provider';

// Configure the provider
const provider = new FlagdWebProvider({
  host: '${baseUrl.replace(/^https?:\/\//, '')}',
  port: 8013,
  tls: ${baseUrl.startsWith('https') ? 'true' : 'false'},
});

// Register the provider
await OpenFeature.setProviderAndWait(provider);

// Get a client
const client = OpenFeature.getClient();

// Evaluate a boolean flag
const showFeature = await client.getBooleanValue('my-feature', false, {
  targetingKey: 'user-123',
  email: 'user@example.com',
});

console.log('Feature enabled:', showFeature);`,
    },
    {
      language: "Node.js (Server)",
      install: "npm install @openfeature/server-sdk @openfeature/flagd-provider",
      code: `import { OpenFeature } from '@openfeature/server-sdk';
import { FlagdProvider } from '@openfeature/flagd-provider';

// Configure flagd provider
const provider = new FlagdProvider({
  host: 'localhost',
  port: 8013,
  tls: false,
});

await OpenFeature.setProviderAndWait(provider);
const client = OpenFeature.getClient();

// Boolean evaluation
const enabled = await client.getBooleanValue('my-feature', false, {
  targetingKey: 'user-123',
});

// String evaluation
const variant = await client.getStringValue('theme', 'light', {
  targetingKey: 'user-123',
  plan: 'pro',
});

// Detailed evaluation with reason
const details = await client.getBooleanDetails('my-feature', false, {
  targetingKey: 'user-123',
});
console.log('Variant:', details.value, 'Reason:', details.reason);`,
    },
    {
      language: "React",
      install: "npm install @openfeature/react-sdk @openfeature/web-sdk @openfeature/flagd-web-provider",
      code: `import { OpenFeature, OpenFeatureProvider, useBooleanFlagValue, useStringFlagDetails } from '@openfeature/react-sdk';
import { FlagdWebProvider } from '@openfeature/flagd-web-provider';

// Initialize (do once, outside component)
OpenFeature.setProvider(new FlagdWebProvider({
  host: '${baseUrl.replace(/^https?:\/\//, '')}',
  port: 8013,
}));

// Wrap your app
function App() {
  return (
    <OpenFeatureProvider>
      <MyComponent />
    </OpenFeatureProvider>
  );
}

// Use flags in components
function MyComponent() {
  const showBanner = useBooleanFlagValue('show-banner', false);
  const { value: theme, reason } = useStringFlagDetails('ui-theme', 'light');

  return (
    <div data-theme={theme}>
      {showBanner && <Banner />}
      <p>Theme: {theme} (reason: {reason})</p>
    </div>
  );
}`,
    },
    {
      language: "Go",
      install: "go get github.com/open-feature/go-sdk\ngo get github.com/open-feature/go-sdk-contrib/providers/flagd",
      code: `package main

import (
    "context"
    "fmt"
    "log"

    "github.com/open-feature/go-sdk/openfeature"
    flagd "github.com/open-feature/go-sdk-contrib/providers/flagd/pkg"
)

func main() {
    provider := flagd.NewProvider(
        flagd.WithHost("localhost"),
        flagd.WithPort(8013),
    )

    openfeature.SetProvider(provider)
    client := openfeature.NewClient("my-app")

    ctx := context.Background()
    evalCtx := openfeature.NewEvaluationContext(
        "user-123",
        map[string]interface{}{
            "email": "user@example.com",
            "plan":  "pro",
        },
    )

    // Boolean evaluation
    enabled, err := client.BooleanValue(ctx, "my-feature", false, evalCtx)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("Feature enabled:", enabled)

    // String evaluation with details
    details, _ := client.StringValueDetails(ctx, "ui-theme", "light", evalCtx)
    fmt.Printf("Theme: %s (reason: %s)\\n", details.Value, details.Reason)
}`,
    },
    {
      language: "Python",
      install: "pip install openfeature-sdk openfeature-provider-flagd",
      code: `from openfeature import api
from openfeature.contrib.provider.flagd import FlagdProvider

# Configure the provider
provider = FlagdProvider(
    host="localhost",
    port=8013,
    tls=False,
)
api.set_provider(provider)

# Get a client
client = api.get_client()

# Boolean evaluation
enabled = client.get_boolean_value(
    flag_key="my-feature",
    default_value=False,
    evaluation_context={
        "targetingKey": "user-123",
        "email": "user@example.com",
        "plan": "pro",
    },
)
print(f"Feature enabled: {enabled}")

# Detailed evaluation
details = client.get_boolean_details(
    flag_key="my-feature",
    default_value=False,
    evaluation_context={"targetingKey": "user-123"},
)
print(f"Value: {details.value}, Reason: {details.reason}")`,
    },
    {
      language: "Java",
      install: "<!-- Maven -->\n<dependency>\n  <groupId>dev.openfeature</groupId>\n  <artifactId>sdk</artifactId>\n  <version>1.7.0</version>\n</dependency>\n<dependency>\n  <groupId>dev.openfeature.contrib.providers</groupId>\n  <artifactId>flagd</artifactId>\n  <version>0.7.0</version>\n</dependency>",
      code: `import dev.openfeature.sdk.*;
import dev.openfeature.contrib.providers.flagd.FlagdProvider;
import dev.openfeature.contrib.providers.flagd.FlagdOptions;

public class FeatureFlags {
    public static void main(String[] args) {
        // Configure flagd provider
        FlagdProvider provider = new FlagdProvider(
            FlagdOptions.builder()
                .host("localhost")
                .port(8013)
                .build()
        );

        OpenFeatureAPI api = OpenFeatureAPI.getInstance();
        api.setProviderAndWait(provider);

        Client client = api.getClient();

        // Set evaluation context
        MutableContext ctx = new MutableContext("user-123");
        ctx.add("email", "user@example.com");
        ctx.add("plan", "pro");

        // Boolean evaluation
        boolean enabled = client.getBooleanValue("my-feature", false, ctx);
        System.out.println("Feature enabled: " + enabled);

        // Detailed evaluation
        FlagEvaluationDetails<Boolean> details =
            client.getBooleanDetails("my-feature", false, ctx);
        System.out.printf("Value: %s, Reason: %s%n",
            details.getValue(), details.getReason());
    }
}`,
    },
  ];

  const [activeTab, setActiveTab] = React.useState(0);
  const current = snippets[activeTab];

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4" style={{ maxWidth: 1200 }}>
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Developer SDK</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">OpenFeature SDK integration snippets for flagd</p>
      </div>

      {/* Language tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-800">
        {snippets.map((s, i) => (
          <button
            key={s.language}
            onClick={() => setActiveTab(i)}
            className={`px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${activeTab === i ? "border-accent-500 text-accent-300" : "border-transparent text-slate-500 hover:text-slate-300"}`}
          >
            {s.language}
          </button>
        ))}
      </div>

      {current && (
        <div className="space-y-4">
          {/* Install command */}
          <div className="rounded border border-slate-800 bg-slate-900/40 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Install</p>
              <button onClick={() => copyToClipboard(current.install)} className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1">
                <Copy size={11} weight="regular" /> Copy
              </button>
            </div>
            <pre className="rounded bg-slate-950 p-2 text-[11px] text-slate-300 font-mono overflow-auto whitespace-pre-wrap">{current.install}</pre>
          </div>

          {/* Code snippet */}
          <div className="rounded border border-slate-800 bg-slate-900/40 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Usage</p>
              <button onClick={() => copyToClipboard(current.code)} className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1">
                <Copy size={11} weight="regular" /> Copy
              </button>
            </div>
            <pre className="rounded bg-slate-950 p-2 text-[11px] text-slate-300 font-mono overflow-auto whitespace-pre-wrap max-h-[500px]">{current.code}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Flag List View ──────────────────────────────────────────────────────────

function FlagListView({
  apiBaseUrl,
  onSelectFlag,
  onCreateFlag,
}: {
  apiBaseUrl: string;
  onSelectFlag: (flag: any) => void;
  onCreateFlag: () => void;
}) {
  const [flags, setFlags] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [stateFilter, setStateFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const loadedRef = React.useRef(false);

  const loadFlags = React.useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (stateFilter !== "all") params.set("state", stateFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (search) params.set("search", search);
    const qs = params.toString();
    apiFetch(`${apiBaseUrl}/api/flags${qs ? `?${qs}` : ""}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => setFlags(d.flags || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiBaseUrl, stateFilter, typeFilter, search]);

  React.useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadFlags();
    }
  }, [loadFlags]);

  // Reload when filters change (after initial load)
  const filtersChangedRef = React.useRef(false);
  React.useEffect(() => {
    if (filtersChangedRef.current) {
      loadFlags();
    }
    filtersChangedRef.current = true;
  }, [stateFilter, typeFilter]);

  const toggleFlag = (flagKey: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Optimistic: flip instantly in UI
    setFlags(prev => prev.map(f => f.key === flagKey ? { ...f, state: f.state === "ENABLED" ? "DISABLED" : "ENABLED" } : f));
    apiFetch(`${apiBaseUrl}/api/flags/${flagKey}/toggle`, { method: "PATCH" })
      .then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.error || `HTTP ${r.status}`); });
        // Sync with server state
        loadFlags();
      })
      .catch(err => {
        // Revert on failure
        setFlags(prev => prev.map(f => f.key === flagKey ? { ...f, state: f.state === "ENABLED" ? "DISABLED" : "ENABLED" } : f));
        setError(err.message);
      });
  };

  const doSearch = () => {
    loadFlags();
  };

  const enabledCount = flags.filter((f: any) => f.state === "ENABLED").length;

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-100">Feature Flags</h2>
          {flags.length > 0 && (
            <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${enabledCount > 0 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${enabledCount > 0 ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
              {enabledCount} Enabled
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={loadFlags} disabled={loading} className="truss-btn border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg px-3 py-1.5 text-xs disabled:opacity-50">
            {loading ? <Spinner /> : <ArrowsClockwise size={14} />} Refresh
          </button>
          <button onClick={onCreateFlag} className="truss-btn bg-accent-500 hover:bg-accent-400 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors">
            <Plus size={14} weight="regular" /> Create Flag
          </button>
        </div>
      </div>

      {error && <Banner message={error} type="error" onClose={() => setError("")} />}

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") doSearch(); }}
            placeholder="Search flags..."
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400"
          />
        </div>
        <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200 focus:outline-none">
          <option value="all">All States</option>
          <option value="ENABLED">Enabled</option>
          <option value="DISABLED">Disabled</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200 focus:outline-none">
          <option value="all">All Types</option>
          <option value="boolean">Boolean</option>
          <option value="string">String</option>
          <option value="number">Number</option>
          <option value="object">Object</option>
        </select>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800/50 bg-slate-900/30 p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500 font-medium"><Flag size={14} weight="regular" /> Total</div>
          <p className="mt-1.5 text-lg font-semibold text-slate-100">{flags.length}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Feature flags</p>
        </div>
        <div className="rounded-lg border border-slate-800/50 bg-slate-900/30 p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500 font-medium"><CheckCircle size={14} weight="regular" /> Enabled</div>
          <p className={`mt-1.5 text-lg font-semibold ${enabledCount > 0 ? "text-emerald-400" : "text-slate-100"}`}>{enabledCount}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Currently active</p>
        </div>
        <div className="rounded-lg border border-slate-800/50 bg-slate-900/30 p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500 font-medium"><SlidersHorizontal size={14} weight="regular" /> Types</div>
          <p className="mt-1.5 text-lg font-semibold text-slate-100">{new Set(flags.map((f: any) => f.type)).size}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Distinct flag types</p>
        </div>
      </div>

      {/* Flag list */}
      {loading && flags.length === 0 && <p className="text-xs text-slate-400"><Spinner /> Loading flags...</p>}

      {!loading && flags.length === 0 && (
        <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 py-12 px-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-slate-800/60 bg-slate-900/50">
            <FlagBanner size={28} className="text-slate-500" weight="regular" />
          </div>
          <p className="text-sm font-medium text-slate-200">No flags yet</p>
          <p className="mt-1.5 text-xs text-slate-500 max-w-xs mx-auto">Create your first feature flag to start controlling features across environments.</p>
          <button onClick={onCreateFlag} className="mt-4 bg-accent-500 hover:bg-accent-400 text-white rounded-lg px-4 py-2 text-xs font-medium transition-colors">
            <span className="flex items-center justify-center gap-1.5"><Plus size={14} weight="regular" /> Create Your First Flag</span>
          </button>
        </div>
      )}

      {flags.length > 0 && (
        <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 overflow-hidden divide-y divide-slate-800/50">
          {flags.map((flag: any) => {
            const isEnabled = flag.state === "ENABLED";
            return (
              <div
                key={flag.key}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/20 transition-colors group"
              >
                <ToggleSwitch size="sm" enabled={isEnabled} onChange={() => toggleFlag(flag.key)} />
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelectFlag(flag)}>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-slate-200 truncate">{flag.key}</code>
                    <TypeBadge type={flag.type || "boolean"} />
                    {(flag.tags || []).map((t: string) => (
                      <span key={t} className="rounded-full border border-slate-700 bg-slate-800 px-1.5 py-0 text-[9px] text-slate-400">{t}</span>
                    ))}
                  </div>
                  {flag.name && flag.name !== flag.key && (
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{flag.name}</p>
                  )}
                </div>
                <EnvDots environments={flag.environments} />
                <button
                  onClick={() => onSelectFlag(flag)}
                  className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-1 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  Configure
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Main Panel Export
// ═════════════════════════════════════════════════════════════════════════════

function FlagsMainInner({ apiBaseUrl, flagsView, setFlagsView, editorTheme }: {
  apiBaseUrl: string; flagsView: string; setFlagsView: (v: string) => void; editorTheme: string;
}) {
  const [selectedFlag, setSelectedFlag] = React.useState<any>(null);
  const [creating, setCreating] = React.useState(false);
  const [reloadTrigger, setReloadTrigger] = React.useState(0);

  const triggerReload = () => setReloadTrigger(n => n + 1);

  // Create flag view
  if (creating || flagsView === "create") {
    return (
      <CreateFlagView
        apiBaseUrl={apiBaseUrl}
        onBack={() => { setCreating(false); if (flagsView === "create") setFlagsView("list"); }}
        onCreated={triggerReload}
      />
    );
  }

  // Flag detail view
  if (flagsView === "detail" && selectedFlag) {
    return (
      <FlagDetailView
        flag={selectedFlag}
        apiBaseUrl={apiBaseUrl}
        onBack={() => { setSelectedFlag(null); setFlagsView("list"); }}
        onReload={triggerReload}
      />
    );
  }

  // Segments view
  if (flagsView === "segments") {
    return <SegmentsView apiBaseUrl={apiBaseUrl} />;
  }

  // Playground view
  if (flagsView === "playground") {
    return <PlaygroundView apiBaseUrl={apiBaseUrl} />;
  }

  // Activity view
  if (flagsView === "activity") {
    return <ActivityView apiBaseUrl={apiBaseUrl} />;
  }

  // Developer view
  if (flagsView === "developer") {
    return <DeveloperView apiBaseUrl={apiBaseUrl} editorTheme={editorTheme} />;
  }

  // Default: flag list
  return (
    <FlagListView
      key={reloadTrigger}
      apiBaseUrl={apiBaseUrl}
      onSelectFlag={(flag: any) => { setSelectedFlag(flag); setFlagsView("detail"); }}
      onCreateFlag={() => setCreating(true)}
    />
  );
}

export function renderFlagsMain(s: any): React.JSX.Element | null {
  if (s.primaryNav !== "flags") return null;
  return <FlagsMainInner apiBaseUrl={s.apiBaseUrl} flagsView={s.flagsView} setFlagsView={s.setFlagsView} editorTheme={s.editorTheme} />;
}

// ═════════════════════════════════════════════════════════════════════════════
// PaneB (Left sidebar navigation)
// ═════════════════════════════════════════════════════════════════════════════

function FlagdStatusIndicator({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [status, setStatus] = React.useState<"connected" | "disconnected" | "loading">("loading");
  const loadedRef = React.useRef(false);

  React.useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      apiFetch(`${apiBaseUrl}/api/flags/status`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error("err")))
        .then(d => setStatus(d.connected ? "connected" : "disconnected"))
        .catch(() => setStatus("disconnected"));
    }
  }, [apiBaseUrl]);

  return (
    <div className="mt-auto rounded border border-slate-800 bg-slate-900/40 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${status === "connected" ? "bg-emerald-400 animate-pulse" : status === "loading" ? "bg-amber-400" : "bg-red-400"}`} />
        <span className="text-[10px] text-slate-400">
          flagd {status === "connected" ? "Connected" : status === "loading" ? "Checking..." : "Disconnected"}
        </span>
      </div>
    </div>
  );
}

export function renderFlagsPaneB(s: any): React.JSX.Element | null {
  if (s.primaryNav !== "flags") return null;
  const { flagsView, setFlagsView, apiBaseUrl } = s;

  const navItems: Array<{ view: string; label: string; icon: React.ReactNode; matches?: string[] }> = [
    { view: "list", label: "Flags", icon: <ListBullets size={18} weight="regular" />, matches: ["list", "detail", "create"] },
    { view: "segments", label: "Segments", icon: <UsersThree size={18} weight="regular" /> },
    { view: "playground", label: "Playground", icon: <Play size={18} weight="regular" /> },
    { view: "activity", label: "Activity", icon: <ClockCounterClockwise size={18} weight="regular" /> },
    { view: "developer", label: "Developer", icon: <Code size={18} weight="regular" /> },
  ];

  return (
    <div className="flex flex-col h-full space-y-2">
      {navItems.map(item => {
        const isActive = item.matches ? item.matches.includes(flagsView) : flagsView === item.view;
        return (
          <button
            key={item.view}
            onClick={() => setFlagsView(item.view)}
            className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${isActive ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900"}`}
          >
            <span className="inline-flex items-center gap-1.5">{item.icon}{item.label}</span>
          </button>
        );
      })}
      <div className="flex-1" />
    </div>
  );
}
