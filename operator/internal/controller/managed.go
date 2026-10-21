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
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

// cnpgClusterGVK is the CloudNativePG Cluster kind the operator provisions for a
// managed Postgres dependency. We address it as unstructured so the operator
// takes no compile-time dependency on the CNPG Go module: the CRD being present
// in the cluster is the only coupling.
var cnpgClusterGVK = schema.GroupVersionKind{Group: "postgresql.cnpg.io", Version: "v1", Kind: "Cluster"}

// cnpgClusterName is the CNPG Cluster the operator owns for ti.
func cnpgClusterName(ti *appsv1alpha1.TrussInstance) string { return ti.Name + "-pg" }

// cnpgAppSecretName is the Secret CNPG publishes for the application role. It
// carries a ready-to-use connection string under key "uri", which is what the
// API consumes (see pgSecretRef).
func cnpgAppSecretName(ti *appsv1alpha1.TrussInstance) string {
	return cnpgClusterName(ti) + "-app"
}

// managedPGShape maps the app-tier Scaling profile onto the managed database:
// dev gets a single instance, medium/large get a 3-node HA cluster. Sizing the
// data tier with the app tier keeps one knob honest instead of two.
func managedPGShape(ti *appsv1alpha1.TrussInstance) (instances int64, storage string) {
	switch ti.Spec.Scaling.Profile {
	case "large":
		return 3, "50Gi"
	case "medium":
		return 3, "10Gi"
	default: // small or unset
		return 1, "2Gi"
	}
}

// desiredManagedPostgres builds the CNPG Cluster the operator owns. CNPG then
// runs the HA topology, handles failover, and publishes the -app connection
// secret the API reads. The owner reference makes teardown pure garbage
// collection: deleting the TrussInstance deletes the Cluster.
func (r *TrussInstanceReconciler) desiredManagedPostgres(ti *appsv1alpha1.TrussInstance) (*unstructured.Unstructured, error) {
	instances, storage := managedPGShape(ti)
	spec := map[string]any{
		"instances": instances,
		"storage":   map[string]any{"size": storage},
		"bootstrap": map[string]any{
			"initdb": map[string]any{
				"database": "truss",
				"owner":    "truss",
				// Let the app role create the per-tenant RLS roles (anon/authenticated).
				// postInitSQL runs once, as superuser, right after initdb.
				"postInitSQL": []any{`ALTER ROLE "truss" CREATEROLE`},
			},
		},
	}
	// Backups/PITR: wire CNPG's object-store archive (WAL + base backups). This
	// enables point-in-time recovery; the ScheduledBackup (applied separately) drives
	// the periodic base backups. Uses the in-tree barmanObjectStore config.
	if b := ti.Spec.Backup; b.Enabled && b.DestinationPath != "" && b.ExistingSecret != "" {
		obj := map[string]any{
			"destinationPath": b.DestinationPath,
			"s3Credentials": map[string]any{
				"accessKeyId":     map[string]any{"name": b.ExistingSecret, "key": "ACCESS_KEY_ID"},
				"secretAccessKey": map[string]any{"name": b.ExistingSecret, "key": "SECRET_ACCESS_KEY"},
			},
		}
		if b.EndpointURL != "" {
			obj["endpointURL"] = b.EndpointURL
		}
		backup := map[string]any{"barmanObjectStore": obj}
		if b.RetentionPolicy != "" {
			backup["retentionPolicy"] = b.RetentionPolicy
		}
		spec["backup"] = backup
	}
	u := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": cnpgClusterGVK.GroupVersion().String(),
		"kind":       cnpgClusterGVK.Kind,
		"metadata": map[string]any{
			"name":      cnpgClusterName(ti),
			"namespace": ti.Namespace,
		},
		"spec": spec,
	}}
	if err := controllerutil.SetControllerReference(ti, u, r.Scheme); err != nil {
		return nil, err
	}
	return u, nil
}

// cnpgScheduledBackupGVK is the CNPG ScheduledBackup kind driving periodic base backups.
var cnpgScheduledBackupGVK = schema.GroupVersionKind{Group: "postgresql.cnpg.io", Version: "v1", Kind: "ScheduledBackup"}

