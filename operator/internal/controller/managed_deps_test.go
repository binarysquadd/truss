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
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

// Plain unit tests for the managed-dependency wiring helpers (pure functions, no API server).

func depTI(storageMode, cacheMode, flagsMode string) *appsv1alpha1.TrussInstance {
	dep := func(mode, secret string) appsv1alpha1.DepSpec {
		s := ""
		if mode == "byo" {
			s = secret
		}
		return appsv1alpha1.DepSpec{Mode: mode, ExistingSecret: s}
	}
	return &appsv1alpha1.TrussInstance{
		ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
		Spec: appsv1alpha1.TrussInstanceSpec{Dependencies: appsv1alpha1.Dependencies{
			Storage: dep(storageMode, "my-storage"),
			Cache:   dep(cacheMode, "my-cache"),
			Flags:   dep(flagsMode, "my-flags"),
		}},
	}
}

func envValue(env []corev1.EnvVar, name string) (corev1.EnvVar, bool) {
	for _, e := range env {
		if e.Name == name {
			return e, true
		}
	}
	return corev1.EnvVar{}, false
}

func TestManagedDepNames(t *testing.T) {
	ti := depTI("managed", "managed", "managed")
	cases := map[string]string{
		storageName(ti):       "t-rustfs",
		cacheName(ti):         "t-valkey",
		flagsName(ti):         "t-flagd",
		storageSecretName(ti): "t-storage",
		cacheSecretName(ti):   "t-cache",
	}
	for got, want := range cases {
		if got != want {
			t.Errorf("name = %q, want %q", got, want)
		}
	}
}

func TestStorageEnvManaged(t *testing.T) {
	env := storageEnv(depTI("managed", "byo", "byo"))
	ep, ok := envValue(env, "STORAGE_S3_ENDPOINT")
	if !ok || ep.Value != "http://t-rustfs:9000" {
		t.Errorf("STORAGE_S3_ENDPOINT = %q (ok=%v), want http://t-rustfs:9000", ep.Value, ok)
	}
	ak, ok := envValue(env, "STORAGE_ACCESS_KEY")
	if !ok || ak.ValueFrom == nil || ak.ValueFrom.SecretKeyRef.Name != "t-storage" {
		t.Errorf("STORAGE_ACCESS_KEY not wired to the generated t-storage secret")
	}
	if storageEnv(depTI("byo", "byo", "byo")) != nil {
		t.Errorf("storageEnv(byo) should be nil")
	}
}

func TestCacheAndFlagsEnvManaged(t *testing.T) {
	cenv := cacheEnv(depTI("byo", "managed", "byo"))
	if h, ok := envValue(cenv, "VALKEY_HOST"); !ok || h.Value != "t-valkey" {
		t.Errorf("VALKEY_HOST = %q, want t-valkey", h.Value)
	}
	if pw, ok := envValue(cenv, "VALKEY_PASSWORD"); !ok || pw.ValueFrom == nil || pw.ValueFrom.SecretKeyRef.Name != "t-cache" {
		t.Errorf("VALKEY_PASSWORD not wired to t-cache secret")
	}
	fenv := flagsEnv(depTI("byo", "byo", "managed"))
	if h, ok := envValue(fenv, "FLAGD_HOST"); !ok || h.Value != "http://t-flagd" {
		t.Errorf("FLAGD_HOST = %q, want http://t-flagd", h.Value)
	}
	if cacheEnv(depTI("byo", "byo", "byo")) != nil || flagsEnv(depTI("byo", "byo", "byo")) != nil {
		t.Errorf("cache/flags env should be nil for byo")
	}
}

func TestApiEnvFromByo(t *testing.T) {
	from := apiEnvFrom(depTI("byo", "byo", "managed"))
	// storage + cache are byo (2 refs); flags is managed (no envFrom).
	if len(from) != 2 {
		t.Fatalf("apiEnvFrom len = %d, want 2 (storage+cache byo)", len(from))
	}
	names := map[string]bool{}
	for _, f := range from {
		if f.SecretRef != nil {
			names[f.SecretRef.Name] = true
		}
	}
	if !names["my-storage"] || !names["my-cache"] {
		t.Errorf("apiEnvFrom should reference my-storage and my-cache, got %v", names)
	}
	if names["my-flags"] {
		t.Errorf("managed flags must not appear in apiEnvFrom")
	}
}

func TestAppAndOryEnv(t *testing.T) {
	ti := depTI("managed", "managed", "managed")
	ti.Spec.Dependencies.Ory.Endpoints = appsv1alpha1.OryEndpoints{Kratos: "http://kratos:4433", Keto: "http://keto:4466"}
	env := apiEnv(ti)
	if v, ok := envValue(env, "TRUSS_SELF_HOSTED"); !ok || v.Value != "true" {
		t.Errorf("TRUSS_SELF_HOSTED not set to true")
	}
	ek, ok := envValue(env, "ENCRYPTION_KEY")
	if !ok || ek.ValueFrom == nil || ek.ValueFrom.SecretKeyRef.Name != "t-app" {
		t.Errorf("ENCRYPTION_KEY not wired to the generated t-app secret")
	}
	if v, ok := envValue(env, "KRATOS_PUBLIC_URL"); !ok || v.Value != "http://kratos:4433" {
		t.Errorf("KRATOS_PUBLIC_URL = %q, want http://kratos:4433", v.Value)
	}
	if _, ok := envValue(env, "KETO_READ_URL"); !ok {
		t.Errorf("KETO_READ_URL missing")
	}
	if _, ok := envValue(env, "HYDRA_PUBLIC_URL"); ok {
		t.Errorf("HYDRA_PUBLIC_URL must be absent when the Hydra endpoint is empty")
	}
}
