# MetaGPT: Research Summary

**Paper:** MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework  
**Authors:** Sirui Hong, Mingchen Zhuge, Jonathan Chen, Xiawu Zheng, Yuheng Cheng, Jinlin Wang, Ceyao Zhang, Ziyu Wang, Steven Ka Shing Yau, Zijie Lin, Zhoujun Li, Lingyun Cao, Boyuan Li, Chi Zhang, Wangchun Wu, Jürgen Schmidhuber  

**arXiv:** 2308.00352  
**Published:** August 1, 2023  
**Conference:** ICLR 2024  
**URL:** https://arxiv.org/abs/2308.00352

---

## Problem Statement and Motivation

### The Challenge
LLM-based multi-agent systems show promise for complex tasks, but suffer from:
- **Hallucination**: Agents generate plausible but incorrect information
- **Logical inconsistencies**: Outputs don't follow coherent logic
- **Cascade errors**: One agent's mistake propagates to others
- **Lack of structure**: Unstructured conversations lead to chaos

### The Gap
Existing frameworks (like pure LLM conversations) lacked:
- **Standardized procedures**: No systematic approach to task execution
- **Quality control**: No mechanisms to verify intermediate outputs
- **Role clarity**: Agents without clear responsibilities produce redundant or conflicting work
- **Modular outputs**: Monolithic outputs difficult to validate and debug

### The Solution
MetaGPT introduces **Standardized Operating Procedures (SOPs)** from human management practices into LLM multi-agent systems:
1. Encodes SOPs into prompts to guide agent behavior
2. Mandates modular outputs for verification
3. Assigns diverse roles to agents (like an assembly line)
4. Implements structured communication patterns

---

## Architecture Overview

MetaGPT organizes agents in a **software company structure** with defined roles and workflows:

```
Product Manager (PRD)
       |
       v
Architect (System Design)
       |
       v
Project Manager (Task Breakdown)
       |
       v
Engineer (Code Implementation) -> QA Engineer (Testing)
       |
       v
Final Software Package
```

### Core Concepts

1. **SOP Encoding**: Standardized procedures written into agent prompts
2. **Modular Output**: Each role produces structured, verifiable artifacts
3. **Assembly Line**: Sequential role execution with handoffs
4. **Message Pool**: Shared communication channel for all agents

---

## Communication Mechanisms

### Structured Communication

MetaGPT uses a **publish-subscribe pattern** with message pools:

#### Message Pool Architecture
```
Agent A publishes --> [Message Pool] <-- Agent B subscribes
                              |
                              v
                        All agents can read
                        historical messages
```

#### Message Types
- **Structured messages**: JSON/Markdown with defined schemas
- **Artifacts**: Documents, code, diagrams produced by agents
- **Feedback**: Reviews and corrections from other agents

### Communication Patterns

#### 1. Sequential Handoff
```
PM writes PRD -> Architect reviews -> Engineer implements -> QA tests
```
- Each agent consumes previous agent's output
- Produces structured artifact for next agent

#### 2. Shared Environment
- All agents can access message pool
- Historical context available to all
- Enables context-aware decision-making

#### 3. Structured Output Format

Each agent produces specific deliverables:

| Role | Output | Format |
|------|--------|--------|
| Product Manager | PRD (Product Requirements) | Markdown |
| Architect | System Design | Diagram + Docs |
| Project Manager | Task List | JSON |
| Engineer | Source Code | Python files |
| QA Engineer | Test Cases | Unit tests |

---

## Memory and State Management

### Shared Memory Pool

**Global Message Pool:**
- All agent communications stored centrally
- Timestamped and attributed to specific agents
- Searchable by any agent

**Memory Retrieval:**
```python
# Agent queries message pool
relevant_messages = pool.get_messages(
    agent_name="Engineer",
    message_type="PRD",
    limit=10
)
```

### State Persistence

