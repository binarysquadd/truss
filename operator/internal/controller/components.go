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
	"encoding/json"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/apimachinery/pkg/util/strategicpatch"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

const (
	apiImageRepo       = "ghcr.io/binarysquadd/truss-api"
	dashboardImageRepo = "ghcr.io/binarysquadd/truss-dashboard"
	apiPort            = int32(8787)
	dashboardPort      = int32(80)
)

// componentLabels are applied to and selected by a component's workload.
func componentLabels(ti *appsv1alpha1.TrussInstance, comp string) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name":       "truss-" + comp,
		"app.kubernetes.io/instance":   ti.Name,
		"app.kubernetes.io/component":  comp,
		"app.kubernetes.io/managed-by": "truss-operator",
	}
}

// profileResources maps a scaling profile to container resource requirements.
func profileResources(profile string) corev1.ResourceRequirements {
	list := func(cpu, mem string) corev1.ResourceList {
		return corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse(cpu),
			corev1.ResourceMemory: resource.MustParse(mem),
		}
	}
	switch profile {
	case "large":
		return corev1.ResourceRequirements{Requests: list("500m", "512Mi"), Limits: list("2", "2Gi")}
	case "medium":
		return corev1.ResourceRequirements{Requests: list("250m", "256Mi"), Limits: list("1", "1Gi")}
	default: // small (dev)
		return corev1.ResourceRequirements{Requests: list("100m", "128Mi"), Limits: list("500m", "512Mi")}
	}
}

// resourcesFor returns the component's explicit override, else the profile default.
func resourcesFor(comp appsv1alpha1.ComponentSpec, profile string) corev1.ResourceRequirements {
	if comp.Resources != nil {
		return *comp.Resources
	}
	return profileResources(profile)
}

// replicasOf defaults a component's replica count to 1 when unset.
func replicasOf(comp appsv1alpha1.ComponentSpec) int32 {
	if comp.Replicas <= 0 {
		return 1
	}
	return comp.Replicas
}

func tcpProbe(port int32) *corev1.Probe {
	return &corev1.Probe{
		ProbeHandler:        corev1.ProbeHandler{TCPSocket: &corev1.TCPSocketAction{Port: intstr.FromInt32(port)}},
		InitialDelaySeconds: 5,
		PeriodSeconds:       10,
	}
}

func httpGetProbe(path string, port int32) *corev1.Probe {
	return &corev1.Probe{
		ProbeHandler:        corev1.ProbeHandler{HTTPGet: &corev1.HTTPGetAction{Path: path, Port: intstr.FromInt32(port)}},
		InitialDelaySeconds: 5,
		PeriodSeconds:       10,
	}
}

// apiEnv builds the environment for the api container from the spec.
func apiEnv(ti *appsv1alpha1.TrussInstance) []corev1.EnvVar {
	env := []corev1.EnvVar{
		{Name: "NODE_ENV", Value: "production"},
		{Name: "API_PORT", Value: "8787"},
	}
	if ti.Spec.PublicURL != "" {
		env = append(env, corev1.EnvVar{Name: "TRUSS_PUBLIC_URL", Value: ti.Spec.PublicURL})
	}
	if ti.Spec.Dependencies.Postgres.ExistingSecret != "" {
		env = append(env, corev1.EnvVar{
			Name: "DATABASE_URL",
			ValueFrom: &corev1.EnvVarSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: ti.Spec.Dependencies.Postgres.ExistingSecret},
					Key:                  "database-url",
				},
			},
		})
	}
	return env
}

// applyPodTemplateOverride strategic-merges the user's podTemplate escape-hatch
// patch over the operator-generated pod template, so an SRE can add sidecars,
// tolerations, nodeSelectors, or extra volumes without forking the operator.
func applyPodTemplateOverride(base corev1.PodTemplateSpec, override *runtime.RawExtension) (corev1.PodTemplateSpec, error) {
	if override == nil || len(override.Raw) == 0 {
		return base, nil
	}
	baseJSON, err := json.Marshal(base)
	if err != nil {
		return base, err
	}
	merged, err := strategicpatch.StrategicMergePatch(baseJSON, override.Raw, corev1.PodTemplateSpec{})
	if err != nil {
		return base, err
	}
	var out corev1.PodTemplateSpec
	if err := json.Unmarshal(merged, &out); err != nil {
		return base, err
	}
	return out, nil
}

