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

package v1beta1

import (
	"reflect"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/util/intstr"

	v1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

// fullyPopulated builds a v1beta1 TrussInstance with every field set (including
// pointers, slices, and maps) so a dropped field shows up as an inequality.
func fullyPopulated() *TrussInstance {
	className := "nginx"
	minAvail := intstr.FromInt32(2)
	return &TrussInstance{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "demo",
			Namespace: "apps",
			Labels:    map[string]string{"team": "platform"},
		},
		Spec: TrussInstanceSpec{
			Version: "0.2.0",
			Host:    "truss.example.com",
			Components: Components{
				API: ComponentSpec{
					Replicas: 3,
					Resources: &corev1.ResourceRequirements{
						Requests: corev1.ResourceList{corev1.ResourceCPU: resource.MustParse("250m")},
					},
					PodTemplate: &runtime.RawExtension{Raw: []byte(`{"spec":{"nodeName":"n1"}}`)},
				},
				Dashboard: ComponentSpec{Replicas: 2},
			},
			Dependencies: Dependencies{
				Postgres: DepSpec{Mode: "managed"},
				Ory: OryDeps{
					Mode:      "byo",
					Endpoints: OryEndpoints{Kratos: "http://kratos", Keto: "http://keto", Hydra: "http://hydra", Oathkeeper: "http://oath"},
				},
				Storage: DepSpec{Mode: "byo", ExistingSecret: "store"},
				Cache:   DepSpec{Mode: "managed"},
				Flags:   DepSpec{Mode: "managed"},
			},
			Scaling: Scaling{Profile: "large"},
			Resilience: Resilience{
				PDB:            PDBSpec{Enabled: true, MinAvailable: &minAvail},
				TopologySpread: true,
			},
			Ingress: IngressSpec{
				Enabled:     true,
				ClassName:   &className,
				Annotations: map[string]string{"cert-manager.io/cluster-issuer": "le"},
				TLS:         true,
			},
			Observability: ObservabilitySpec{OTLPEndpoint: "http://otel:4318", ServiceMonitor: true, PrometheusRule: true},
			Backup:        BackupSpec{Enabled: true, Schedule: "0 0 2 * * *", RetentionPolicy: "30d", DestinationPath: "s3://b/truss", EndpointURL: "http://rustfs", ExistingSecret: "store-creds"},
		},
		Status: TrussInstanceStatus{
			Conditions:         []metav1.Condition{{Type: "Ready", Status: metav1.ConditionTrue, Reason: "AllGood", LastTransitionTime: metav1.Now()}},
			ObservedGeneration: 7,
			Phase:              "Ready",
			ComponentStatus: ComponentStatuses{
				API:       ComponentStatus{Ready: 3, Desired: 3},
				Dashboard: ComponentStatus{Ready: 2, Desired: 2},
			},
		},
	}
}

// TestRoundTrip converts v1beta1 -> hub(v1alpha1) -> v1beta1 and asserts the
// result equals the original. A field missing from either direction fails here.
func TestRoundTrip(t *testing.T) {
	orig := fullyPopulated()

	hub := &v1alpha1.TrussInstance{}
	if err := orig.ConvertTo(hub); err != nil {
		t.Fatalf("ConvertTo: %v", err)
	}
	got := &TrussInstance{}
	if err := got.ConvertFrom(hub); err != nil {
		t.Fatalf("ConvertFrom: %v", err)
	}

	if !reflect.DeepEqual(orig, got) {
		t.Errorf("round-trip mismatch:\n orig = %#v\n got  = %#v", orig, got)
	}
}

// TestRenameMapping pins the one real schema delta in both directions.
func TestRenameMapping(t *testing.T) {
	// host -> publicURL
	beta := &TrussInstance{Spec: TrussInstanceSpec{Host: "h.example.com"}}
	hub := &v1alpha1.TrussInstance{}
	if err := beta.ConvertTo(hub); err != nil {
		t.Fatalf("ConvertTo: %v", err)
	}
	if hub.Spec.PublicURL != "h.example.com" {
		t.Errorf("host did not map to publicURL: got %q", hub.Spec.PublicURL)
	}

	// publicURL -> host
	hub2 := &v1alpha1.TrussInstance{Spec: v1alpha1.TrussInstanceSpec{PublicURL: "p.example.com"}}
	beta2 := &TrussInstance{}
	if err := beta2.ConvertFrom(hub2); err != nil {
		t.Fatalf("ConvertFrom: %v", err)
	}
	if beta2.Spec.Host != "p.example.com" {
		t.Errorf("publicURL did not map to host: got %q", beta2.Spec.Host)
	}
}
