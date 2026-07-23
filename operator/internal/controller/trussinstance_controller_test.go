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
	networkingv1 "k8s.io/api/networking/v1"
	policyv1 "k8s.io/api/policy/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/intstr"
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
			dashKey := types.NamespacedName{Name: resourceName + "-dashboard", Namespace: resourceNamespace}
			Expect(k8sClient.Get(ctx, apiKey, &appsv1.Deployment{})).To(Succeed())
			Expect(k8sClient.Get(ctx, dashKey, &appsv1.Deployment{})).To(Succeed())
			Expect(k8sClient.Get(ctx, apiKey, &corev1.Service{})).To(Succeed())
			Expect(k8sClient.Get(ctx, dashKey, &corev1.Service{})).To(Succeed())
			Expect(k8sClient.Get(ctx, key, ti)).To(Succeed())
			Expect(ti.Status.Phase).To(Equal(phaseProvisioning))
			Expect(ti.Status.ObservedGeneration).To(Equal(ti.Generation))

			By("pods reporting ready flips the phase to Ready")
			markReady := func(k types.NamespacedName) {
				d := &appsv1.Deployment{}
				Expect(k8sClient.Get(ctx, k, d)).To(Succeed())
				d.Status.ReadyReplicas = 1
				d.Status.Replicas = 1
				Expect(k8sClient.Status().Update(ctx, d)).To(Succeed())
			}
			markReady(apiKey)
			markReady(dashKey)
			reconcileOnce()
			Expect(k8sClient.Get(ctx, key, ti)).To(Succeed())
			Expect(ti.Status.Phase).To(Equal(phaseReady))
			Expect(ti.Status.ComponentStatus.API.Ready).To(Equal(int32(1)))
			Expect(meta.IsStatusConditionTrue(ti.Status.Conditions, condReady)).To(BeTrue())

			By("reconcile is idempotent (SSA re-apply is a no-op)")
			reconcileOnce()

			By("SSA heals drift on owned fields")
			apiDep := &appsv1.Deployment{}
			Expect(k8sClient.Get(ctx, apiKey, apiDep)).To(Succeed())
			five := int32(5)
			apiDep.Spec.Replicas = &five
			Expect(k8sClient.Update(ctx, apiDep)).To(Succeed())
			reconcileOnce()
			Expect(k8sClient.Get(ctx, apiKey, apiDep)).To(Succeed())
			Expect(*apiDep.Spec.Replicas).To(Equal(int32(1)))

			By("delete + reconcile removes the finalizer and the object")
			Expect(k8sClient.Delete(ctx, ti)).To(Succeed())
			reconcileOnce()
			Expect(errors.IsNotFound(k8sClient.Get(ctx, key, ti))).To(BeTrue())
		})
	})

	Context("resilience options", func() {
		const (
			resName = "res-resource"
			ns      = "default"
		)
		ctx := context.Background()
		rkey := types.NamespacedName{Name: resName, Namespace: ns}

		It("applies ingress, PDBs, and topology-spread when enabled", func() {
			Expect(k8sClient.Create(ctx, &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{Name: "res-db", Namespace: ns},
				Data:       map[string][]byte{"database-url": []byte("postgres://x")},
			})).To(Succeed())
			minAvail := intstr.FromInt32(1)
			Expect(k8sClient.Create(ctx, &appsv1alpha1.TrussInstance{
				ObjectMeta: metav1.ObjectMeta{Name: resName, Namespace: ns},
				Spec: appsv1alpha1.TrussInstanceSpec{
					Version:   "0.2.0",
					PublicURL: "https://res.truss.binarysquad.org",
					Dependencies: appsv1alpha1.Dependencies{
						Postgres: appsv1alpha1.DepSpec{Mode: "byo", ExistingSecret: "res-db"},
					},
					Resilience: appsv1alpha1.Resilience{
						PDB:            appsv1alpha1.PDBSpec{Enabled: true, MinAvailable: &minAvail},
						TopologySpread: true,
					},
					Ingress: appsv1alpha1.IngressSpec{Enabled: true},
				},
			})).To(Succeed())

			r := &TrussInstanceReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
			for i := 0; i < 2; i++ { // finalizer, then apply
				_, err := r.Reconcile(ctx, reconcile.Request{NamespacedName: rkey})
				Expect(err).NotTo(HaveOccurred())
			}

			By("ingress exists with the publicURL host")
			ing := &networkingv1.Ingress{}
			Expect(k8sClient.Get(ctx, rkey, ing)).To(Succeed())
			Expect(ing.Spec.Rules[0].Host).To(Equal("res.truss.binarysquad.org"))

			By("PDBs exist for both components")
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: resName + "-api", Namespace: ns}, &policyv1.PodDisruptionBudget{})).To(Succeed())
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: resName + "-dashboard", Namespace: ns}, &policyv1.PodDisruptionBudget{})).To(Succeed())

			By("api deployment carries topology-spread constraints")
			dep := &appsv1.Deployment{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: resName + "-api", Namespace: ns}, dep)).To(Succeed())
			Expect(dep.Spec.Template.Spec.TopologySpreadConstraints).To(HaveLen(2))
		})
	})
})
