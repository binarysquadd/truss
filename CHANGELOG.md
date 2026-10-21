# Changelog

## [0.4.1](https://github.com/binarysquadd/truss/compare/v0.4.0...v0.4.1) (2026-10-21)


### Bug Fixes

* **api:** create the anon/authenticated RLS roles on the main database at startup ([ffc0c85](https://github.com/binarysquadd/truss/commit/ffc0c851d3984e0f300d18634ab544a2fdd3095d))
* finish the dashboard unprivileged-nginx migration to :8080 ([ebf2960](https://github.com/binarysquadd/truss/commit/ebf296075e028329bc980b59d130e0f4a8c0cb52))

## [0.4.0](https://github.com/binarysquadd/truss/compare/v0.3.0...v0.4.0) (2026-10-21)


### Features

* **api:** DevDrop sample app exercising every platform feature ([125e797](https://github.com/binarysquadd/truss/commit/125e79788c8fe84fcc93cab63c68bcf79cd30bfc))
* **api:** per-tenant RLS enforcement + schema advisor (B3 / closes C1) ([d676d6a](https://github.com/binarysquadd/truss/commit/d676d6a21258642bd77bd17ab35c3aa09755054b))
* **operator:** admission + conversion webhooks and the v1beta1 API ([9c6a04f](https://github.com/binarysquadd/truss/commit/9c6a04f4089cf68c9e8447768797aab31ce2469f))
* **operator:** emit Kubernetes Events on reconcile transitions ([8051d9d](https://github.com/binarysquadd/truss/commit/8051d9dbc872d08e61dc2f0bf02420da65d73860))
* **operator:** grant the managed-PG app role CREATEROLE for tenant RLS ([b45b177](https://github.com/binarysquadd/truss/commit/b45b177be23879b5ccd68fbc22ceda2a014d7a4a))
* **operator:** managed dependencies, secret generation, and backups/PITR ([ba9f93b](https://github.com/binarysquadd/truss/commit/ba9f93bab4e1f08fa820cdeca15128bd0c97b102))
* **operator:** pre-roll migration Job (migrate-then-switch) ([1ab4c2e](https://github.com/binarysquadd/truss/commit/1ab4c2eb18718e9a329b8cab42aa5d9b31a1e1d1))
* **operator:** run the operator itself HA (2 replicas + fast failover) ([65e31e3](https://github.com/binarysquadd/truss/commit/65e31e3ecb3bae7dcd7884ceaa73f6ceab4e093d))


### Bug Fixes

* **api:** schema bootstrap, safe branch clone, ship pg client ([921a7ce](https://github.com/binarysquadd/truss/commit/921a7ce80c9fcdf710f3f2a54c48d6a77aced06f))
* **api:** security hardening across the API surface ([9491a67](https://github.com/binarysquadd/truss/commit/9491a6765d790238818011844576b61298ef9310))
* harden self-host infra and make the dashboard operator-ready ([fba2a2c](https://github.com/binarysquadd/truss/commit/fba2a2c90b7c5d58fae0d2630004bd8d4dc0fdc8))
* **operator:** security hardening, buildable image, and dashboard wiring ([c969824](https://github.com/binarysquadd/truss/commit/c9698240358b9d6d974329a076a54838867649bb))

## [0.3.0](https://github.com/binarysquadd/truss/compare/v0.2.0...v0.3.0) (2026-07-23)


### Features

* operator, unified OpenTelemetry observability, and prod-grade release pipeline ([6694970](https://github.com/binarysquadd/truss/commit/66949707aa87f4c2175288c679bd6691267392b9))
