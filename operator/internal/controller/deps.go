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

package controller

import (
	"context"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"sigs.k8s.io/controller-runtime/pkg/client"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

// depResult reports whether the instance's configured dependencies are satisfied.
type depResult struct {
	ready  bool
	reason string
	msg    string
}

// resolveDeps verifies every configured bring-your-own dependency is present
// before the app tier is rolled out. This is the reconcile-ordering seam: the
// controller gates on dependency readiness so the app never starts against a
// missing database or secret.
//
// v1 checks referenced Secrets exist (and Postgres carries a "database-url" key).
// A dependency left unset (empty mode) is "not managed here" and is skipped.
// Managed mode (operator-provisioned CNPG/MinIO) is a later phase.
func (r *TrussInstanceReconciler) resolveDeps(ctx context.Context, ti *appsv1alpha1.TrussInstance) (depResult, error) {
	// Postgres is the system-of-record: if referenced, its Secret must carry database-url.
	if pg := ti.Spec.Dependencies.Postgres; pg.Mode == "byo" && pg.ExistingSecret != "" {
		sec := &corev1.Secret{}
		err := r.Get(ctx, client.ObjectKey{Namespace: ti.Namespace, Name: pg.ExistingSecret}, sec)
		if apierrors.IsNotFound(err) {
			return depResult{reason: "PostgresSecretMissing", msg: "Secret " + pg.ExistingSecret + " not found"}, nil
		}
		if err != nil {
			return depResult{}, err
		}
		if _, ok := sec.Data["database-url"]; !ok {
			return depResult{reason: "PostgresSecretInvalid", msg: "Secret " + pg.ExistingSecret + " missing key database-url"}, nil
		}
	}

	// Storage / cache / flags: verify the referenced Secret exists (contents are app-specific).
	others := []struct {
		name string
		dep  appsv1alpha1.DepSpec
	}{
		{"storage", ti.Spec.Dependencies.Storage},
		{"cache", ti.Spec.Dependencies.Cache},
		{"flags", ti.Spec.Dependencies.Flags},
	}
	for _, o := range others {
		if o.dep.Mode == "byo" && o.dep.ExistingSecret != "" {
			err := r.Get(ctx, client.ObjectKey{Namespace: ti.Namespace, Name: o.dep.ExistingSecret}, &corev1.Secret{})
			if apierrors.IsNotFound(err) {
				return depResult{reason: "DependencySecretMissing", msg: o.name + " Secret " + o.dep.ExistingSecret + " not found"}, nil
			}
			if err != nil {
				return depResult{}, err
			}
		}
	}

	return depResult{ready: true, reason: "AllDependenciesReady", msg: "all configured dependencies resolved"}, nil
}
