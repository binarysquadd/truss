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
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"testing"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

// Plain unit tests for the managed-Postgres helpers: pure functions that need no
// API server, so they run without the envtest harness.

func newTI(name string, pg appsv1alpha1.DepSpec, profile string) *appsv1alpha1.TrussInstance {
	return &appsv1alpha1.TrussInstance{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
		Spec: appsv1alpha1.TrussInstanceSpec{
			Scaling:      appsv1alpha1.Scaling{Profile: profile},
			Dependencies: appsv1alpha1.Dependencies{Postgres: pg},
		},
	}
}

func TestManagedNames(t *testing.T) {
	ti := newTI("db-names", appsv1alpha1.DepSpec{Mode: "managed"}, "")
	if got := cnpgClusterName(ti); got != "db-names-pg" {
		t.Errorf("cnpgClusterName = %q, want db-names-pg", got)
	}
	if got := cnpgAppSecretName(ti); got != "db-names-pg-app" {
		t.Errorf("cnpgAppSecretName = %q, want db-names-pg-app", got)
	}
}

func TestPgSecretRef(t *testing.T) {
	tests := []struct {
		name          string
		pg            appsv1alpha1.DepSpec
		wantOK        bool
		wantName, key string
	}{
		{"managed targets the -app secret uri", appsv1alpha1.DepSpec{Mode: "managed"}, true, "x-pg-app", "uri"},
		{"byo targets the user secret database-url", appsv1alpha1.DepSpec{Mode: "byo", ExistingSecret: "my-db"}, true, "my-db", "database-url"},
		{"byo without a secret is not wired", appsv1alpha1.DepSpec{Mode: "byo"}, false, "", ""},
		{"unset is not wired", appsv1alpha1.DepSpec{}, false, "", ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ti := newTI("x", tc.pg, "")
			name, key, ok := pgSecretRef(ti)
			if ok != tc.wantOK || name != tc.wantName || key != tc.key {
				t.Errorf("pgSecretRef = (%q,%q,%v), want (%q,%q,%v)", name, key, ok, tc.wantName, tc.key, tc.wantOK)
			}
		})
	}
}

func TestManagedPGShape(t *testing.T) {
	tests := []struct {
		profile       string
		wantInstances int64
		wantStorage   string
	}{
		{"large", 3, "50Gi"},
		{"medium", 3, "10Gi"},
		{"small", 1, "2Gi"},
		{"", 1, "2Gi"}, // unset defaults to the dev shape
	}
	for _, tc := range tests {
		t.Run("profile="+tc.profile, func(t *testing.T) {
			ti := newTI("x", appsv1alpha1.DepSpec{Mode: "managed"}, tc.profile)
			inst, storage := managedPGShape(ti)
			if inst != tc.wantInstances || storage != tc.wantStorage {
				t.Errorf("managedPGShape = (%d,%q), want (%d,%q)", inst, storage, tc.wantInstances, tc.wantStorage)
			}
		})
	}
}