func (r *TrussInstanceReconciler) desiredAPIDeployment(ti *appsv1alpha1.TrussInstance) (*appsv1.Deployment, error) {
	labels := componentLabels(ti, "api")
	replicas := replicasOf(ti.Spec.Components.API)
	tmpl := corev1.PodTemplateSpec{
		ObjectMeta: metav1.ObjectMeta{Labels: labels},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{{
				Name:           "api",
				Image:          apiImageRepo + ":" + ti.Spec.Version,
				Ports:          []corev1.ContainerPort{{Name: "http", ContainerPort: apiPort}},
				Env:            apiEnv(ti),
				Resources:      resourcesFor(ti.Spec.Components.API, ti.Spec.Scaling.Profile),
				ReadinessProbe: tcpProbe(apiPort),
			}},
		},
	}
	if ti.Spec.Resilience.TopologySpread {
		tmpl.Spec.TopologySpreadConstraints = topologyConstraints(labels)
	}
	tmpl, err := applyPodTemplateOverride(tmpl, ti.Spec.Components.API.PodTemplate)
	if err != nil {
		return nil, err
	}
	dep := &appsv1.Deployment{
		TypeMeta:   metav1.TypeMeta{APIVersion: "apps/v1", Kind: "Deployment"},
		ObjectMeta: metav1.ObjectMeta{Name: ti.Name + "-api", Namespace: ti.Namespace, Labels: labels},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: labels},
			Template: tmpl,
		},
	}
	if err := controllerutil.SetControllerReference(ti, dep, r.Scheme); err != nil {
		return nil, err
	}
	return dep, nil
}

func (r *TrussInstanceReconciler) desiredDashboardDeployment(ti *appsv1alpha1.TrussInstance) (*appsv1.Deployment, error) {
	labels := componentLabels(ti, "dashboard")
	replicas := replicasOf(ti.Spec.Components.Dashboard)
	tmpl := corev1.PodTemplateSpec{
		ObjectMeta: metav1.ObjectMeta{Labels: labels},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{{
				Name:           "dashboard",
				Image:          dashboardImageRepo + ":" + ti.Spec.Version,
				Ports:          []corev1.ContainerPort{{Name: "http", ContainerPort: dashboardPort}},
				Resources:      resourcesFor(ti.Spec.Components.Dashboard, ti.Spec.Scaling.Profile),
				ReadinessProbe: httpGetProbe("/", dashboardPort),
			}},
		},
	}
	if ti.Spec.Resilience.TopologySpread {
		tmpl.Spec.TopologySpreadConstraints = topologyConstraints(labels)
	}
	tmpl, err := applyPodTemplateOverride(tmpl, ti.Spec.Components.Dashboard.PodTemplate)
	if err != nil {
		return nil, err
	}
	dep := &appsv1.Deployment{
		TypeMeta:   metav1.TypeMeta{APIVersion: "apps/v1", Kind: "Deployment"},
		ObjectMeta: metav1.ObjectMeta{Name: ti.Name + "-dashboard", Namespace: ti.Namespace, Labels: labels},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: labels},
			Template: tmpl,
		},
	}
	if err := controllerutil.SetControllerReference(ti, dep, r.Scheme); err != nil {
		return nil, err
	}
	return dep, nil
}

func (r *TrussInstanceReconciler) desiredService(ti *appsv1alpha1.TrussInstance, comp string, port int32) (*corev1.Service, error) {
	labels := componentLabels(ti, comp)
	svc := &corev1.Service{
		TypeMeta:   metav1.TypeMeta{APIVersion: "v1", Kind: "Service"},
		ObjectMeta: metav1.ObjectMeta{Name: ti.Name + "-" + comp, Namespace: ti.Namespace, Labels: labels},
		Spec: corev1.ServiceSpec{
			Selector: labels,
			Ports:    []corev1.ServicePort{{Name: "http", Port: port, TargetPort: intstr.FromInt32(port)}},
		},
	}
	if err := controllerutil.SetControllerReference(ti, svc, r.Scheme); err != nil {
		return nil, err
	}
	return svc, nil
}

// componentReadiness reads the live ready-replica count for a component's
// Deployment and reports it against the desired count.
func (r *TrussInstanceReconciler) componentReadiness(ctx context.Context, ti *appsv1alpha1.TrussInstance, comp string, desired int32) (appsv1alpha1.ComponentStatus, error) {
	dep := &appsv1.Deployment{}
	err := r.Get(ctx, client.ObjectKey{Namespace: ti.Namespace, Name: ti.Name + "-" + comp}, dep)
	if apierrors.IsNotFound(err) {
		return appsv1alpha1.ComponentStatus{Ready: 0, Desired: desired}, nil
	}
	if err != nil {
		return appsv1alpha1.ComponentStatus{}, err
	}
	return appsv1alpha1.ComponentStatus{Ready: dep.Status.ReadyReplicas, Desired: desired}, nil
}

// desiredAppTier returns every app-tier object the operator owns, in apply order.
func (r *TrussInstanceReconciler) desiredAppTier(ti *appsv1alpha1.TrussInstance) ([]client.Object, error) {
	apiDep, err := r.desiredAPIDeployment(ti)
	if err != nil {
		return nil, err
	}
	apiSvc, err := r.desiredService(ti, "api", apiPort)
	if err != nil {
		return nil, err
	}
	dashDep, err := r.desiredDashboardDeployment(ti)
	if err != nil {
		return nil, err
	}
	dashSvc, err := r.desiredService(ti, "dashboard", dashboardPort)
	if err != nil {
		return nil, err
	}
	return []client.Object{apiDep, apiSvc, dashDep, dashSvc}, nil
}
