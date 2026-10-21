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
	"fmt"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/validation/field"
	ctrl "sigs.k8s.io/controller-runtime"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

// defaultBackupSchedule mirrors the documented default in BackupSpec.Schedule
// (6-field, seconds-first cron): 02:00 daily.
const defaultBackupSchedule = "0 0 2 * * *"

var trussinstancelog = logf.Log.WithName("trussinstance-webhook")

// groupKind identifies the resource for status errors; kept literal so the
// webhook has no init-order dependency on the api package's scheme registration.
var groupKind = schema.GroupKind{Group: "apps.truss.binarysquad.org", Kind: "TrussInstance"}

// SetupTrussInstanceWebhookWithManager registers the defaulting + validating
// webhooks for TrussInstance with the manager's webhook server.
func SetupTrussInstanceWebhookWithManager(mgr ctrl.Manager) error {
	return ctrl.NewWebhookManagedBy(mgr, &appsv1alpha1.TrussInstance{}).
		WithValidator(&TrussInstanceCustomValidator{}).
		WithDefaulter(&TrussInstanceCustomDefaulter{}).
		Complete()
}

// +kubebuilder:webhook:path=/mutate-apps-truss-binarysquad-org-v1alpha1-trussinstance,mutating=true,failurePolicy=fail,sideEffects=None,groups=apps.truss.binarysquad.org,resources=trussinstances,verbs=create;update,versions=v1alpha1,name=mtrussinstance-v1alpha1.kb.io,admissionReviewVersions=v1

// TrussInstanceCustomDefaulter fills in values a user left blank. Defaulting
// lives in a webhook because CEL (CRD validation) can only reject, never write.
type TrussInstanceCustomDefaulter struct{}

var _ admission.Defaulter[*appsv1alpha1.TrussInstance] = &TrussInstanceCustomDefaulter{}

// Default applies the mutating-admission defaults to a TrussInstance.
func (d *TrussInstanceCustomDefaulter) Default(_ context.Context, ti *appsv1alpha1.TrussInstance) error {
	trussinstancelog.V(1).Info("defaulting", "name", ti.GetName())

	// Backups on but no schedule -> the documented 02:00-daily default.
	if ti.Spec.Backup.Enabled && ti.Spec.Backup.Schedule == "" {
		ti.Spec.Backup.Schedule = defaultBackupSchedule
	}

	// Infer a mode for each operator-capable dependency: a referenced Secret
	// means bring-your-own; nothing referenced means the operator provisions it.
	// Ory is excluded (byo-only, different type).
	defaultDepMode(&ti.Spec.Dependencies.Postgres)
	defaultDepMode(&ti.Spec.Dependencies.Storage)
	defaultDepMode(&ti.Spec.Dependencies.Cache)
	defaultDepMode(&ti.Spec.Dependencies.Flags)
	return nil
}

func defaultDepMode(d *appsv1alpha1.DepSpec) {
	if d.Mode != "" {
		return
	}
	if d.ExistingSecret != "" {
		d.Mode = "byo"
	} else {
		d.Mode = "managed"
	}
}

// +kubebuilder:webhook:path=/validate-apps-truss-binarysquad-org-v1alpha1-trussinstance,mutating=false,failurePolicy=fail,sideEffects=None,groups=apps.truss.binarysquad.org,resources=trussinstances,verbs=create;update,versions=v1alpha1,name=vtrussinstance-v1alpha1.kb.io,admissionReviewVersions=v1

// TrussInstanceCustomValidator enforces cross-field and immutability rules that
// are awkward or impossible to express as per-field CEL on the CRD.
type TrussInstanceCustomValidator struct{}

var _ admission.Validator[*appsv1alpha1.TrussInstance] = &TrussInstanceCustomValidator{}

// ValidateCreate runs the spec-consistency checks on a new TrussInstance.
func (v *TrussInstanceCustomValidator) ValidateCreate(_ context.Context, ti *appsv1alpha1.TrussInstance) (admission.Warnings, error) {
	return nil, aggregate(ti.GetName(), validateSpec(ti))
}

// ValidateUpdate runs the spec-consistency checks plus immutability (new vs old).
func (v *TrussInstanceCustomValidator) ValidateUpdate(_ context.Context, old, ti *appsv1alpha1.TrussInstance) (admission.Warnings, error) {
	errs := validateSpec(ti)

	// The system-of-record database mode is immutable once set. Flipping
	// managed<->byo on a live instance would orphan or destroy its data.
	// Guard on a non-empty old value so instances created before defaulting
	// existed aren't falsely flagged on their first update.
	oldMode := old.Spec.Dependencies.Postgres.Mode
	if oldMode != "" && oldMode != ti.Spec.Dependencies.Postgres.Mode {
		errs = append(errs, field.Invalid(
			field.NewPath("spec", "dependencies", "postgres", "mode"),
			ti.Spec.Dependencies.Postgres.Mode,
			fmt.Sprintf("postgres mode is immutable (was %q); switching the system-of-record database on a live instance would orphan its data", oldMode),
		))
	}

	return nil, aggregate(ti.GetName(), errs)
}

// ValidateDelete is a no-op; deletion is handled by the finalizer.
func (v *TrussInstanceCustomValidator) ValidateDelete(_ context.Context, _ *appsv1alpha1.TrussInstance) (admission.Warnings, error) {
	return nil, nil
}

// validateSpec holds the create+update consistency rules.
func validateSpec(ti *appsv1alpha1.TrussInstance) field.ErrorList {
	var errs field.ErrorList
	b := ti.Spec.Backup
	if b.Enabled {
		base := field.NewPath("spec", "backup")
		if ti.Spec.Dependencies.Postgres.Mode != "managed" {
			errs = append(errs, field.Invalid(base.Child("enabled"), b.Enabled,
				`backups require dependencies.postgres.mode = "managed" (the CNPG barman object store only applies to operator-managed Postgres)`))
		}
		if b.DestinationPath == "" {
			errs = append(errs, field.Required(base.Child("destinationPath"), "required when backup is enabled"))
		}
		if b.ExistingSecret == "" {
			errs = append(errs, field.Required(base.Child("existingSecret"), "required when backup is enabled"))
		}
	}
	return errs
}

func aggregate(name string, errs field.ErrorList) error {
	if len(errs) == 0 {
		return nil
	}
	return apierrors.NewInvalid(groupKind, name, errs)
}
