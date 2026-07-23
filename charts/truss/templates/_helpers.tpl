{{/*
Resolve a secret value with three-tier precedence, so a bare `helm install` just works and
`helm upgrade` never rotates a live secret:
  1. explicit override (.v from values) — the operator set it deliberately
  2. the value already stored in the cluster (.d = existing Secret's .data, base64) — keep it
     stable across upgrades (rotating encryption-key would orphan encrypted data)
  3. a fresh random string of length .n — first install with nothing provided

Note: `lookup` returns nothing during `helm template`/`--dry-run` (no cluster), so those render a
throwaway random value; only real install/upgrade against a cluster benefits from tier 2.
*/}}
{{- define "truss.secret" -}}
{{- if .v -}}
{{- .v -}}
{{- else if hasKey .d .k -}}
{{- index .d .k | b64dec -}}
{{- else -}}
{{- randAlphaNum (int .n) -}}
{{- end -}}
{{- end -}}
