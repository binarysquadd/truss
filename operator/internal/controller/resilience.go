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
	"net/url"

	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	policyv1 "k8s.io/api/policy/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

// hostFromURL extracts the host from a publicURL like "https://truss.example.org".
func hostFromURL(publicURL string) string {
	u, err := url.Parse(publicURL)
	if err != nil || u.Host == "" {
		return publicURL // best-effort: treat the value as a bare host
	}
	return u.Host
}

// topologyConstraints spreads a component's pods across hosts and zones (soft),
// so the loss of a single node or zone cannot take every replica at once.
func topologyConstraints(labels map[string]string) []corev1.TopologySpreadConstraint {
	sel := &metav1.LabelSelector{MatchLabels: labels}
	return []corev1.TopologySpreadConstraint{
		{MaxSkew: 1, TopologyKey: "kubernetes.io/hostname", WhenUnsatisfiable: corev1.ScheduleAnyway, LabelSelector: sel},
		{MaxSkew: 1, TopologyKey: "topology.kubernetes.io/zone", WhenUnsatisfiable: corev1.ScheduleAnyway, LabelSelector: sel},
	}
}

func (r *TrussInstanceReconciler) desiredIngress(ti *appsv1alpha1.TrussInstance) (*networkingv1.Ingress, error) {
	host := hostFromURL(ti.Spec.PublicURL)
	pathType := networkingv1.PathTypePrefix
	backend := func(comp string, port int32) networkingv1.IngressBackend {
		return networkingv1.IngressBackend{Service: &networkingv1.IngressServiceBackend{
			Name: ti.Name + "-" + comp,
			Port: networkingv1.ServiceBackendPort{Number: port},
		}}
	}
	ing := &networkingv1.Ingress{
		TypeMeta: metav1.TypeMeta{APIVersion: "networking.k8s.io/v1", Kind: "Ingress"},
		ObjectMeta: metav1.ObjectMeta{
			Name:        ti.Name,
			Namespace:   ti.Namespace,
			Labels:      componentLabels(ti, "ingress"),
			Annotations: ti.Spec.Ingress.Annotations,
		},
		Spec: networkingv1.IngressSpec{
			IngressClassName: ti.Spec.Ingress.ClassName,
			Rules: []networkingv1.IngressRule{{
				Host: host,
				IngressRuleValue: networkingv1.IngressRuleValue{HTTP: &networkingv1.HTTPIngressRuleValue{
					// More-specific /api first so it wins over the dashboard catch-all.
					Paths: []networkingv1.HTTPIngressPath{
						{Path: "/api", PathType: &pathType, Backend: backend("api", apiPort)},
						{Path: "/", PathType: &pathType, Backend: backend("dashboard", dashboardPort)},
					},
				}},
			}},
		},
	}
	if ti.Spec.Ingress.TLS {
		ing.Spec.TLS = []networkingv1.IngressTLS{{Hosts: []string{host}, SecretName: ti.Name + "-tls"}}
	}
	if err := controllerutil.SetControllerReference(ti, ing, r.Scheme); err != nil {
		return nil, err
	}
	return ing, nil
}

func (r *TrussInstanceReconciler) desiredPDB(ti *appsv1alpha1.TrussInstance, comp string) (*policyv1.PodDisruptionBudget, error) {
	labels := componentLabels(ti, comp)
	minAvail := intstr.FromInt32(1)
	if ti.Spec.Resilience.PDB.MinAvailable != nil {
		minAvail = *ti.Spec.Resilience.PDB.MinAvailable
	}
	pdb := &policyv1.PodDisruptionBudget{
		TypeMeta:   metav1.TypeMeta{APIVersion: "policy/v1", Kind: "PodDisruptionBudget"},
		ObjectMeta: metav1.ObjectMeta{Name: ti.Name + "-" + comp, Namespace: ti.Namespace, Labels: labels},
		Spec: policyv1.PodDisruptionBudgetSpec{
			MinAvailable: &minAvail,
			Selector:     &metav1.LabelSelector{MatchLabels: labels},
		},
	}
	if err := controllerutil.SetControllerReference(ti, pdb, r.Scheme); err != nil {
		return nil, err
	}
	return pdb, nil
}

// desiredResilience returns the optional ingress + PDB objects to apply, based on
// the spec toggles. (Topology-spread lives on the Deployment pod templates.)
func (r *TrussInstanceReconciler) desiredResilience(ti *appsv1alpha1.TrussInstance) ([]client.Object, error) {
	var objs []client.Object
	if ti.Spec.Ingress.Enabled {
		ing, err := r.desiredIngress(ti)
		if err != nil {
			return nil, err
		}
		objs = append(objs, ing)
	}
	if ti.Spec.Resilience.PDB.Enabled {
		for _, comp := range []string{"api", "dashboard"} {
			pdb, err := r.desiredPDB(ti, comp)
			if err != nil {
				return nil, err
			}
			objs = append(objs, pdb)
		}
	}
	return objs, nil
}
