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
	"github.com/prometheus/client_golang/prometheus"
	"sigs.k8s.io/controller-runtime/pkg/metrics"
)

// reconcileTotal counts TrussInstance reconciliations by outcome. It is exposed on
// the controller-runtime metrics endpoint (/metrics), alongside the built-in
// controller_runtime_* metrics, and scraped via the shipped ServiceMonitor.
var reconcileTotal = prometheus.NewCounterVec(
	prometheus.CounterOpts{
		Name: "truss_operator_reconcile_total",
		Help: "Total TrussInstance reconciliations by result (success|error).",
	},
	[]string{"result"},
)

func init() {
	metrics.Registry.MustRegister(reconcileTotal)
}
