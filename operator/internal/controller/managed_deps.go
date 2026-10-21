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
	"crypto/rand"
	"encoding/hex"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

// Images + ports for operator-managed dependency workloads. These mirror what
// the self-hosted docker-compose runs, so a managed TrussInstance stands up the
// same stack a BYO deployment would wire by hand.
const (
	rustfsImage = "rustfs/rustfs:1.0.3"
	valkeyImage = "valkey/valkey:8-alpine"
	flagdImage  = "ghcr.io/open-feature/flagd:v0.11.1"

	storageS3Port      int32 = 9000
	storageConsolePort int32 = 9001
	cachePort          int32 = 6379
	flagsPort          int32 = 8013
	flagsMgmtPort      int32 = 8014
)

// Name helpers for the managed dependency objects owned by a TrussInstance.
func storageName(ti *appsv1alpha1.TrussInstance) string       { return ti.Name + "-rustfs" }
func cacheName(ti *appsv1alpha1.TrussInstance) string         { return ti.Name + "-valkey" }
func flagsName(ti *appsv1alpha1.TrussInstance) string         { return ti.Name + "-flagd" }
func storageSecretName(ti *appsv1alpha1.TrussInstance) string { return ti.Name + "-storage" }
func cacheSecretName(ti *appsv1alpha1.TrussInstance) string   { return ti.Name + "-cache" }
func appSecretName(ti *appsv1alpha1.TrussInstance) string     { return ti.Name + "-app" }

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// ensureGeneratedSecret creates an owned Secret with random values the FIRST time
// only; on later reconciles it is left untouched so the credentials stay stable.
// (We deliberately do NOT use Server-Side Apply here: SSA would rewrite the values
// every reconcile. This is the seam O2 — secret rotation — builds on.)
func (r *TrussInstanceReconciler) ensureGeneratedSecret(ctx context.Context, ti *appsv1alpha1.TrussInstance, name string, byteLen map[string]int) error {
	existing := &corev1.Secret{}
	err := r.Get(ctx, client.ObjectKey{Namespace: ti.Namespace, Name: name}, existing)
	if err == nil {
		return nil // already generated; keep it stable
	}
	if !apierrors.IsNotFound(err) {
		return err
	}
	data := make(map[string][]byte, len(byteLen))
	for k, n := range byteLen {
		data[k] = []byte(randHex(n))
	}
	sec := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ti.Namespace, Labels: componentLabels(ti, "deps")},
		Type:       corev1.SecretTypeOpaque,
		Data:       data,
	}
	if err := controllerutil.SetControllerReference(ti, sec, r.Scheme); err != nil {
		return err
	}
	return r.Create(ctx, sec)
}

// ensureAppSecret generates the Truss app's OWN secrets into an owned Secret —
// chiefly ENCRYPTION_KEY, which the API requires to boot. Generated once and left
// stable (the seam O-later secret rotation builds on). Without this the operator
// would deploy an app that can't start.
func (r *TrussInstanceReconciler) ensureAppSecret(ctx context.Context, ti *appsv1alpha1.TrussInstance) error {
	return r.ensureGeneratedSecret(ctx, ti, appSecretName(ti), map[string]int{"ENCRYPTION_KEY": 32})
}

// managedDeploymentReady reports whether a managed dependency Deployment has at
// least one ready replica yet.
func (r *TrussInstanceReconciler) managedDeploymentReady(ctx context.Context, ti *appsv1alpha1.TrussInstance, name string) (bool, error) {
	dep := &appsv1.Deployment{}
	err := r.Get(ctx, client.ObjectKey{Namespace: ti.Namespace, Name: name}, dep)
	if apierrors.IsNotFound(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return dep.Status.ReadyReplicas >= 1, nil
}

// applyManagedWorkload applies a single-replica Deployment for a managed dependency
// (the operator owns the lifecycle; the dependency image owns the behavior).
func (r *TrussInstanceReconciler) applyManagedWorkload(ctx context.Context, ti *appsv1alpha1.TrussInstance, name, comp string, container corev1.Container, volumes []corev1.Volume) error {
	labels := componentLabels(ti, comp)
	container.SecurityContext = hardenedContainerSecurity()
	if container.Resources.Limits == nil && container.Resources.Requests == nil {
		container.Resources = managedDepResources()
	}
	replicas := int32(1)
	dep := &appsv1.Deployment{
		TypeMeta:   metav1.TypeMeta{APIVersion: "apps/v1", Kind: "Deployment"},
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ti.Namespace, Labels: labels},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: labels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					Containers:      []corev1.Container{container},
					Volumes:         volumes,
					SecurityContext: hardenedPodSecurity(),
				},
			},
		},
	}
	if err := controllerutil.SetControllerReference(ti, dep, r.Scheme); err != nil {
		return err
	}
	return r.applySSA(ctx, dep)
}

