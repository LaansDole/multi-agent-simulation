## 1. Implementation

- [x] 1.1 Add Jinja2 dependency to `pyproject.toml` (`jinja2>=3.1.0`)
- [x] 1.2 Create `TemplateEdgeProcessorConfig` in `entity/configs/edge/edge_processor.py`
  - Fields: `template: str`
  - Validation: template cannot be empty
- [x] 1.3 Create `TemplateEdgePayloadProcessor` in `runtime/edge/processors/template_processor.py`
  - Initialize Jinja2 environment with safe mode
  - Register custom filters: `fromjson`, `tojson`
  - Implement `process(input, context)` method
  - Provide context: `input`, `environment`, `extracted`
- [x] 1.4 Register processor in `runtime/edge/processors/builtin_types.py`
  - Type name: `"template"`
  - Summary: "Transform payloads using Jinja2 templates"

## 2. Testing

- [x] 2.1 Create `tests/test_template_processor.py`
  - Test basic variable substitution (`{{ input }}`)
  - Test JSON parsing (`{% set data = input | fromjson %}`)
  - Test conditional logic (`{% if ... %}`)
  - Test environment variable access (`{{ environment.output }}`)
  - Test error handling (invalid template, missing variables)
- [x] 2.2 Run validation: `uv run python -m check.check --path yaml_instance/simulation_hospital.yaml`
- [x] 2.3 Run integration test: `uv run pytest tests/test_template_processor.py -v`

## 3. Documentation

- [x] 3.1 Add template processor example to `yaml_template/` directory
- [x] 3.2 Update user guide: `docs/user_guide/en/modules/edge_processors.md` (if exists) - N/A: docs don't exist yet

## 4. Validation

- [x] 4.1 Verify existing `simulation_hospital.yaml` edges with `type: template` now work
- [x] 4.2 Run full test suite: `uv run pytest`
- [x] 4.3 Validate change: `openspec validate add-template-edge-processor --strict --no-interactive`
