/*
Copyright 2026.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package v1alpha1

import (
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/util/intstr"
)

// NOTE: json tags are required. Any new fields must have json tags to serialize.
// Run "make manifests generate" after editing this file.

// TrussInstanceSpec defines the desired state of a Truss deployment.
//
// +kubebuilder:validation:XValidation:rule="!has(self.ingress) || !has(self.ingress.enabled) || !self.ingress.enabled || (has(self.publicURL) && size(self.publicURL) > 0)",message="ingress.enabled requires publicURL to be set"
type TrussInstanceSpec struct {
	// version is the image tag for the truss-api and dashboard images
	// (e.g. "0.2.0" or "latest").
	// +kubebuilder:default="latest"
	// +optional
	Version string `json:"version,omitempty"`

	// publicURL is the browser-facing URL of the dashboard. It drives the
	// Ingress host, the session-cookie Secure flag, and the API CORS config.
	// +optional
	PublicURL string `json:"publicURL,omitempty"`

	// components configures the Truss application tier (api + dashboard).
	// +optional
	Components Components `json:"components,omitempty"`

	// dependencies wires Truss to its backing services. In v1 every dependency
	// is "bring your own" (an existing Secret/endpoint); operator-managed
	// dependencies (CloudNativePG, MinIO operator) are a later phase.
	// +optional
	Dependencies Dependencies `json:"dependencies,omitempty"`

	// scaling selects a resource profile for the app tier.
	// +optional
	Scaling Scaling `json:"scaling,omitempty"`

	// resilience configures PodDisruptionBudgets and topology spread.
	// +optional
	Resilience Resilience `json:"resilience,omitempty"`

	// ingress configures an Ingress fronting the dashboard and API.
	// +optional
	Ingress IngressSpec `json:"ingress,omitempty"`

	// observability wires the deployed instance for metrics/traces/logs.
	// +optional
	Observability ObservabilitySpec `json:"observability,omitempty"`
}

// ObservabilitySpec controls how the operator makes the deployed Truss observable.
type ObservabilitySpec struct {
	// otlpEndpoint, when set, points the app's OpenTelemetry export at a collector
	// (e.g. http://otel-collector:4318), activating traces + OTLP metric/log push.
	// Empty means the app still exposes /metrics and stdout logs, but pushes nothing.
	// +optional
	OTLPEndpoint string `json:"otlpEndpoint,omitempty"`

	// serviceMonitor creates a Prometheus-operator ServiceMonitor scraping the api
	// /metrics endpoint. Requires the Prometheus operator CRDs in the cluster.
	// +optional
	ServiceMonitor bool `json:"serviceMonitor,omitempty"`

	// prometheusRule creates multi-window burn-rate SLO alerts for the api. Requires
	// the Prometheus operator CRDs.
	// +optional
	PrometheusRule bool `json:"prometheusRule,omitempty"`
}

// Components configures the Truss application tier.
type Components struct {
	// api is the Truss backend API.
	// +optional
	API ComponentSpec `json:"api,omitempty"`

	// dashboard is the Truss console SPA.
	// +optional
	Dashboard ComponentSpec `json:"dashboard,omitempty"`
}

// ComponentSpec is the per-component knob set for a Truss workload.
type ComponentSpec struct {
	// replicas is the desired pod count for this component.
	// +kubebuilder:default=1
	// +kubebuilder:validation:Minimum=0
	// +optional
	Replicas int32 `json:"replicas,omitempty"`

	// resources overrides the container resource requests/limits derived from
	// the scaling profile.
	// +optional
	Resources *corev1.ResourceRequirements `json:"resources,omitempty"`

	// podTemplate is a strategic-merge patch applied over the operator-generated
	// pod template spec. Escape hatch for arbitrary pod customization
	// (nodeSelector, tolerations, sidecars, extra volumes) without forking.
	// +optional
	// +kubebuilder:pruning:PreserveUnknownFields
	PodTemplate *runtime.RawExtension `json:"podTemplate,omitempty"`
}

// DepSpec is a bring-your-own or operator-managed dependency reference.
//
// +kubebuilder:validation:XValidation:rule="!has(self.mode) || self.mode != 'byo' || (has(self.existingSecret) && size(self.existingSecret) > 0)",message="mode 'byo' requires existingSecret"
type DepSpec struct {
	// mode selects whether Truss consumes an existing dependency ("byo") or the
	// operator provisions one ("managed"). v1 supports "byo".
	// +kubebuilder:validation:Enum=byo;managed
	// +optional
	Mode string `json:"mode,omitempty"`

	// existingSecret names a Secret in the same namespace holding the
	// connection details for this dependency.
	// +optional
	ExistingSecret string `json:"existingSecret,omitempty"`
}

// OryEndpoints holds the base URLs of the Ory stack services.
type OryEndpoints struct {
	// +optional
	Kratos string `json:"kratos,omitempty"`
	// +optional
	Keto string `json:"keto,omitempty"`
	// +optional
	Hydra string `json:"hydra,omitempty"`
	// +optional
	Oathkeeper string `json:"oathkeeper,omitempty"`
}

// OryDeps configures the Ory identity stack. v1 is bring-your-own only
// (no upstream Ory operator exists).
type OryDeps struct {
	// +kubebuilder:validation:Enum=byo
	// +optional
	Mode string `json:"mode,omitempty"`

	// endpoints are the base URLs the API uses to reach the Ory services.
	// +optional
	Endpoints OryEndpoints `json:"endpoints,omitempty"`
}

// Dependencies wires Truss to its backing services.
type Dependencies struct {
	// postgres is the system-of-record database (connection string under key
	// "database-url" in the referenced Secret).
	// +optional
	Postgres DepSpec `json:"postgres,omitempty"`

	// ory is the identity/authz/oauth2/gateway stack.
	// +optional
	Ory OryDeps `json:"ory,omitempty"`

	// storage is the S3-compatible object store (MinIO).
	// +optional
	Storage DepSpec `json:"storage,omitempty"`

	// cache is the Valkey/Redis cache + KV store.
	// +optional
	Cache DepSpec `json:"cache,omitempty"`

	// flags is the flagd/OpenFeature feature-flag backend.
	// +optional
	Flags DepSpec `json:"flags,omitempty"`
}

// Scaling selects a resource profile for the app tier.
type Scaling struct {
	// profile picks a preset of resource requests/limits: small (dev),
	// medium, or large (high-traffic).
	// +kubebuilder:validation:Enum=small;medium;large
	// +kubebuilder:default=small
	// +optional
	Profile string `json:"profile,omitempty"`
}

// PDBSpec configures a PodDisruptionBudget for the app tier.
type PDBSpec struct {
	// +optional
	Enabled bool `json:"enabled,omitempty"`

	// minAvailable is the minimum number of pods that must stay available
	// during voluntary disruptions. Defaults to 1 when the PDB is enabled.
	// +optional
	MinAvailable *intstr.IntOrString `json:"minAvailable,omitempty"`
}

// Resilience configures high-availability guardrails.
type Resilience struct {
	// pdb configures a PodDisruptionBudget per component.
	// +optional
	PDB PDBSpec `json:"pdb,omitempty"`

	// topologySpread adds zone/host topology-spread constraints and soft
	// pod anti-affinity to the app-tier pods.
	// +optional
	TopologySpread bool `json:"topologySpread,omitempty"`
}

// IngressSpec configures an Ingress fronting Truss.
type IngressSpec struct {
	// +optional
	Enabled bool `json:"enabled,omitempty"`

	// className selects the IngressClass. nil uses the cluster default.
	// +optional
	ClassName *string `json:"className,omitempty"`

	// annotations are added to the generated Ingress (e.g. cert-manager,
	// nginx rewrite rules).
	// +optional
	Annotations map[string]string `json:"annotations,omitempty"`

	// tls enables TLS on the Ingress using the publicURL host.
	// +optional
	TLS bool `json:"tls,omitempty"`
}

// ComponentStatus reports observed readiness for one component.
type ComponentStatus struct {
	// +optional
	Ready int32 `json:"ready"`
	// +optional
	Desired int32 `json:"desired"`
}

// ComponentStatuses aggregates per-component readiness.
type ComponentStatuses struct {
	// +optional
	API ComponentStatus `json:"api,omitempty"`
	// +optional
	Dashboard ComponentStatus `json:"dashboard,omitempty"`
}

// TrussInstanceStatus defines the observed state of TrussInstance.
type TrussInstanceStatus struct {
	// conditions represent the current state of the TrussInstance.
	// Types: "Ready", "Progressing", "DependenciesReady", "Degraded".
	// +listType=map
	// +listMapKey=type
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`

	// observedGeneration is the .metadata.generation the controller last acted on.
	// +optional
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`

	// phase is a coarse lifecycle summary for humans / kubectl columns.
	// +kubebuilder:validation:Enum=Pending;Provisioning;Ready;Degraded
	// +optional
	Phase string `json:"phase,omitempty"`

	// componentStatus reports per-component readiness.
	// +optional
	ComponentStatus ComponentStatuses `json:"componentStatus,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Version",type=string,JSONPath=`.spec.version`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// TrussInstance is the Schema for the trussinstances API
type TrussInstance struct {
	metav1.TypeMeta `json:",inline"`

	// metadata is a standard object metadata
	// +optional
	metav1.ObjectMeta `json:"metadata,omitzero"`

	// spec defines the desired state of TrussInstance
	// +required
	Spec TrussInstanceSpec `json:"spec"`

	// status defines the observed state of TrussInstance
	// +optional
	Status TrussInstanceStatus `json:"status,omitzero"`
}

// +kubebuilder:object:root=true

// TrussInstanceList contains a list of TrussInstance
type TrussInstanceList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitzero"`
	Items           []TrussInstance `json:"items"`
}

func init() {
	SchemeBuilder.Register(func(s *runtime.Scheme) error {
		s.AddKnownTypes(SchemeGroupVersion, &TrussInstance{}, &TrussInstanceList{})
		return nil
	})
}
