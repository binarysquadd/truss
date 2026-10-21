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
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

// Plain unit tests for the defaulting + validating webhooks (pure logic, no API server).

func ti(spec appsv1alpha1.TrussInstanceSpec) *appsv1alpha1.TrussInstance {
	return &appsv1alpha1.TrussInstance{
		ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
		Spec:       spec,
	}
}

func TestDefaulter_BackupSchedule(t *testing.T) {
	d := &TrussInstanceCustomDefaulter{}

	// enabled + empty schedule -> documented default
	obj := ti(appsv1alpha1.TrussInstanceSpec{Backup: appsv1alpha1.BackupSpec{Enabled: true}})
	if err := d.Default(context.Background(), obj); err != nil {
		t.Fatalf("Default: %v", err)
	}
	if obj.Spec.Backup.Schedule != defaultBackupSchedule {
		t.Errorf("schedule = %q, want %q", obj.Spec.Backup.Schedule, defaultBackupSchedule)
	}

	// explicit schedule preserved
	obj = ti(appsv1alpha1.TrussInstanceSpec{Backup: appsv1alpha1.BackupSpec{Enabled: true, Schedule: "0 30 1 * * *"}})
	_ = d.Default(context.Background(), obj)
	if obj.Spec.Backup.Schedule != "0 30 1 * * *" {
		t.Errorf("explicit schedule overwritten: %q", obj.Spec.Backup.Schedule)
	}

	// disabled -> no schedule injected
	obj = ti(appsv1alpha1.TrussInstanceSpec{Backup: appsv1alpha1.BackupSpec{Enabled: false}})
	_ = d.Default(context.Background(), obj)
	if obj.Spec.Backup.Schedule != "" {
		t.Errorf("schedule injected while disabled: %q", obj.Spec.Backup.Schedule)
	}
}

func TestDefaulter_DepModeInference(t *testing.T) {
	cases := []struct {
		name   string
		in     appsv1alpha1.DepSpec
		want   string
	}{
		{"empty -> managed", appsv1alpha1.DepSpec{}, "managed"},
		{"secret, no mode -> byo", appsv1alpha1.DepSpec{ExistingSecret: "my-pg"}, "byo"},
		{"explicit managed preserved", appsv1alpha1.DepSpec{Mode: "managed"}, "managed"},
		{"explicit byo preserved", appsv1alpha1.DepSpec{Mode: "byo", ExistingSecret: "s"}, "byo"},
	}
	d := &TrussInstanceCustomDefaulter{}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			obj := ti(appsv1alpha1.TrussInstanceSpec{Dependencies: appsv1alpha1.Dependencies{Postgres: c.in}})
			if err := d.Default(context.Background(), obj); err != nil {
				t.Fatalf("Default: %v", err)
			}
			if got := obj.Spec.Dependencies.Postgres.Mode; got != c.want {
				t.Errorf("postgres mode = %q, want %q", got, c.want)
			}
		})
	}
}

func managedBackup(dest, secret string) appsv1alpha1.TrussInstanceSpec {
	return appsv1alpha1.TrussInstanceSpec{
		Dependencies: appsv1alpha1.Dependencies{Postgres: appsv1alpha1.DepSpec{Mode: "managed"}},
		Backup:       appsv1alpha1.BackupSpec{Enabled: true, DestinationPath: dest, ExistingSecret: secret},
	}
}

func TestValidateCreate(t *testing.T) {
	v := &TrussInstanceCustomValidator{}
	ctx := context.Background()

	// valid: managed pg + full backup config
	if _, err := v.ValidateCreate(ctx, ti(managedBackup("s3://b/truss", "store-creds"))); err != nil {
		t.Errorf("valid instance rejected: %v", err)
	}

	// backup on byo postgres -> rejected
	spec := managedBackup("s3://b/truss", "store-creds")
	spec.Dependencies.Postgres.Mode = "byo"
	spec.Dependencies.Postgres.ExistingSecret = "pg"
	if _, err := v.ValidateCreate(ctx, ti(spec)); err == nil {
		t.Error("backup on byo postgres should be rejected")
	}

	// backup on, missing destinationPath + existingSecret -> rejected
	if _, err := v.ValidateCreate(ctx, ti(managedBackup("", ""))); err == nil {
		t.Error("backup enabled with no destination/secret should be rejected")
	}

	// backup disabled -> no backup rules apply
	if _, err := v.ValidateCreate(ctx, ti(appsv1alpha1.TrussInstanceSpec{})); err != nil {
		t.Errorf("empty spec rejected: %v", err)
	}
}

func TestValidateUpdate_PostgresModeImmutable(t *testing.T) {
	v := &TrussInstanceCustomValidator{}
	ctx := context.Background()

	pg := func(mode string) *appsv1alpha1.TrussInstance {
		return ti(appsv1alpha1.TrussInstanceSpec{
			Dependencies: appsv1alpha1.Dependencies{Postgres: appsv1alpha1.DepSpec{Mode: mode, ExistingSecret: "s"}},
		})
	}

	// managed -> byo : rejected
	if _, err := v.ValidateUpdate(ctx, pg("managed"), pg("byo")); err == nil {
		t.Error("managed->byo postgres mode change should be rejected")
	}
	// same mode : allowed
	if _, err := v.ValidateUpdate(ctx, pg("managed"), pg("managed")); err != nil {
		t.Errorf("no-op update rejected: %v", err)
	}
	// empty old mode (pre-defaulting instance) : not flagged as a change
	if _, err := v.ValidateUpdate(ctx, pg(""), pg("managed")); err != nil {
		t.Errorf("empty-old-mode update rejected: %v", err)
	}
}