// applyManagedService applies a ClusterIP Service fronting a managed dependency.
func (r *TrussInstanceReconciler) applyManagedService(ctx context.Context, ti *appsv1alpha1.TrussInstance, name, comp string, ports []corev1.ServicePort) error {
	labels := componentLabels(ti, comp)
	svc := &corev1.Service{
		TypeMeta:   metav1.TypeMeta{APIVersion: "v1", Kind: "Service"},
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ti.Namespace, Labels: labels},
		Spec:       corev1.ServiceSpec{Selector: labels, Ports: ports},
	}
	if err := controllerutil.SetControllerReference(ti, svc, r.Scheme); err != nil {
		return err
	}
	return r.applySSA(ctx, svc)
}

// ensureManagedStorage provisions RustFS (S3-compatible, Apache-2.0): a generated
// credential Secret, a PVC, a Deployment, and a Service. Gates on readiness.
func (r *TrussInstanceReconciler) ensureManagedStorage(ctx context.Context, ti *appsv1alpha1.TrussInstance) (depResult, error) {
	if err := r.ensureGeneratedSecret(ctx, ti, storageSecretName(ti), map[string]int{"STORAGE_ACCESS_KEY": 12, "STORAGE_SECRET_KEY": 24}); err != nil {
		return depResult{}, err
	}
	// PVC for the object store's data.
	pvc := &corev1.PersistentVolumeClaim{
		TypeMeta:   metav1.TypeMeta{APIVersion: "v1", Kind: "PersistentVolumeClaim"},
		ObjectMeta: metav1.ObjectMeta{Name: storageName(ti) + "-data", Namespace: ti.Namespace, Labels: componentLabels(ti, "rustfs")},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
			Resources:   corev1.VolumeResourceRequirements{Requests: corev1.ResourceList{corev1.ResourceStorage: resource.MustParse("5Gi")}},
		},
	}
	if err := controllerutil.SetControllerReference(ti, pvc, r.Scheme); err != nil {
		return depResult{}, err
	}
	// A PVC's spec is immutable after creation; create-if-absent rather than SSA.
	if err := r.Get(ctx, client.ObjectKeyFromObject(pvc), &corev1.PersistentVolumeClaim{}); apierrors.IsNotFound(err) {
		if err := r.Create(ctx, pvc); err != nil {
			return depResult{}, err
		}
	} else if err != nil {
		return depResult{}, err
	}

	secEnv := func(key string) corev1.EnvVar {
		return corev1.EnvVar{Name: key, ValueFrom: &corev1.EnvVarSource{SecretKeyRef: &corev1.SecretKeySelector{
			LocalObjectReference: corev1.LocalObjectReference{Name: storageSecretName(ti)}, Key: key,
		}}}
	}
	container := corev1.Container{
		Name:  "rustfs",
		Image: rustfsImage,
		Env: []corev1.EnvVar{
			{Name: "RUSTFS_ACCESS_KEY", ValueFrom: secEnv("STORAGE_ACCESS_KEY").ValueFrom},
			{Name: "RUSTFS_SECRET_KEY", ValueFrom: secEnv("STORAGE_SECRET_KEY").ValueFrom},
			{Name: "RUSTFS_VOLUMES", Value: "/data"},
		},
		Ports:          []corev1.ContainerPort{{Name: "s3", ContainerPort: storageS3Port}, {Name: "console", ContainerPort: storageConsolePort}},
		VolumeMounts:   []corev1.VolumeMount{{Name: "data", MountPath: "/data"}},
		ReadinessProbe: tcpProbe(storageS3Port),
	}
	volumes := []corev1.Volume{{Name: "data", VolumeSource: corev1.VolumeSource{PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: storageName(ti) + "-data"}}}}
	if err := r.applyManagedWorkload(ctx, ti, storageName(ti), "rustfs", container, volumes); err != nil {
		return depResult{}, err
	}
	if err := r.applyManagedService(ctx, ti, storageName(ti), "rustfs",
		[]corev1.ServicePort{{Name: "s3", Port: storageS3Port, TargetPort: intstr.FromInt32(storageS3Port)}, {Name: "console", Port: storageConsolePort, TargetPort: intstr.FromInt32(storageConsolePort)}}); err != nil {
		return depResult{}, err
	}
	ready, err := r.managedDeploymentReady(ctx, ti, storageName(ti))
	if err != nil {
		return depResult{}, err
	}
	if !ready {
		return depResult{reason: "StorageProvisioning", msg: "managed RustFS storage is starting"}, nil
	}
	return depResult{ready: true, reason: "ManagedStorageReady", msg: "operator-managed RustFS is ready"}, nil
}

