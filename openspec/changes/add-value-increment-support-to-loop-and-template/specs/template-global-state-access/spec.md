# template-global-state-access Specification Delta

## Purpose
Enable template nodes to access global_state directly in Jinja2 templates, allowing templates to display value increment values, shared state, and dynamic data without requiring edge processor preprocessing.

## ADDED Requirements

### Requirement: Template Global State Context Variable
Template nodes SHALL expose the global_state dictionary as a Jinja2 context variable for use in template expressions.

#### Scenario: Access global_state value increment in template
- **GIVEN** a template node with template content: `"Day {{ global_state.day_number }}: {{ input }}"`
- **AND** global_state contains `{"day_number": 5}`
- **WHEN** the template node executes with input "Operations starting"
- **THEN** the output SHALL be: "Day 5: Operations starting"
- **AND** no edge processor SHALL be required to inject the day number

**Example:**
```yaml
- id: DayMessage
  type: template
  config:
    template: |
      Day {{ global_state.day_number }}: {{ input }}
      Iteration: {{ global_state.iteration_count }}
```

#### Scenario: Access nested global_state values
- **GIVEN** a template with `"Status: {{ global_state.metrics.success_rate }}%"`
- **AND** global_state contains `{"metrics": {"success_rate": 95, "total": 100}}`
- **WHEN** the template renders
- **THEN** the output SHALL be: "Status: 95%"
- **AND** nested dictionary access SHALL work using dot notation

#### Scenario: Global state undefined key with strict mode
- **GIVEN** a template with `"Value Increment: {{ global_state.missing_key }}"`
- **AND** global_state does NOT contain "missing_key"
- **WHEN** the template attempts to render
- **THEN** an UndefinedError SHALL be raised
- **AND** the error message SHALL indicate which key is undefined
- **AND** the template execution SHALL fail (strict mode behavior)

### Requirement: Template Global State Default Values
Template nodes SHALL support Jinja2 default filter to handle missing global_state keys gracefully.

#### Scenario: Use default value for missing global_state key
- **GIVEN** a template with `"Count: {{ global_state.iteration | default(0) }}"`
- **AND** global_state does NOT contain "iteration" key
- **WHEN** the template renders
- **THEN** the output SHALL be: "Count: 0"
- **AND** no error SHALL be raised

#### Scenario: Use default value with type coercion
- **GIVEN** a template with `"Status: {{ global_state.status | default('pending') }}"`
- **AND** global_state contains `{"status": null}`
- **WHEN** the template renders with Jinja2's default(value, boolean=false)
- **THEN** the output SHALL respect Jinja2's default behavior for null values

### Requirement: Template Value Increment Formatting Filters
Template nodes SHALL provide custom Jinja2 filters for common value increment formatting operations.

#### Scenario: Format value increment as ordinal number
- **GIVEN** a template with `"This is the {{ global_state.day | ordinal }} day"`
- **AND** global_state contains `{"day": 1}`
- **WHEN** the template renders
- **THEN** the output SHALL be: "This is the 1st day"
- **AND** subsequent values SHALL render as: 2 → "2nd", 3 → "3rd", 4 → "4th", 21 → "21st"

**Example:**
```yaml
template: |
  Day {{ global_state.day_number | ordinal }}: Patient Report
  This is the {{ global_state.day_number | ordinal }} day of simulation.
```

#### Scenario: Format value increment with zero-padding
- **GIVEN** a template with `"File_{{ global_state.file_num | zero_pad(4) }}.txt"`
- **AND** global_state contains `{"file_num": 42}`
- **WHEN** the template renders
- **THEN** the output SHALL be: "File_0042.txt"
- **AND** padding width SHALL be customizable per use

#### Scenario: Chain multiple filters on value increment
- **GIVEN** a template with `"{{ global_state.count | zero_pad(3) | upper }}"`
- **AND** global_state contains `{"count": 5}`
- **WHEN** the template renders
- **THEN** the output SHALL be: "005" (zero_pad has no case, but demonstrates chaining)
- **AND** filters SHALL be composable like standard Jinja2 filters

