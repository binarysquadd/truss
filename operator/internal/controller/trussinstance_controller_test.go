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
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
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

		It("gates on missing deps, applies the api workload once ready, then finalizes on delete", func() {
			ti := &appsv1alpha1.TrussInstance{}

			By("first reconcile adds the finalizer")
			reconcileOnce()
			Expect(k8sClient.Get(ctx, key, ti)).To(Succeed())
			Expect(controllerutil.ContainsFinalizer(ti, finalizerName)).To(BeTrue())

			By("reconcile gates while the postgres secret is missing")
			reconcileOnce()
			Expect(k8sClient.Get(ctx, key, ti)).To(Succeed())
			Expect(ti.Status.Phase).To(Equal(phasePending))
			Expect(meta.IsStatusConditionFalse(ti.Status.Conditions, condDependenciesReady)).To(BeTrue())
			Expect(errors.IsNotFound(k8sClient.Get(ctx, apiKey, &appsv1.Deployment{}))).To(BeTrue())

			By("creating the postgres secret unblocks the rollout")
			Expect(k8sClient.Create(ctx, &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{Name: "truss-db", Namespace: resourceNamespace},
				Data:       map[string][]byte{"database-url": []byte("postgres://user:pass@host:5432/truss")},
			})).To(Succeed())
			reconcileOnce()
			Expect(k8sClient.Get(ctx, apiKey, &appsv1.Deployment{})).To(Succeed())
			Expect(k8sClient.Get(ctx, key, ti)).To(Succeed())
			Expect(ti.Status.Phase).To(Equal(phaseReady))
			Expect(ti.Status.ObservedGeneration).To(Equal(ti.Generation))

			By("delete + reconcile removes the finalizer and the object")
			Expect(k8sClient.Delete(ctx, ti)).To(Succeed())
			reconcileOnce()
			Expect(errors.IsNotFound(k8sClient.Get(ctx, key, ti))).To(BeTrue())
		})
	})
})
