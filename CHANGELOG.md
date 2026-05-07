# Changelog

## Unreleased

### Added

- Operational debugging tools for agents working against a run:
  - `invariance_run_operational_graph` — structured `API_NOT_AVAILABLE` stub until `/v1/runs/:id/operational-graph` lands.
  - `invariance_run_llm_calls` — paginated LLM-call list for a run.
  - `invariance_run_node_types`, `invariance_run_node_type_metrics` — typed-node aggregates.
  - `invariance_run_fork` — branch a run from a node for replay / what-if.
  - `invariance_run_inspect` — composite `{run, metrics, narrative, recent_nodes, open_findings}` view, mirrors `inv run inspect`.
- Cross-run metrics tools:
  - `invariance_metrics_overview` — windowed roll-up.
  - `invariance_metrics_agents` — per-agent usage.

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