// ensureManagedCache provisions Valkey (Redis-compatible): a generated password
// Secret, an ephemeral Deployment, and a Service. Gates on readiness.
func (r *TrussInstanceReconciler) ensureManagedCache(ctx context.Context, ti *appsv1alpha1.TrussInstance) (depResult, error) {
	if err := r.ensureGeneratedSecret(ctx, ti, cacheSecretName(ti), map[string]int{"VALKEY_PASSWORD": 16}); err != nil {
		return depResult{}, err
	}
	container := corev1.Container{
		Name:  "valkey",
		Image: valkeyImage,
		Env: []corev1.EnvVar{{Name: "VALKEY_PASSWORD", ValueFrom: &corev1.EnvVarSource{SecretKeyRef: &corev1.SecretKeySelector{
			LocalObjectReference: corev1.LocalObjectReference{Name: cacheSecretName(ti)}, Key: "VALKEY_PASSWORD",
		}}}},
		// Ephemeral cache: persistence off (restart = empty cache, the right default).
		Command:        []string{"sh", "-c", `exec valkey-server --requirepass "$VALKEY_PASSWORD" --save "" --appendonly no`},
		Ports:          []corev1.ContainerPort{{Name: "valkey", ContainerPort: cachePort}},
		ReadinessProbe: tcpProbe(cachePort),
	}
	if err := r.applyManagedWorkload(ctx, ti, cacheName(ti), "valkey", container, nil); err != nil {
		return depResult{}, err
	}
	if err := r.applyManagedService(ctx, ti, cacheName(ti), "valkey",
		[]corev1.ServicePort{{Name: "valkey", Port: cachePort, TargetPort: intstr.FromInt32(cachePort)}}); err != nil {
		return depResult{}, err
	}
	ready, err := r.managedDeploymentReady(ctx, ti, cacheName(ti))
	if err != nil {
		return depResult{}, err
	}
	if !ready {
		return depResult{reason: "CacheProvisioning", msg: "managed Valkey cache is starting"}, nil
	}
	return depResult{ready: true, reason: "ManagedCacheReady", msg: "operator-managed Valkey is ready"}, nil
}

// ensureManagedFlags provisions flagd (CNCF OpenFeature): a seed ConfigMap, a
// Deployment, and a Service. Gates on readiness.
func (r *TrussInstanceReconciler) ensureManagedFlags(ctx context.Context, ti *appsv1alpha1.TrussInstance) (depResult, error) {
	cm := &corev1.ConfigMap{
		TypeMeta:   metav1.TypeMeta{APIVersion: "v1", Kind: "ConfigMap"},
		ObjectMeta: metav1.ObjectMeta{Name: flagsName(ti), Namespace: ti.Namespace, Labels: componentLabels(ti, "flagd")},
		Data: map[string]string{"flags.json": `{
  "$schema": "https://flagd.dev/schema/v0/flags.json",
  "flags": {
    "truss-healthcheck": { "state": "ENABLED", "variants": { "on": true, "off": false }, "defaultVariant": "on" }
  }
}`},
	}
	if err := controllerutil.SetControllerReference(ti, cm, r.Scheme); err != nil {
		return depResult{}, err
	}
	if err := r.applySSA(ctx, cm); err != nil {
		return depResult{}, err
	}
	container := corev1.Container{
		Name:           "flagd",
		Image:          flagdImage,
		Args:           []string{"start", "--uri", "file:/etc/flagd/flags.json", "--port", "8013", "--management-port", "8014", "--log-format", "json"},
		Ports:          []corev1.ContainerPort{{Name: "flagd", ContainerPort: flagsPort}, {Name: "mgmt", ContainerPort: flagsMgmtPort}},
		VolumeMounts:   []corev1.VolumeMount{{Name: "flags", MountPath: "/etc/flagd"}},
		ReadinessProbe: tcpProbe(flagsPort),
	}
	volumes := []corev1.Volume{{Name: "flags", VolumeSource: corev1.VolumeSource{ConfigMap: &corev1.ConfigMapVolumeSource{LocalObjectReference: corev1.LocalObjectReference{Name: flagsName(ti)}}}}}
	if err := r.applyManagedWorkload(ctx, ti, flagsName(ti), "flagd", container, volumes); err != nil {
		return depResult{}, err
	}
	if err := r.applyManagedService(ctx, ti, flagsName(ti), "flagd",
		[]corev1.ServicePort{{Name: "flagd", Port: flagsPort, TargetPort: intstr.FromInt32(flagsPort)}, {Name: "mgmt", Port: flagsMgmtPort, TargetPort: intstr.FromInt32(flagsMgmtPort)}}); err != nil {
		return depResult{}, err
	}
	ready, err := r.managedDeploymentReady(ctx, ti, flagsName(ti))
	if err != nil {
		return depResult{}, err
	}
	if !ready {
		return depResult{reason: "FlagsProvisioning", msg: "managed flagd is starting"}, nil
	}
	return depResult{ready: true, reason: "ManagedFlagsReady", msg: "operator-managed flagd is ready"}, nil
}
