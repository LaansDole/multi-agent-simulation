# Change: Add Template Edge Processor

## Why

The workflow uses `type: template` in edge processors (e.g., `yaml_instance/simulation_hospital.yaml` lines 960, 1006, 1036), but **no template processor implementation exists**. This causes processor resolution failures or silent falls back to regex/function processors.

Users want to:
1. Use Jinja2 templates for edge payload transformation (data formatting, conditional logic)
2. Separate report templates from LLM prompts (FinalReportAggregator currently has a 50+ line prompt embedding the report structure)
3. Access edge context variables (`input`, `environment.output`, etc.) in templates

Currently, users must embed all formatting logic in LLM prompts or use regex processors, which is verbose and error-prone.

## What Changes

- **ADD** `TemplateEdgeProcessorConfig` dataclass in `entity/configs/edge/edge_processor.py`
- **ADD** `TemplateEdgePayloadProcessor` class in `runtime/edge/processors/template_processor.py`
- **REGISTER** `template` processor type in `runtime/edge/processors/builtin_types.py`
- **ADD** Jinja2 dependency to `pyproject.toml`
- **ADD** unit tests in `tests/test_template_processor.py`

The processor will:
- Accept `template: str` (Jinja2 template string)
- Provide context variables: `input` (payload), `environment` (global state), `extracted` (from prior processors)
- Support Jinja2 filters: `fromjson`, `tojson`, `default`, standard filters
- Return transformed string payload

## Impact

**Affected specs:** 
- `edge-processors` (new spec)

**Affected code:**
- `entity/configs/edge/edge_processor.py` - Add config class
- `runtime/edge/processors/template_processor.py` - New processor implementation
- `runtime/edge/processors/builtin_types.py` - Register processor
- `pyproject.toml` - Add Jinja2 dependency
- `yaml_instance/simulation_hospital.yaml` - Already uses `type: template` (will now work correctly)

**Breaking changes:** None (adds new functionality)

**Migration:** Existing workflows using `type: template` will now work correctly instead of failing silently.
