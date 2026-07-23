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
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

// Prometheus-operator GVKs the operator can create when asked (and when the CRDs exist).
var (
	serviceMonitorGVK = schema.GroupVersionKind{Group: "monitoring.coreos.com", Version: "v1", Kind: "ServiceMonitor"}
	prometheusRuleGVK = schema.GroupVersionKind{Group: "monitoring.coreos.com", Version: "v1", Kind: "PrometheusRule"}
)

// crdPresent reports whether a kind is registered in the cluster, so the operator can
// skip Prometheus-operator objects gracefully on clusters that don't run it.
func (r *TrussInstanceReconciler) crdPresent(gvk schema.GroupVersionKind) bool {
	_, err := r.RESTMapper().RESTMapping(gvk.GroupKind(), gvk.Version)
	return err == nil
}

func labelsAsAny(m map[string]string) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func (r *TrussInstanceReconciler) desiredServiceMonitor(ti *appsv1alpha1.TrussInstance) (*unstructured.Unstructured, error) {
	labels := componentLabels(ti, "api")
	sm := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "monitoring.coreos.com/v1",
		"kind":       "ServiceMonitor",
		"metadata":   map[string]any{"name": ti.Name + "-api", "namespace": ti.Namespace, "labels": labelsAsAny(labels)},
		"spec": map[string]any{
			"selector":  map[string]any{"matchLabels": labelsAsAny(labels)},
			"endpoints": []any{map[string]any{"port": "http", "path": "/metrics", "interval": "30s"}},
		},
	}}
	if err := controllerutil.SetControllerReference(ti, sm, r.Scheme); err != nil {
		return nil, err
	}
	return sm, nil
}

func (r *TrussInstanceReconciler) desiredPrometheusRule(ti *appsv1alpha1.TrussInstance) (*unstructured.Unstructured, error) {
	// Multi-window burn-rate SLO alerts (99.5%/30d, 0.5% budget) on the RED error ratio.
	rule := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "monitoring.coreos.com/v1",
		"kind":       "PrometheusRule",
		"metadata":   map[string]any{"name": ti.Name + "-api", "namespace": ti.Namespace, "labels": labelsAsAny(componentLabels(ti, "api"))},
		"spec": map[string]any{
			"groups": []any{map[string]any{
				"name": "truss-api.slo",
				"rules": []any{
					map[string]any{
						"alert":       "TrussApiErrorBudgetBurnFast",
						"expr":        "(sum(rate(truss_http_request_duration_seconds_count{status_code=~\"5..\"}[1h]))/sum(rate(truss_http_request_duration_seconds_count[1h])) > (14.4*0.005)) and (sum(rate(truss_http_request_duration_seconds_count{status_code=~\"5..\"}[5m]))/sum(rate(truss_http_request_duration_seconds_count[5m])) > (14.4*0.005))",
						"for":         "2m",
						"labels":      map[string]any{"severity": "critical"},
						"annotations": map[string]any{"summary": "Truss API burning error budget fast (14.4x over 1h and 5m)"},
					},
					map[string]any{
						"alert":       "TrussApiErrorBudgetBurnSlow",
						"expr":        "(sum(rate(truss_http_request_duration_seconds_count{status_code=~\"5..\"}[6h]))/sum(rate(truss_http_request_duration_seconds_count[6h])) > (6*0.005)) and (sum(rate(truss_http_request_duration_seconds_count{status_code=~\"5..\"}[30m]))/sum(rate(truss_http_request_duration_seconds_count[30m])) > (6*0.005))",
						"for":         "15m",
						"labels":      map[string]any{"severity": "warning"},
						"annotations": map[string]any{"summary": "Truss API burning error budget slowly (6x over 6h and 30m)"},
					},
				},
			}},
		},
	}}
	if err := controllerutil.SetControllerReference(ti, rule, r.Scheme); err != nil {
		return nil, err
	}
	return rule, nil
}

// desiredObservability returns the Prometheus-operator objects requested via the spec.
// The caller skips any whose CRD is absent, so this never fails on a plain cluster.
func (r *TrussInstanceReconciler) desiredObservability(ti *appsv1alpha1.TrussInstance) ([]client.Object, error) {
	var objs []client.Object
	if ti.Spec.Observability.ServiceMonitor {
		sm, err := r.desiredServiceMonitor(ti)
		if err != nil {
			return nil, err
		}
		objs = append(objs, sm)
	}
	if ti.Spec.Observability.PrometheusRule {
		pr, err := r.desiredPrometheusRule(ti)
		if err != nil {
			return nil, err
		}
		objs = append(objs, pr)
	}
	return objs, nil
}
