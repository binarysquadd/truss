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
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

// finalizerName gates deletion so the controller can run ordered cleanup before
// Kubernetes removes the TrussInstance object.
const finalizerName = "trussinstance.apps.truss.binarysquad.org/finalizer"

// Condition types reported on TrussInstance.Status.Conditions.
const (
	// condReady is True when the whole instance is serving as desired.
	condReady = "Ready"
	// condProgressing is True while the instance is being created/updated.
	condProgressing = "Progressing"
	// condDependenciesReady is True when every configured dependency resolved.
	condDependenciesReady = "DependenciesReady"
)

// Phase values for the human-facing status column.
const (
	phasePending      = "Pending"
	phaseProvisioning = "Provisioning"
	phaseReady        = "Ready"
	phaseDegraded     = "Degraded"
)

// setCondition upserts a status condition, stamping the current generation so
// clients can tell whether a condition reflects the latest spec.
func setCondition(ti *appsv1alpha1.TrussInstance, condType string, status metav1.ConditionStatus, reason, msg string) {
	meta.SetStatusCondition(&ti.Status.Conditions, metav1.Condition{
		Type:               condType,
		Status:             status,
		Reason:             reason,
		Message:            msg,
		ObservedGeneration: ti.Generation,
	})
}
