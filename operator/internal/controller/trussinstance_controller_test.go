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

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	appsv1 "k8s.io/api/apps/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	appsv1alpha1 "github.com/binarysquadd/truss/operator/api/v1alpha1"
)

var _ = Describe("TrussInstance Controller", func() {
	Context("finalizer + reconcile lifecycle", func() {
		const (
			resourceName      = "test-resource"
			resourceNamespace = "default"
		)

		ctx := context.Background()
		key := types.NamespacedName{Name: resourceName, Namespace: resourceNamespace}
		apiKey := types.NamespacedName{Name: resourceName + "-api", Namespace: resourceNamespace}

		reconciler := func() *TrussInstanceReconciler {
			return &TrussInstanceReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
		}
		reconcileOnce := func() {
			_, err := reconciler().Reconcile(ctx, reconcile.Request{NamespacedName: key})
			Expect(err).NotTo(HaveOccurred())
		}

		BeforeEach(func() {
			resource := &appsv1alpha1.TrussInstance{
				ObjectMeta: metav1.ObjectMeta{Name: resourceName, Namespace: resourceNamespace},
				Spec: appsv1alpha1.TrussInstanceSpec{
					Version: "0.2.0",
					Dependencies: appsv1alpha1.Dependencies{
						Postgres: appsv1alpha1.DepSpec{Mode: "byo", ExistingSecret: "truss-db"},
					},
				},
			}
			Expect(k8sClient.Create(ctx, resource)).To(Succeed())
		})

		It("adds a finalizer, applies the api workload, then finalizes on delete", func() {
			ti := &appsv1alpha1.TrussInstance{}

			By("first reconcile adds the finalizer")
			reconcileOnce()
			Expect(k8sClient.Get(ctx, key, ti)).To(Succeed())
			Expect(controllerutil.ContainsFinalizer(ti, finalizerName)).To(BeTrue())

			By("second reconcile creates the api Deployment and marks Ready")
			reconcileOnce()
			Expect(k8sClient.Get(ctx, apiKey, &appsv1.Deployment{})).To(Succeed())
			Expect(k8sClient.Get(ctx, key, ti)).To(Succeed())
			Expect(ti.Status.Phase).To(Equal(phaseReady))
			Expect(ti.Status.ObservedGeneration).To(Equal(ti.Generation))

			By("delete + reconcile removes the finalizer and the object")
			Expect(k8sClient.Delete(ctx, ti)).To(Succeed())
			reconcileOnce()
			err := k8sClient.Get(ctx, key, ti)
			Expect(errors.IsNotFound(err)).To(BeTrue())
		})
	})
})
