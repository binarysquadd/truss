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
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	policyv1 "k8s.io/api/policy/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
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
// +kubebuilder:rbac:groups=core,resources=secrets,verbs=get;list;watch
// +kubebuilder:rbac:groups=networking.k8s.io,resources=ingresses,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=policy,resources=poddisruptionbudgets,verbs=get;list;watch;create;update;patch;delete

// Reconcile moves the cluster toward the desired state described by a TrussInstance.
// It is level-triggered and idempotent: it re-derives the whole desired state every
// run, so calling it a thousand times is safe.
func (r *TrussInstanceReconciler) Reconcile(ctx context.Context, req ctrl.Request) (result ctrl.Result, err error) {
	defer func() {
		outcome := "success"
		if err != nil {
			outcome = "error"
		}
		reconcileTotal.WithLabelValues(outcome).Inc()
	}()
	log := logf.FromContext(ctx)

	// Fetch desired state. NotFound means the object is gone; owned objects are
	// garbage-collected via owner refs, so there is nothing to do.
	var ti appsv1alpha1.TrussInstance
	if err := r.Get(ctx, req.NamespacedName, &ti); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	// Deletion: run finalizer cleanup, then release the object.
	if !ti.DeletionTimestamp.IsZero() {
		if controllerutil.ContainsFinalizer(&ti, finalizerName) {
			// v1 owns only objects with owner refs, which Kubernetes GCs for us;
			// the finalizer is the seam for ordered teardown of managed deps (v2).
			log.Info("finalizing TrussInstance", "name", ti.Name)
			controllerutil.RemoveFinalizer(&ti, finalizerName)
			if err := r.Update(ctx, &ti); err != nil {
				return ctrl.Result{}, err
			}
		}
		return ctrl.Result{}, nil
	}

	// Ensure the finalizer is present before creating anything. Returning here lets
	// the resulting update event trigger a fresh reconcile with a current object.
	if controllerutil.AddFinalizer(&ti, finalizerName) {
		if err := r.Update(ctx, &ti); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Dependency-readiness gating: do not roll the app tier until every configured
	// dependency resolves. Level-triggered ordering, surfaced as a condition.
	dep, err := r.resolveDeps(ctx, &ti)
	if err != nil {
		return ctrl.Result{}, err
	}
	if !dep.ready {
		setCondition(&ti, condDependenciesReady, metav1.ConditionFalse, dep.reason, dep.msg)
		setCondition(&ti, condProgressing, metav1.ConditionTrue, "WaitingForDependencies", dep.msg)
		ti.Status.ObservedGeneration = ti.Generation
		ti.Status.Phase = phasePending
		if err := r.Status().Update(ctx, &ti); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{RequeueAfter: 15 * time.Second}, nil
	}
	setCondition(&ti, condDependenciesReady, metav1.ConditionTrue, dep.reason, dep.msg)

	// App tier via Server-Side Apply: build the desired api + dashboard objects and
	// apply each. SSA is idempotent and heals drift on the fields the operator owns.
	objs, err := r.desiredAppTier(&ti)
	if err != nil {
		return ctrl.Result{}, err
	}
	for _, o := range objs {
		if err := r.applySSA(ctx, o); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Resilience: optional ingress + PodDisruptionBudgets, gated on spec toggles.
	// (Topology-spread is baked into the Deployment pod templates above.)
	resObjs, err := r.desiredResilience(&ti)
	if err != nil {
		return ctrl.Result{}, err
	}
	for _, o := range resObjs {
		if err := r.applySSA(ctx, o); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Status: read live per-component readiness and derive the phase honestly.
	apiCS, err := r.componentReadiness(ctx, &ti, "api", replicasOf(ti.Spec.Components.API))
	if err != nil {
		return ctrl.Result{}, err
	}
	dashCS, err := r.componentReadiness(ctx, &ti, "dashboard", replicasOf(ti.Spec.Components.Dashboard))
	if err != nil {
		return ctrl.Result{}, err
	}
	ti.Status.ComponentStatus = appsv1alpha1.ComponentStatuses{API: apiCS, Dashboard: dashCS}
	ti.Status.ObservedGeneration = ti.Generation

	fullyReady := apiCS.Ready >= apiCS.Desired && dashCS.Ready >= dashCS.Desired
	if fullyReady {
		ti.Status.Phase = phaseReady
		setCondition(&ti, condReady, metav1.ConditionTrue, "AllComponentsReady", "all components have their desired replicas ready")
		setCondition(&ti, condProgressing, metav1.ConditionFalse, "Reconciled", "steady state")
	} else {
		ti.Status.Phase = phaseProvisioning
		setCondition(&ti, condReady, metav1.ConditionFalse, "ComponentsNotReady", "waiting for components to become ready")
		setCondition(&ti, condProgressing, metav1.ConditionTrue, "Provisioning", "components are starting")
	}
	if err := r.Status().Update(ctx, &ti); err != nil {
		return ctrl.Result{}, err
	}

	log.Info("reconciled TrussInstance", "name", ti.Name, "phase", ti.Status.Phase)
	if !fullyReady {
		// Re-check readiness until pods come up; watches also re-trigger us.
		return ctrl.Result{RequeueAfter: 10 * time.Second}, nil
	}
	return ctrl.Result{}, nil
}

// SetupWithManager sets up the controller with the Manager.
// Owns() makes the controller re-reconcile when an owned Deployment/Service
// changes, so if someone edits or deletes them, the operator heals them back.
func (r *TrussInstanceReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&appsv1alpha1.TrussInstance{}).
		Owns(&appsv1.Deployment{}).
		Owns(&corev1.Service{}).
		Owns(&networkingv1.Ingress{}).
		Owns(&policyv1.PodDisruptionBudget{}).
		Named("trussinstance").
		Complete(r)
}
