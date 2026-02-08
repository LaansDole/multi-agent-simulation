## ADDED Requirements

### Requirement: Template Processor Type Registration

The system SHALL register a `template` edge processor type that transforms edge payloads using Jinja2 template rendering.

#### Scenario: Template processor is available
- **WHEN** workflow validation runs or edge processor registry is queried
- **THEN** `template` appears in the list of available processor types
- **AND** processor summary is "Transform payloads using Jinja2 templates"

### Requirement: Template Configuration

The template processor SHALL accept a `template` configuration field containing a Jinja2 template string.

#### Scenario: Valid template configuration
- **WHEN** edge config contains `processor: {type: template, config: {template: "Hello {{ input }}"}}`
- **THEN** configuration parses successfully
- **AND** `TemplateEdgeProcessorConfig` instance is created with template field set

#### Scenario: Missing template field
- **WHEN** edge config contains `processor: {type: template, config: {}}`
- **THEN** configuration parsing raises `ConfigError`
- **AND** error message indicates `template` field is required

#### Scenario: Empty template string
- **WHEN** edge config contains `processor: {type: template, config: {template: ""}}`
- **THEN** configuration parsing raises `ConfigError`
- **AND** error message indicates template cannot be empty

### Requirement: Template Context Variables

The template processor SHALL provide context variables for use in Jinja2 templates.

#### Scenario: Input variable access
- **WHEN** template is `"Input: {{ input }}"`
- **AND** edge payload is `"test message"`
- **THEN** processor returns `"Input: test message"`

#### Scenario: Environment variable access
- **WHEN** template is `"Env: {{ environment.output }}"`
- **AND** environment node output is `"env data"`
- **THEN** processor returns `"Env: env data"`

#### Scenario: Extracted variable access (from prior processors)
- **WHEN** prior regex processor extracted value `"extracted_value"`
- **AND** template is `"Result: {{ extracted }}"`
- **THEN** processor returns `"Result: extracted_value"`

### Requirement: Jinja2 Filters

The template processor SHALL support standard Jinja2 filters plus custom `fromjson` and `tojson` filters.

#### Scenario: JSON parsing with fromjson filter
- **WHEN** template is `"{% set data = input | fromjson %}Name: {{ data.name }}"`
- **AND** input payload is `'{"name": "Alice"}'`
- **THEN** processor returns `"Name: Alice"`

#### Scenario: JSON serialization with tojson filter
- **WHEN** template is `"{{ {\"key\": \"value\"} | tojson }}"`
- **THEN** processor returns `"{\"key\": \"value\"}"`

#### Scenario: Default filter for missing variables
- **WHEN** template is `"Value: {{ missing | default('N/A') }}"`
- **AND** variable `missing` is not in context
- **THEN** processor returns `"Value: N/A"`

### Requirement: Template Conditional Logic

The template processor SHALL support Jinja2 control structures (if/for/set).

#### Scenario: Conditional rendering
- **WHEN** template is `"{% if input == 'yes' %}Confirmed{% else %}Denied{% endif %}"`
- **AND** input is `"yes"`
- **THEN** processor returns `"Confirmed"`

#### Scenario: Variable assignment
- **WHEN** template is `"{% set x = input | fromjson %}Result: {{ x.field }}"`
- **AND** input is `'{"field": "data"}'`
- **THEN** processor returns `"Result: data"`

### Requirement: Error Handling

The template processor SHALL handle template rendering errors gracefully with descriptive messages.

#### Scenario: Invalid template syntax
- **WHEN** template contains `"{{ unclosed variable"`
- **THEN** processor raises `TemplateRenderError` during initialization
- **AND** error message includes "Invalid template syntax"

#### Scenario: Undefined variable (strict mode)
- **WHEN** template is `"{{ undefined_var }}"`
- **AND** variable is not in context
- **THEN** processor raises `TemplateRenderError`
- **AND** error message includes variable name and available context keys

#### Scenario: JSON parsing error
- **WHEN** template uses `"{{ input | fromjson }}"`
- **AND** input is invalid JSON
- **THEN** processor raises `TemplateRenderError`
- **AND** error message includes "JSON decode error"

### Requirement: Safe Template Execution

The template processor SHALL use Jinja2 sandboxing to prevent arbitrary code execution.

#### Scenario: Restricted environment
- **WHEN** template processor initializes Jinja2 environment
- **THEN** environment uses `jinja2.sandbox.SandboxedEnvironment`
- **AND** unsafe operations (file access, imports) are blocked
