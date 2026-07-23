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

	"sigs.k8s.io/controller-runtime/pkg/client"
)

// fieldManager identifies this controller as the owner of the fields it applies,
// so Server-Side Apply can track ownership per-field across multiple actors.
const fieldManager = "truss-operator"

// applySSA declaratively applies obj via Server-Side Apply.
//
// Why SSA over the classic get-then-CreateOrUpdate: the operator declares only
// the fields it owns (tracked under fieldManager "truss-operator"). ForceOwnership
// resolves conflicts by taking ownership of exactly those fields, so the operator
// heals stray manual edits to fields it manages without fighting other field
// managers on fields it does not set. It is also idempotent by construction: the
// same desired object applied twice is a no-op.
//
// Every applied object MUST carry its GVK (TypeMeta), since an apply patch is
// content-addressed by apiVersion+kind. The desired-object builders set it.
func (r *TrussInstanceReconciler) applySSA(ctx context.Context, obj client.Object) error {
	return r.Patch(ctx, obj, client.Apply, client.FieldOwner(fieldManager), client.ForceOwnership)
}
