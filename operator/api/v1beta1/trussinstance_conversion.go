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
	"sigs.k8s.io/controller-runtime/pkg/conversion"

	v1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

// v1beta1 is a conversion spoke: it converts to and from the v1alpha1 hub.
var _ conversion.Convertible = &TrussInstance{}

// ConvertTo converts this v1beta1 TrussInstance to the hub version (v1alpha1).
// The only schema delta is spec.host (v1beta1) <-> spec.publicURL (v1alpha1);
// every other nested type is structurally identical, so leaf structs convert
// with a direct Go struct conversion and only the containers need a literal.
func (src *TrussInstance) ConvertTo(dstRaw conversion.Hub) error {
	dst := dstRaw.(*v1alpha1.TrussInstance)

	dst.ObjectMeta = src.ObjectMeta

	s := &src.Spec
	dst.Spec = v1alpha1.TrussInstanceSpec{
		Version:   s.Version,
		PublicURL: s.Host, // the rename: host -> publicURL
		Components: v1alpha1.Components{
			API:       v1alpha1.ComponentSpec(s.Components.API),
			Dashboard: v1alpha1.ComponentSpec(s.Components.Dashboard),
		},
		Dependencies: v1alpha1.Dependencies{
			Postgres: v1alpha1.DepSpec(s.Dependencies.Postgres),
			Ory: v1alpha1.OryDeps{
				Mode:      s.Dependencies.Ory.Mode,
				Endpoints: v1alpha1.OryEndpoints(s.Dependencies.Ory.Endpoints),
			},
			Storage: v1alpha1.DepSpec(s.Dependencies.Storage),
			Cache:   v1alpha1.DepSpec(s.Dependencies.Cache),
			Flags:   v1alpha1.DepSpec(s.Dependencies.Flags),
		},
		Scaling: v1alpha1.Scaling(s.Scaling),
		Resilience: v1alpha1.Resilience{
			PDB:            v1alpha1.PDBSpec(s.Resilience.PDB),
			TopologySpread: s.Resilience.TopologySpread,
		},
		Ingress:       v1alpha1.IngressSpec(s.Ingress),
		Observability: v1alpha1.ObservabilitySpec(s.Observability),
		Backup:        v1alpha1.BackupSpec(s.Backup),
	}

	dst.Status = v1alpha1.TrussInstanceStatus{
		Conditions:         src.Status.Conditions,
		ObservedGeneration: src.Status.ObservedGeneration,
		Phase:              src.Status.Phase,
		ComponentStatus: v1alpha1.ComponentStatuses{
			API:       v1alpha1.ComponentStatus(src.Status.ComponentStatus.API),
			Dashboard: v1alpha1.ComponentStatus(src.Status.ComponentStatus.Dashboard),
		},
	}
	return nil
}

// ConvertFrom converts the hub version (v1alpha1) into this v1beta1.
func (dst *TrussInstance) ConvertFrom(srcRaw conversion.Hub) error {
	src := srcRaw.(*v1alpha1.TrussInstance)

	dst.ObjectMeta = src.ObjectMeta

	s := &src.Spec
	dst.Spec = TrussInstanceSpec{
		Version: s.Version,
		Host:    s.PublicURL, // the rename: publicURL -> host
		Components: Components{
			API:       ComponentSpec(s.Components.API),
			Dashboard: ComponentSpec(s.Components.Dashboard),
		},
		Dependencies: Dependencies{
			Postgres: DepSpec(s.Dependencies.Postgres),
			Ory: OryDeps{
				Mode:      s.Dependencies.Ory.Mode,
				Endpoints: OryEndpoints(s.Dependencies.Ory.Endpoints),
			},
			Storage: DepSpec(s.Dependencies.Storage),
			Cache:   DepSpec(s.Dependencies.Cache),
			Flags:   DepSpec(s.Dependencies.Flags),
		},
		Scaling: Scaling(s.Scaling),
		Resilience: Resilience{
			PDB:            PDBSpec(s.Resilience.PDB),
			TopologySpread: s.Resilience.TopologySpread,
		},
		Ingress:       IngressSpec(s.Ingress),
		Observability: ObservabilitySpec(s.Observability),
		Backup:        BackupSpec(s.Backup),
	}

	dst.Status = TrussInstanceStatus{
		Conditions:         src.Status.Conditions,
		ObservedGeneration: src.Status.ObservedGeneration,
		Phase:              src.Status.Phase,
		ComponentStatus: ComponentStatuses{
			API:       ComponentStatus(src.Status.ComponentStatus.API),
			Dashboard: ComponentStatus(src.Status.ComponentStatus.Dashboard),
		},
	}
	return nil
}
