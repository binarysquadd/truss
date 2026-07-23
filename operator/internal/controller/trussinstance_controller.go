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

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/util/intstr"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

// TrussInstanceReconciler reconciles a TrussInstance object
type TrussInstanceReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

// +kubebuilder:rbac:groups=apps.truss.binarysquad.org,resources=trussinstances,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=apps.truss.binarysquad.org,resources=trussinstances/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=apps.truss.binarysquad.org,resources=trussinstances/finalizers,verbs=update
// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=core,resources=services,verbs=get;list;watch;create;update;patch;delete

// Reconcile moves the cluster toward the desired state described by a TrussInstance:
// it ensures the truss-api Deployment and Service exist and match the spec.
func (r *TrussInstanceReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	// 1. Fetch the desired state. NotFound means the TrussInstance was deleted;
	//    its owned objects are garbage-collected automatically via owner refs, so
	//    there is nothing for us to do.
	var ti appsv1alpha1.TrussInstance
	if err := r.Get(ctx, req.NamespacedName, &ti); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	// 2. Make the truss-api Deployment match the spec (create or update).
	if err := r.reconcileAPIDeployment(ctx, &ti); err != nil {
		return ctrl.Result{}, err
	}

	// 3. Make the truss-api Service match.
	if err := r.reconcileAPIService(ctx, &ti); err != nil {
		return ctrl.Result{}, err
	}

	log.Info("reconciled TrussInstance", "name", ti.Name, "apiReplicas", ti.Spec.Replicas.API)
	return ctrl.Result{}, nil
}

// apiLabels are the labels applied to (and selected by) the api workload.
func apiLabels(ti *appsv1alpha1.TrussInstance) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name":       "truss-api",
		"app.kubernetes.io/instance":   ti.Name,
		"app.kubernetes.io/managed-by": "truss-operator",
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
	if ti.Spec.DatabaseSecret != "" {
		env = append(env, corev1.EnvVar{
			Name: "DATABASE_URL",
			ValueFrom: &corev1.EnvVarSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: ti.Spec.DatabaseSecret},
					Key:                  "database-url",
				},
			},
		})
	}
	return env
}

func (r *TrussInstanceReconciler) reconcileAPIDeployment(ctx context.Context, ti *appsv1alpha1.TrussInstance) error {
	labels := apiLabels(ti)
	replicas := ti.Spec.Replicas.API

	dep := &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: ti.Name + "-api", Namespace: ti.Namespace}}
	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, dep, func() error {
		dep.Labels = labels
		dep.Spec.Replicas = &replicas
		dep.Spec.Selector = &metav1.LabelSelector{MatchLabels: labels}
		dep.Spec.Template.Labels = labels
		dep.Spec.Template.Spec.Containers = []corev1.Container{{
			Name:  "api",
			Image: "ghcr.io/binarysquadd/truss-api:" + ti.Spec.Version,
			Ports: []corev1.ContainerPort{{Name: "http", ContainerPort: 8787}},
			Env:   apiEnv(ti),
		}}
		// Owner reference: ties this Deployment's lifecycle to the TrussInstance.
		// Delete the TrussInstance and Kubernetes garbage-collects this Deployment.
		return controllerutil.SetControllerReference(ti, dep, r.Scheme)
	})
	return err
}

func (r *TrussInstanceReconciler) reconcileAPIService(ctx context.Context, ti *appsv1alpha1.TrussInstance) error {
	labels := apiLabels(ti)

	svc := &corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: ti.Name + "-api", Namespace: ti.Namespace}}
	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, svc, func() error {
		svc.Labels = labels
		svc.Spec.Selector = labels
		svc.Spec.Ports = []corev1.ServicePort{{
			Name:       "http",
			Port:       8787,
			TargetPort: intstr.FromInt32(8787),
		}}
		return controllerutil.SetControllerReference(ti, svc, r.Scheme)
	})
	return err
}

// SetupWithManager sets up the controller with the Manager.
// Owns() makes the controller re-reconcile when an owned Deployment/Service
// changes, so if someone edits or deletes them, the operator heals them back.
func (r *TrussInstanceReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&appsv1alpha1.TrussInstance{}).
		Owns(&appsv1.Deployment{}).
		Owns(&corev1.Service{}).
		Named("trussinstance").
		Complete(r)
}
