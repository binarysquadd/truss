# Releasing Truss

Releases are cut by pushing a git tag. The `.github/workflows/release.yml` workflow
then builds + pushes both app images multi-arch, publishes the Helm chart to GHCR as an
OCI artifact, and creates a GitHub Release.

## Steps

1. Bump the version in `VERSION` and in `charts/truss/Chart.yaml` (`version` + `appVersion`)
   to the new `X.Y.Z`. The chart's `appVersion` is what the app images are tagged with by
   default (`images.api.tag` / `images.dashboard.tag` fall back to it).
2. Commit the bump and tag it:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

That's it. On the tag push, `release.yml` produces:

- `ghcr.io/binarysquadd/truss-api:X.Y.Z` (+ `:latest` + `:<sha>`), multi-arch.
- `ghcr.io/binarysquadd/truss-dashboard:X.Y.Z` (+ `:latest` + `:<sha>`), multi-arch.
- The chart at `oci://ghcr.io/binarysquadd/charts/truss`, version `X.Y.Z`.
- A GitHub Release for `vX.Y.Z` with auto-generated notes.

Install the published release with:

```bash
helm install truss oci://ghcr.io/binarysquadd/charts/truss --version X.Y.Z
```
