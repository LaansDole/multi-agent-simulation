"""Tests for template edge processor."""

import pytest

from entity.configs.edge.edge_processor import TemplateEdgeProcessorConfig
from entity.configs.base import ConfigError
from entity.messages import Message, MessageRole
from runtime.edge.processors.template_processor import (
    TemplateEdgePayloadProcessor,
    TemplateRenderError,
)
from runtime.edge.processors.base import ProcessorFactoryContext
from runtime.node.executor import ExecutionContext
from utils.log_manager import LogManager


class MockExecutionContext:
    """Mock execution context for testing."""

    def __init__(self, environment=None):
        self.environment = environment or {}


def create_processor(template: str) -> TemplateEdgePayloadProcessor:
    """Helper to create processor with template."""
    config = TemplateEdgeProcessorConfig(template=template, path="test")
    ctx = ProcessorFactoryContext()
    return TemplateEdgePayloadProcessor(config, ctx)


def transform_text(
    processor: TemplateEdgePayloadProcessor, input_text: str, environment=None
) -> str:
    """Helper to transform text input."""
    payload = Message(role=MessageRole.USER, content=input_text)
    context = MockExecutionContext(environment=environment)
    result = processor.transform(
        payload,
        source_result=payload,
        from_node=None,
        edge_link=None,
        log_manager=LogManager(),
        context=context,  # type: ignore
    )
    return result.text_content() if result else ""


class TestTemplateConfiguration:
    """Test template configuration validation."""

    def test_valid_template_configuration(self):
        """Valid template configuration should parse successfully."""
        config = TemplateEdgeProcessorConfig(template="Hello {{ input }}", path="test")
        assert config.template == "Hello {{ input }}"

    def test_missing_template_field(self):
        """Missing template field should raise ConfigError."""
        with pytest.raises(ConfigError, match="expected string"):
            TemplateEdgeProcessorConfig.from_dict({}, path="test")

    def test_empty_template_string(self):
        """Empty template string should raise ConfigError."""
        with pytest.raises(ConfigError, match="expected non-empty string"):
            TemplateEdgeProcessorConfig.from_dict({"template": ""}, path="test")


class TestBasicVariableSubstitution:
    """Test basic template variable substitution."""

    def test_input_variable_access(self):
        """Template should access input variable."""
        processor = create_processor("Input: {{ input }}")
        result = transform_text(processor, "test message")
        assert result == "Input: test message"

    def test_environment_variable_access(self):
        """Template should access environment variables."""
        processor = create_processor("Env: {{ environment.output }}")
        result = transform_text(
            processor, "ignored", environment={"output": "env data"}
        )
        assert result == "Env: env data"

    def test_extracted_variable_access(self):
        """Template should access extracted variable (defaults to input)."""
        processor = create_processor("Result: {{ extracted }}")
        result = transform_text(processor, "extracted_value")
        assert result == "Result: extracted_value"


class TestJinja2Filters:
    """Test Jinja2 filter support."""

    def test_fromjson_filter(self):
        """Template should parse JSON with fromjson filter."""
        processor = create_processor(
            "{% set data = input | fromjson %}Name: {{ data.name }}"
        )
        result = transform_text(processor, '{"name": "Alice"}')
        assert result == "Name: Alice"

    def test_tojson_filter(self):
        """Template should serialize to JSON with tojson filter."""
        processor = create_processor('{{ {"key": "value"} | tojson }}')
        result = transform_text(processor, "ignored")
        assert result == '{"key": "value"}'

    def test_default_filter_for_missing_variables(self):
        """Template should use default value for missing variables."""
        processor = create_processor("Value: {{ missing | default('N/A') }}")
        result = transform_text(processor, "ignored")
        assert result == "Value: N/A"

    def test_fromjson_invalid_json(self):
        """fromjson filter should raise error on invalid JSON."""
        processor = create_processor("{{ input | fromjson }}")
        with pytest.raises(TemplateRenderError, match="JSON decode error"):
            transform_text(processor, "not valid json")


class TestConditionalLogic:
    """Test Jinja2 control structures."""

    def test_conditional_rendering(self):
        """Template should support if/else conditionals."""
        processor = create_processor(
            "{% if input == 'yes' %}Confirmed{% else %}Denied{% endif %}"
        )
        assert transform_text(processor, "yes") == "Confirmed"
        assert transform_text(processor, "no") == "Denied"

    def test_variable_assignment(self):
        """Template should support variable assignment with set."""
        processor = create_processor(
            "{% set x = input | fromjson %}Result: {{ x.field }}"
        )
        result = transform_text(processor, '{"field": "data"}')
        assert result == "Result: data"

    def test_for_loop(self):
        """Template should support for loops."""
        processor = create_processor(
            "{% set items = input | fromjson %}{% for item in items %}{{ item }}{% if not loop.last %},{% endif %}{% endfor %}"
        )
        result = transform_text(processor, '["a", "b", "c"]')
        assert result == "a,b,c"


class TestErrorHandling:
    """Test template error handling."""

    def test_invalid_template_syntax(self):
        """Invalid template syntax should raise error during initialization."""
        config = TemplateEdgeProcessorConfig(
            template="{{ unclosed variable", path="test"
        )
        ctx = ProcessorFactoryContext()
        with pytest.raises(TemplateRenderError, match="Invalid template syntax"):
            TemplateEdgePayloadProcessor(config, ctx)

    def test_undefined_variable_strict_mode(self):
        """Undefined variable should raise error with available context keys."""
        processor = create_processor("{{ undefined_var }}")
        with pytest.raises(
            TemplateRenderError, match="Undefined variable.*Available context keys"
        ):
            transform_text(processor, "test")


class TestComplexScenarios:
    """Test complex real-world template scenarios."""

    def test_medical_report_template(self):
        """Template should handle complex medical report formatting."""
        template = """{% set env = input | fromjson %}
# Medical Report: {{ env.outbreak }}

Total Patients: {{ env.total_patients }}

{% for patient in env.patients %}
## Patient {{ loop.index }}: {{ patient.name }}
- Diagnosis: {{ patient.diagnosis | default('Pending') }}
{% endfor %}"""

        processor = create_processor(template)
        input_data = {
            "outbreak": "COVID-19",
            "total_patients": 2,
            "patients": [{"name": "Alice", "diagnosis": "Influenza"}, {"name": "Bob"}],
        }

        import json

        result = transform_text(processor, json.dumps(input_data))

        assert "# Medical Report: COVID-19" in result
        assert "Total Patients: 2" in result
        assert "## Patient 1: Alice" in result
        assert "- Diagnosis: Influenza" in result
        assert "## Patient 2: Bob" in result
        assert "- Diagnosis: Pending" in result

    def test_environment_context_formatting(self):
        """Template should format data from environment context."""
        template = """{% set env = environment.output | fromjson %}
OUTBREAK: {{ env.outbreak }}
URGENCY: {{ env.urgency_level }}
CONDITIONS: {{ env.atmospheric_description }}"""

        processor = create_processor(template)
        env_data = {
            "outbreak": "COVID-19 pandemic",
            "urgency_level": "High",
            "atmospheric_description": "Hospital overflowing",
        }

        import json

        result = transform_text(
            processor, "ignored", environment={"output": json.dumps(env_data)}
        )

        assert "OUTBREAK: COVID-19 pandemic" in result
        assert "URGENCY: High" in result
        assert "CONDITIONS: Hospital overflowing" in result