// desiredScheduledBackup builds the CNPG ScheduledBackup the operator owns, pointed
// at the managed Cluster. CNPG uses a 6-field (seconds-first) cron.
func (r *TrussInstanceReconciler) desiredScheduledBackup(ti *appsv1alpha1.TrussInstance) (*unstructured.Unstructured, error) {
	schedule := ti.Spec.Backup.Schedule
	if schedule == "" {
		schedule = "0 0 2 * * *" // 02:00 daily
	}
	u := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": cnpgScheduledBackupGVK.GroupVersion().String(),
		"kind":       cnpgScheduledBackupGVK.Kind,
		"metadata": map[string]any{
			"name":      cnpgClusterName(ti) + "-backup",
			"namespace": ti.Namespace,
		},
		"spec": map[string]any{
			"schedule":             schedule,
			"backupOwnerReference": "self",
			"cluster":              map[string]any{"name": cnpgClusterName(ti)},
		},
	}}
	if err := controllerutil.SetControllerReference(ti, u, r.Scheme); err != nil {
		return nil, err
	}
	return u, nil
}

// ensureManagedPostgres provisions and gates on the operator-managed Postgres.
// It applies the CNPG Cluster, then reports not-ready (with a human reason)
// while CNPG is absent or the cluster has not reached a healthy state, and ready
// only once every desired instance is ready and the -app secret exists. This is
// the managed half of the dependency-ordering seam: the app tier never rolls
// until its database is actually serving.
func (r *TrussInstanceReconciler) ensureManagedPostgres(ctx context.Context, ti *appsv1alpha1.TrussInstance) (depResult, error) {
	// The managed path needs the CloudNativePG operator in the cluster. Mirror the
	// observability guard: a cluster without CNPG gets a clear reason, not a crash.
	if !r.crdPresent(cnpgClusterGVK) {
		return depResult{reason: "CloudNativePGNotInstalled", msg: "managed postgres requires the CloudNativePG operator (CRD postgresql.cnpg.io) in the cluster"}, nil
	}

	obj, err := r.desiredManagedPostgres(ti)
	if err != nil {
		return depResult{}, err
	}
	if err := r.applySSA(ctx, obj); err != nil {
		return depResult{}, err
	}

	// Scheduled backups + PITR (when enabled). The CNPG Cluster already carries the
	// WAL-archive / object-store config (set in desiredManagedPostgres); here we add the
	// ScheduledBackup driving periodic base backups. Backups run async, so app readiness
	// is NOT gated on them.
	if ti.Spec.Backup.Enabled {
		if ti.Spec.Backup.DestinationPath == "" || ti.Spec.Backup.ExistingSecret == "" {
			return depResult{reason: "BackupMisconfigured", msg: "backup.enabled requires backup.destinationPath and backup.existingSecret"}, nil
		}
		sb, err := r.desiredScheduledBackup(ti)
		if err != nil {
			return depResult{}, err
		}
		if err := r.applySSA(ctx, sb); err != nil {
			return depResult{}, err
		}
	}

	// Gate on the cluster reaching a healthy state. CNPG reports .status.readyInstances
	// against .spec.instances; treat the cluster as ready when every desired instance is.
	live := &unstructured.Unstructured{}
	live.SetGroupVersionKind(cnpgClusterGVK)
	if err := r.Get(ctx, client.ObjectKeyFromObject(obj), live); err != nil {
		if apierrors.IsNotFound(err) {
			return depResult{reason: "PostgresProvisioning", msg: "waiting for CloudNativePG to create the cluster"}, nil
		}
		return depResult{}, err
	}
	desired, _, _ := unstructured.NestedInt64(live.Object, "spec", "instances")
	ready, _, _ := unstructured.NestedInt64(live.Object, "status", "readyInstances")
	if desired == 0 || ready < desired {
		phase, _, _ := unstructured.NestedString(live.Object, "status", "phase")
		return depResult{reason: "PostgresProvisioning", msg: "managed postgres not healthy yet: " + phase}, nil
	}

	// The -app secret must exist before the API can mount it.
	if err := r.Get(ctx, client.ObjectKey{Namespace: ti.Namespace, Name: cnpgAppSecretName(ti)}, &corev1.Secret{}); err != nil {
		if apierrors.IsNotFound(err) {
			return depResult{reason: "PostgresProvisioning", msg: "waiting for CNPG to publish the app connection secret"}, nil
		}
		return depResult{}, err
	}

	return depResult{ready: true, reason: "ManagedPostgresReady", msg: "operator-managed postgres is healthy"}, nil
}

// pgSecretRef returns the Secret name + key the API reads its Postgres connection
// string from: the BYO secret's "database-url", or the CNPG-managed -app secret's
// "uri". ok is false when no Postgres is configured.
func pgSecretRef(ti *appsv1alpha1.TrussInstance) (name, key string, ok bool) {
	pg := ti.Spec.Dependencies.Postgres
	switch pg.Mode {
	case "managed":
		return cnpgAppSecretName(ti), "uri", true
	case "byo":
		if pg.ExistingSecret != "" {
			return pg.ExistingSecret, "database-url", true
		}
	}
	return "", "", false
}
