import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { whoamiTool } from '../tools/whoami.js';
import { listTracesTool } from '../tools/list-traces.js';
import { getTraceTool } from '../tools/get-trace.js';
import { queryTool } from '../tools/query.js';
import { listMonitorsTool } from '../tools/list-monitors.js';
import { runMonitorTool } from '../tools/run-monitor.js';
import { listSignalsTool } from '../tools/list-signals.js';
import { getSessionTool } from '../tools/get-session.js';
import { searchDocsTool } from '../tools/search-docs.js';
import { listDatasetsTool } from '../tools/list-datasets.js';
import { listEvalsTool } from '../tools/list-evals.js';
import { createMonitorTool } from '../tools/create-monitor.js';
import { createDatasetTool } from '../tools/create-dataset.js';
import { getMonitorTool } from '../tools/get-monitor.js';
import { getEvalTool } from '../tools/get-eval.js';

describe('tool input schemas', () => {
  it('whoami accepts empty input', () => {
    const result = whoamiTool.inputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('list_traces accepts valid input', () => {
    const result = listTracesTool.inputSchema.safeParse({
      limit: 10,
      status: 'error',
    });
    expect(result.success).toBe(true);
  });

  it('list_traces rejects limit > 100', () => {
    const result = listTracesTool.inputSchema.safeParse({ limit: 200 });
    expect(result.success).toBe(false);
  });

  it('list_traces rejects limit < 1', () => {
    const result = listTracesTool.inputSchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  it('get_trace requires trace_id', () => {
    const result = getTraceTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('get_trace rejects empty trace_id', () => {
    const result = getTraceTool.inputSchema.safeParse({ trace_id: '' });
    expect(result.success).toBe(false);
  });

  it('query requires prompt', () => {
    const result = queryTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('query rejects empty prompt', () => {
    const result = queryTool.inputSchema.safeParse({ prompt: '' });
    expect(result.success).toBe(false);
  });

  it('list_monitors accepts valid input', () => {
    const result = listMonitorsTool.inputSchema.safeParse({
      limit: 5,
      status: 'active',
    });
    expect(result.success).toBe(true);
  });

  it('run_monitor requires monitor_id', () => {
    const result = runMonitorTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('list_signals accepts empty input', () => {
    const result = listSignalsTool.inputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('get_session requires session_id', () => {
    const result = getSessionTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('search_docs requires query', () => {
    const result = searchDocsTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('list_datasets accepts empty input', () => {
    const result = listDatasetsTool.inputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('list_evals accepts run filters', () => {
    const result = listEvalsTool.inputSchema.safeParse({
      suite_id: 'suite_123',
      agent_id: 'owner/agent',
      status: 'completed',
      dataset_id: 'ds_123',
    });
    expect(result.success).toBe(true);
  });

  // ── New tools ──

  it('create_monitor requires name and natural_language', () => {
    const result = createMonitorTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('create_monitor accepts valid input with optional fields', () => {
    const result = createMonitorTool.inputSchema.safeParse({
      name: 'Test Monitor',
      natural_language: 'Alert when traces fail',
      agent_id: 'owner/agent',
      severity: 'high',
      webhook_url: 'https://example.com/webhook',
    });
    expect(result.success).toBe(true);
  });

  it('create_monitor accepts valid input without optional fields', () => {
    const result = createMonitorTool.inputSchema.safeParse({
      name: 'Test Monitor',
      natural_language: 'Alert when traces fail',
    });
    expect(result.success).toBe(true);
  });

  it('create_dataset requires name and description', () => {
    const result = createDatasetTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('create_dataset accepts valid input', () => {
    const result = createDatasetTool.inputSchema.safeParse({
      name: 'Test Dataset',
      description: 'A test dataset',
      agent_id: 'owner/agent',
    });
    expect(result.success).toBe(true);
  });

  it('get_monitor requires monitor_id', () => {
    const result = getMonitorTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('get_monitor rejects empty monitor_id', () => {
    const result = getMonitorTool.inputSchema.safeParse({ monitor_id: '' });
    expect(result.success).toBe(false);
  });

  it('get_eval requires eval_id', () => {
    const result = getEvalTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('get_eval rejects empty eval_id', () => {
    const result = getEvalTool.inputSchema.safeParse({ eval_id: '' });
    expect(result.success).toBe(false);
  });

  it('all tools have names and descriptions', () => {
    const tools = [
      whoamiTool,
      listTracesTool,
      getTraceTool,
      queryTool,
      listMonitorsTool,
      runMonitorTool,
      listSignalsTool,
      getSessionTool,
      searchDocsTool,
      listDatasetsTool,
      listEvalsTool,
      createMonitorTool,
      createDatasetTool,
      getMonitorTool,
      getEvalTool,
    ];
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeInstanceOf(z.ZodObject);
    }
  });
});