MetaGPT maintains:
- **Complete conversation history**: All agent interactions
- **Artifact versions**: Track changes to documents/code
- **Execution state**: Current phase and progress

### Context Management

**Hierarchical Context:**
1. **Global context**: Project-wide information (goals, constraints)
2. **Role context**: Role-specific knowledge and procedures
3. **Task context**: Current task details and requirements

---

## Planning and Execution

### SOP-Based Planning

MetaGPT encodes **Standard Operating Procedures** from software engineering:

#### Software Development SOP

**Phase 1: Requirements Analysis (Product Manager)**
```
Input: User requirements
Process:
  1. Analyze user needs
  2. Define features and scope
  3. Create user stories
  4. Write acceptance criteria
Output: PRD (Product Requirements Document)
```

**Phase 2: System Design (Architect)**
```
Input: PRD
Process:
  1. Design system architecture
  2. Define component interfaces
  3. Choose technology stack
  4. Create data flow diagrams
Output: System Design Document
```

**Phase 3: Task Breakdown (Project Manager)**
```
Input: System Design
Process:
  1. Break down into development tasks
  2. Estimate effort and dependencies
  3. Assign to team members
  4. Create project timeline
Output: Task List + Schedule
```

**Phase 4: Implementation (Engineer)**
```
Input: Task List + Design
Process:
  1. Implement each task
  2. Write clean, documented code
  3. Follow coding standards
  4. Create unit tests
Output: Source Code
```

**Phase 5: Testing (QA Engineer)**
```
Input: Source Code
Process:
  1. Write comprehensive tests
  2. Execute test suite
  3. Report bugs
  4. Verify fixes
Output: Test Reports + Bug List
```

### Dynamic Planning

**Replanning Triggers:**
- Unresolved bugs after testing
- Requirements changes
- Architectural issues discovered

**Feedback Loop:**
```
Testing -> Bugs -> Engineer fixes -> Re-test
   |                            |
   +-> Architect redesigns -----+
   |                            |
   +-> PM updates PRD ----------+
```

---

## Key Experimental Results

### Evaluation Benchmarks

MetaGPT was evaluated on:
1. **HumanEval**: Code generation benchmark (164 problems)
2. **MBPP**: Most Basic Python Problems (427 tasks)
3. **SoftwareDev**: Custom software development tasks

### Performance on HumanEval

| Model | Pass@1 | Pass@10 |
|-------|--------|---------|
| GPT-4 (single) | 67.0% | 85.1% |
| ChatDev | 61.7% | 74.9% |
| **MetaGPT** | **62.8%** | **75.9%** |

**Key Finding**: MetaGPT achieves competitive performance with more coherent, structured outputs.

### Performance on MBPP

| Model | Pass@1 | Pass@10 |
|-------|--------|---------|
| GPT-4 (single) | 63.4% | 77.8% |
| **MetaGPT** | **74.9%** | **87.0%** |

**Key Finding**: MetaGPT significantly outperforms single-agent on larger benchmark.

### Software Development Tasks

MetaGPT generated complete software packages for 70 tasks:

**Metrics:**
- **Executable rate**: 87.5% (software runs without errors)
- **Functional correctness**: 81.2% (meets requirements)
- **Code quality**: 7.6/10 (human evaluation)

**Comparison to ChatDev:**
- MetaGPT: 87.5% executable
- ChatDev: 86.7% executable
- **Similar performance** but MetaGPT produces more modular, maintainable code

### Ablation Studies

#### Effect of SOPs

| Configuration | HumanEval Pass@1 |
|--------------|------------------|
| Without SOPs | 58.2% |
| With SOPs | **62.8%** |
| **Improvement** | **+4.6%** |

**Finding**: Standardized Operating Procedures improve code generation quality.

#### Effect of Modular Outputs

| Configuration | Executable Rate |
|--------------|-----------------|
| Monolithic output | 79.3% |
| Modular output | **87.5%** |
| **Improvement** | **+8.2%** |

