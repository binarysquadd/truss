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

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

func backupReconciler(t *testing.T) *TrussInstanceReconciler {
	t.Helper()
	sch := runtime.NewScheme()
	if err := appsv1alpha1.AddToScheme(sch); err != nil {
		t.Fatal(err)
	}
	return &TrussInstanceReconciler{Scheme: sch}
}

func TestClusterBackupConfig(t *testing.T) {
	r := backupReconciler(t)
	ti := &appsv1alpha1.TrussInstance{ObjectMeta: metav1.ObjectMeta{Name: "demo", Namespace: "default"}}
	ti.Spec.Backup = appsv1alpha1.BackupSpec{Enabled: true, DestinationPath: "s3://b/truss", EndpointURL: "http://demo-rustfs:9000", ExistingSecret: "backup-creds", RetentionPolicy: "30d"}

	cl, err := r.desiredManagedPostgres(ti)
	if err != nil {
		t.Fatal(err)
	}
	if dp, _, _ := unstructured.NestedString(cl.Object, "spec", "backup", "barmanObjectStore", "destinationPath"); dp != "s3://b/truss" {
		t.Errorf("destinationPath = %q, want s3://b/truss", dp)
	}
	if ep, _, _ := unstructured.NestedString(cl.Object, "spec", "backup", "barmanObjectStore", "endpointURL"); ep != "http://demo-rustfs:9000" {
		t.Errorf("endpointURL = %q", ep)
	}
	if ak, _, _ := unstructured.NestedString(cl.Object, "spec", "backup", "barmanObjectStore", "s3Credentials", "accessKeyId", "name"); ak != "backup-creds" {
		t.Errorf("s3 access-key secret = %q, want backup-creds", ak)
	}
	if rp, _, _ := unstructured.NestedString(cl.Object, "spec", "backup", "retentionPolicy"); rp != "30d" {
		t.Errorf("retentionPolicy = %q, want 30d", rp)
	}

	// Disabled → no backup block on the Cluster.
	ti.Spec.Backup.Enabled = false
	cl2, _ := r.desiredManagedPostgres(ti)
	if _, found, _ := unstructured.NestedMap(cl2.Object, "spec", "backup"); found {
		t.Errorf("Cluster must not carry a backup block when backups are disabled")
	}
}

func TestScheduledBackupBuilder(t *testing.T) {
	r := backupReconciler(t)
	ti := &appsv1alpha1.TrussInstance{ObjectMeta: metav1.ObjectMeta{Name: "demo", Namespace: "default"}}

	sb, err := r.desiredScheduledBackup(ti)
	if err != nil {
		t.Fatal(err)
	}
	if k := sb.GetKind(); k != "ScheduledBackup" {
		t.Errorf("kind = %q", k)
	}
	if sched, _, _ := unstructured.NestedString(sb.Object, "spec", "schedule"); sched != "0 0 2 * * *" {
		t.Errorf("default schedule = %q, want 0 0 2 * * *", sched)
	}
	if cl, _, _ := unstructured.NestedString(sb.Object, "spec", "cluster", "name"); cl != "demo-pg" {
		t.Errorf("cluster ref = %q, want demo-pg", cl)
	}

	ti.Spec.Backup.Schedule = "0 30 1 * * *"
	sb2, _ := r.desiredScheduledBackup(ti)
	if sched, _, _ := unstructured.NestedString(sb2.Object, "spec", "schedule"); sched != "0 30 1 * * *" {
		t.Errorf("custom schedule not honored: %q", sched)
	}
}