### Requirement: Template Global State Read-Only Access
Template nodes SHALL have read-only access to global_state to prevent unintended state mutations.

#### Scenario: Template cannot modify global_state
- **GIVEN** a Jinja2 sandboxed environment for template rendering
- **AND** a template node with access to global_state
- **WHEN** the template attempts to modify global_state (e.g., via custom functions)
- **THEN** the sandboxed environment SHALL prevent write operations
- **AND** global_state SHALL remain unchanged after template rendering

#### Scenario: Template reads global_state without side effects
- **GIVEN** global_state contains `{"value_increment": 10}`
- **AND** a template accessing `{{ global_state.value_increment }}`
- **WHEN** the template renders multiple times
- **THEN** the value increment value SHALL remain 10 across all renders
- **AND** template rendering SHALL NOT increment or modify the value increment

### Requirement: Template Global State Documentation
Template node configuration SHALL document the global_state context variable in field specifications.

#### Scenario: Template field spec includes global_state documentation
- **GIVEN** the TemplateNodeConfig FIELD_SPECS for the "template" field
- **WHEN** a user inspects the field specification
- **THEN** the description SHALL mention `{{ global_state }}` context variable
- **AND** the description SHALL provide an example of accessing global_state
- **AND** the description SHALL list all available context variables (input, environment, global_state)

**Expected documentation:**
```
Available context: 
- {{ input }} - latest message content
- {{ environment }} - execution environment variables  
- {{ global_state }} - shared workflow state dictionary
```

### Requirement: Template Global State Error Messages
Template nodes SHALL provide clear error messages when global_state access fails.

#### Scenario: Undefined key error includes available keys
- **GIVEN** a template accessing `{{ global_state.undefined_key }}`
- **AND** global_state contains `{"day": 1, "count": 5}`
- **WHEN** the template rendering fails due to undefined key
- **THEN** the error message SHALL list available global_state keys
- **AND** the error SHALL indicate the missing key name
- **AND** the error SHALL help users debug template context issues

**Example error:**
```
Undefined variable in template for node 'MessageFormatter': 
'undefined_key'. Available global_state keys: day, count
```

#### Scenario: Type error on invalid filter usage
- **GIVEN** a template with `"{{ global_state.day | ordinal }}"`
- **AND** global_state contains `{"day": "not a number"}`
- **WHEN** the ordinal filter processes a non-integer value
- **THEN** a TemplateRenderError SHALL be raised
- **AND** the error message SHALL indicate the filter name and expected type

### Requirement: Template Global State Backward Compatibility
Template nodes accessing global_state SHALL remain compatible with existing templates that do not use this feature.

#### Scenario: Existing template without global_state continues to work
- **GIVEN** a template node with template: `"Report: {{ input }}"`
- **AND** the template does NOT reference global_state
- **WHEN** the template renders
- **THEN** the template SHALL execute exactly as before
- **AND** the presence of global_state in context SHALL NOT affect behavior
- **AND** existing workflows SHALL NOT require any changes

#### Scenario: Global state empty dictionary when no state exists
- **GIVEN** a workflow with no global_state modifications
- **AND** a template accessing `{{ global_state | length }}`
- **WHEN** the template renders
- **THEN** global_state SHALL be an empty dictionary `{}`
- **AND** the template SHALL render "0" for the length

## MODIFIED Requirements

### Requirement: Template Node Context Variables (Updated)
**Original:** Template nodes expose `input` and `environment` context variables.

**Modified:** Template nodes SHALL expose three context variables in Jinja2 templates:
1. `{{ input }}` - The latest input message content (string)
2. `{{ environment }}` - Execution environment variables (dict)
3. `{{ global_state }}` - Shared workflow state dictionary (dict, read-only)

#### Scenario: All context variables accessible together
- **GIVEN** a template with:
  ```
  Input: {{ input }}
  Env: {{ environment.API_KEY | default('none') }}
  State: {{ global_state.value_increment | default(0) }}
  ```
- **WHEN** the template renders
- **THEN** all three context variables SHALL be available simultaneously
- **AND** each SHALL function independently without conflicts

## REMOVED Requirements

None. This feature adds capabilities without removing existing functionality.