**Finding**: Breaking outputs into modules improves verifiability and reduces errors.

#### Effect of Role Specialization

| Configuration | HumanEval Pass@1 |
|--------------|------------------|
| Single agent all roles | 61.0% |
| Specialized agents | **62.8%** |
| **Improvement** | **+1.8%** |

**Finding**: Role specialization provides modest improvements for code generation.

### Qualitative Analysis

**Code Quality Improvements:**
- Better separation of concerns (modular design)
- More comprehensive documentation
- Fewer logical inconsistencies
- Easier debugging and maintenance

**Example Output:**
MetaGPT generated a complete snake game with:
- Separate modules for game logic, UI, and controls
- Comprehensive docstrings and comments
- Unit tests for core functions
- README with usage instructions

---

## Implications for Multi-Agent Systems

### Architectural Patterns

1. **SOP encoding**: Embed standard procedures into agent prompts
2. **Modular outputs**: Force agents to produce structured, verifiable artifacts
3. **Assembly line workflow**: Sequential role execution with clear handoffs
4. **Shared message pool**: Centralized communication and memory

### Design Principles

**For Software Development Agents:**
- Define clear roles (PM, Architect, Engineer, QA)
- Mandate structured outputs (PRD, design docs, code, tests)
- Implement feedback loops for iterative refinement
- Use SOPs from real-world software engineering practices

**For General Multi-Agent Systems:**
- Encode domain-specific standard procedures into prompts
- Break complex tasks into sequential sub-tasks
- Require modular outputs for verification
- Implement shared memory for context sharing
- Use role specialization for complex workflows

### Strengths

- **Reduced hallucination**: SOPs guide agents toward correct behavior
- **Logical consistency**: Structured outputs prevent contradictions
- **Modularity**: Easier to debug and maintain
- **Transparency**: Clear role assignments and outputs
- **Reusability**: SOPs can be adapted to other domains

### Limitations

- **Domain specificity**: SOPs designed for software development
- **Rigidity**: Less flexible than unconstrained conversations
- **Overhead**: More setup required for role definitions
- **Cost**: Multiple agents and phases increase token usage

### Comparison to Other Frameworks

| Feature | MetaGPT | ChatDev | AutoGen | Stanford Agents |
|---------|---------|---------|---------|-----------------|
| **SOP encoding** | Yes | Limited | No | No |
| **Modular outputs** | Yes | Limited | No | No |
| **Shared memory** | Yes | No | Yes | Yes |
| **Role specialization** | Strong | Strong | Medium | Weak |
| **Domain** | Software dev | Software dev | General | Social sim |
| **Rigidity** | High | Medium | Low | Low |

### Unique Contributions

1. **SOP concept**: First framework to explicitly encode standard procedures
2. **Modular verification**: Mandates structured outputs for quality control
3. **Assembly line**: Clear sequential workflow with defined handoffs
4. **Message pool**: Shared communication channel for all agents

---

## Code Example

```python
from metagpt.roles import ProductManager, Architect, ProjectManager, Engineer

# Create specialized agents
pm = ProductManager()
architect = Architect()
project_manager = ProjectManager()
engineer = Engineer()

# Define software requirements
requirement = """
Create a Python CLI tool for managing a to-do list with features:
- Add, remove, list tasks
- Mark tasks as complete
- Save/load tasks from file
"""

# Execute development pipeline
prd = pm.analyze_requirement(requirement)
design = architect.design_system(prd)
tasks = project_manager.breakdown_tasks(design)
code = engineer.implement(tasks)

# Output: Complete software package with documentation and tests
```

---

## References

- Paper: https://arxiv.org/abs/2308.00352
- GitHub (official): https://github.com/geekan/MetaGPT
- ICLR 2024: https://openreview.net/forum?id=VtmBAGCN7o
- Documentation: https://docs.deepwisdom.ai/main/en/
