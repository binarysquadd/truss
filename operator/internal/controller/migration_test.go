/*
Copyright 2026.
Licensed under the Apache License, Version 2.0.
*/

package controller

import (
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

func TestSanitizeVersion(t *testing.T) {
	cases := map[string]string{"0.2.0": "0-2-0", "latest": "latest", "v1.2.3-rc.1": "v1-2-3-rc-1", "": "latest"}
	for in, want := range cases {
		if got := sanitizeVersion(in); got != want {
			t.Errorf("sanitizeVersion(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestMigrationJob(t *testing.T) {
	r := backupReconciler(t)
	ti := &appsv1alpha1.TrussInstance{ObjectMeta: metav1.ObjectMeta{Name: "demo", Namespace: "default"}}
	ti.Spec.Version = "0.2.0"
	if n := migrationJobName(ti); n != "demo-migrate-0-2-0" {
		t.Errorf("migrationJobName = %q, want demo-migrate-0-2-0", n)
	}
	job, err := r.desiredMigrationJob(ti)
	if err != nil {
		t.Fatal(err)
	}
	c := job.Spec.Template.Spec.Containers[0]
	if c.Image != apiImageRepo+":0.2.0" {
		t.Errorf("image = %q", c.Image)
	}
	if _, ok := envValue(c.Env, "TRUSS_MIGRATE_ONLY"); !ok {
		t.Errorf("TRUSS_MIGRATE_ONLY not set on the migrate job")
	}
	if job.Spec.Template.Spec.RestartPolicy != "Never" {
		t.Errorf("restartPolicy = %q, want Never", job.Spec.Template.Spec.RestartPolicy)
	}
	if job.Spec.BackoffLimit == nil || job.Spec.TTLSecondsAfterFinished == nil {
		t.Errorf("backoffLimit/TTL should be set")
	}
}
