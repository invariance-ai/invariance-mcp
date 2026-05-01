# Changelog

## Unreleased

### Deprecated

- Legacy tool aliases now emit a one-time stderr warning per process and will be removed in the next minor release (`0.3.0`). Migrate to the modern names:
  - `invariance_create_run` → `invariance_run_start`
  - `invariance_get_run` → `invariance_run_get`
  - `invariance_list_runs` → `invariance_run_list`
  - `invariance_write_node` → `invariance_node_write`
  - `invariance_list_nodes` → `invariance_node_list`
  - `invariance_verify_run` → `invariance_run_verify`
- `INVARIANCE_BASE_URL` env var: use `INVARIANCE_API_URL` instead. Removal slated for `0.3.0`.

## 0.2.0

Initial public release.
