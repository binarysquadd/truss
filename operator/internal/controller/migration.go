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
	"regexp"
	"strings"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/utils/ptr"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

const migrationBackoffLimit int32 = 3

var nonNameChars = regexp.MustCompile(`[^a-z0-9]+`)

// sanitizeVersion turns an image tag into an RFC1123-safe name fragment
// (e.g. "0.2.0" -> "0-2-0", "latest" -> "latest").
func sanitizeVersion(v string) string {
	s := nonNameChars.ReplaceAllString(strings.ToLower(v), "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "latest"
	}
	return s
}

// migrationJobName is per-version: a new target version gets a new Job, so the
// gate re-runs migrations exactly once per version.
func migrationJobName(ti *appsv1alpha1.TrussInstance) string {
	return ti.Name + "-migrate-" + sanitizeVersion(ti.Spec.Version)
}

// desiredMigrationJob builds the one-shot migrate-only Job: the target api image
// run with TRUSS_MIGRATE_ONLY=true (applies the schema, then exits non-zero on
// failure). Same DB/secret wiring as the app so it migrates the right database.
func (r *TrussInstanceReconciler) desiredMigrationJob(ti *appsv1alpha1.TrussInstance) (*batchv1.Job, error) {
	labels := componentLabels(ti, "migrate")
	env := append(apiEnv(ti), corev1.EnvVar{Name: "TRUSS_MIGRATE_ONLY", Value: "true"})
	backoff := migrationBackoffLimit
	job := &batchv1.Job{
		TypeMeta:   metav1.TypeMeta{APIVersion: "batch/v1", Kind: "Job"},
		ObjectMeta: metav1.ObjectMeta{Name: migrationJobName(ti), Namespace: ti.Namespace, Labels: labels},
		Spec: batchv1.JobSpec{
			BackoffLimit:            &backoff,
			TTLSecondsAfterFinished: ptr.To(int32(600)), // auto-clean finished migrate Jobs
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					RestartPolicy: corev1.RestartPolicyNever,
					Containers: []corev1.Container{{
						Name:            "migrate",
						Image:           apiImageRepo + ":" + ti.Spec.Version,
						Env:             env,
						EnvFrom:         apiEnvFrom(ti),
						SecurityContext: hardenedContainerSecurity(),
					}},
					SecurityContext: hardenedPodSecurity(),
				},
			},
		},
	}
	if err := controllerutil.SetControllerReference(ti, job, r.Scheme); err != nil {
		return nil, err
	}
	return job, nil
}

// migrationResult reports the pre-roll migration gate's state.
type migrationResult struct {
	done   bool // migrations for the target version succeeded; safe to roll the app
	failed bool // migrations failed (backoff exhausted); do not roll the app
	msg    string
}

// ensureMigrationJob implements "migrate-then-switch": it runs a per-version
// migrate-only Job and gates the app rollout on its success. Jobs are immutable,
// so it is create-if-absent (a new version = a new Job name = a fresh migration).
func (r *TrussInstanceReconciler) ensureMigrationJob(ctx context.Context, ti *appsv1alpha1.TrussInstance) (migrationResult, error) {
	name := migrationJobName(ti)
	job := &batchv1.Job{}
	err := r.Get(ctx, client.ObjectKey{Namespace: ti.Namespace, Name: name}, job)
	if apierrors.IsNotFound(err) {
		dj, derr := r.desiredMigrationJob(ti)
		if derr != nil {
			return migrationResult{}, derr
		}
		if cerr := r.Create(ctx, dj); cerr != nil && !apierrors.IsAlreadyExists(cerr) {
			return migrationResult{}, cerr
		}
		return migrationResult{msg: "migration job started for version " + ti.Spec.Version}, nil
	}
	if err != nil {
		return migrationResult{}, err
	}
	if job.Status.Succeeded >= 1 {
		return migrationResult{done: true, msg: "migrations applied for version " + ti.Spec.Version}, nil
	}
	backoff := migrationBackoffLimit
	if job.Spec.BackoffLimit != nil {
		backoff = *job.Spec.BackoffLimit
	}
	if job.Status.Failed > backoff {
		return migrationResult{failed: true, msg: "migration job failed for version " + ti.Spec.Version}, nil
	}
	return migrationResult{msg: "migration job running for version " + ti.Spec.Version}, nil
}
