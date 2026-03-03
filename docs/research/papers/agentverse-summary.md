# AgentVerse: Research Summary

**Paper:** AgentVerse: Facilitating Multi-Agent Collaboration and Exploring Emergent Behaviors  
**Authors:** Weize Chen, Yusheng Su, Jingwei Zuo, Cheng Yang, Chenfei Yuan, Chi-Min Chan, Heyang Yu, Yaxi Lu, Yi-Hsin Hung, Chen Qian, Yufan Dang, Zhuoer Feng, Xinyan Liu, Bowen Li, Xiangjing Hu, Zhaoyang Yu, Hao Chen, Shuyue Guo, Peng Cheng, Jie Fu, Zhiyuan Liu, Maosong Sun, Jie Zhou  

**arXiv:** 2308.10848  
**Published:** August 22, 2023  
**Conference:** ICLR 2024  
**URL:** https://arxiv.org/abs/2308.10848

---

## Problem Statement and Motivation

### The Challenge
Complex tasks require collaboration across multiple specialized capabilities:
- Diverse expertise (reasoning, coding, tool use, creativity)
- Different perspectives and approaches
- Collective intelligence exceeding individual agents
- Handling multi-faceted problems

### The Gap
Single-agent LLM systems faced:
- **Limited expertise**: One agent cannot excel at everything
- **No collaboration**: Missing benefits of teamwork
- **Single perspective**: Lack of diverse viewpoints
- **Inefficient for complex tasks**: Struggle with multi-domain problems

### The Solution
AgentVerse introduces a **task-oriented multi-agent framework** inspired by human group dynamics:
1. Orchestrates collaborative groups of expert agents
2. Divides problem-solving into four stages
3. Explores emergent collaborative behaviors
4. Outperforms single agents across diverse tasks

---

## Architecture Overview

AgentVerse organizes multi-agent collaboration into **four sequential stages**:

```
Expert Recruitment -> Collaborative Decision-Making -> Action Execution -> Evaluation
        |                       |                          |                   |
   Select experts          Discuss approach            Execute tasks        Assess results
        |                       |                          |                   |
    3-5 agents            Group discussion             Task-specific       Quality check
                           or debate                   execution           and refinement
```

### The Four Stages

#### Stage 1: Expert Recruitment
- **Purpose**: Assemble the right team for the task
- **Process**: 
  - Analyze task requirements
  - Identify needed expertise
  - Recruit 3-5 specialized agents
- **Output**: Expert group composition

#### Stage 2: Collaborative Decision-Making
- **Purpose**: Determine best approach collectively
- **Process**:
  - Experts share perspectives
  - Debate pros/cons of approaches
  - Reach consensus on strategy
- **Output**: Agreed-upon plan

#### Stage 3: Action Execution
- **Purpose**: Implement the agreed strategy
- **Process**:
  - Execute tasks based on plan
  - Agents collaborate during execution
  - Adapt to challenges
- **Output**: Task results

#### Stage 4: Evaluation
- **Purpose**: Assess quality and refine
- **Process**:
  - Evaluate outputs against requirements
  - Identify weaknesses
  - Iterate if needed
- **Output**: Refined solution

---

## Communication Mechanisms

### Expert Recruitment Communication

**Task Analysis:**
```
Task: "Write a research paper on climate change"

System analyzes requirements:
- Scientific knowledge (recruit Scientist agent)
- Writing skills (recruit Writer agent)
- Data analysis (recruit Analyst agent)
- Editing expertise (recruit Editor agent)
```

**Expert Selection Criteria:**
- Task-domain relevance
- Specialized capabilities
- Complementary skills
- Previous performance

### Collaborative Decision-Making

#### Discussion Patterns

**1. Round-Robin Discussion**
```
Agent A: "I suggest we structure the paper with..."
Agent B: "Good idea. I recommend adding data visualizations..."
Agent C: "We should also include recent studies..."
Agent D: "Let's divide sections as follows..."
```

**2. Debate Format**
```
Agent A: "Approach 1 is better because..."
Agent B: "I disagree. Approach 2 is more efficient because..."
Agent A: "That's a good point, but consider..."
Agent C: "What if we combine both approaches?"
```

**3. Consensus Building**
```
[Multiple proposals discussed]
Agent A: "It seems we agree on the core approach"
Agent B: "Yes, with the modifications I suggested"
Agent C: "I'm satisfied with this plan"
[Consensus reached]
```

#### Decision Making Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Voting** | Agents vote on proposals | When quick decision needed |
| **Consensus** | Continue until all agree | Critical decisions |
| **Expert-led** | Domain expert decides | Technical matters |
| **Hybrid** | Combine multiple strategies | Complex tasks |

### Action Execution Communication

**Parallel Execution:**
```
Agent A works on: Introduction section
Agent B works on: Data analysis
Agent C works on: Visualizations
[Agents communicate progress and dependencies]
```

**Sequential Execution:**
```
Agent A completes: Data gathering
Agent B starts: Analysis (using A's data)
Agent C starts: Writing (using B's analysis)
```

**Collaborative Execution:**
```
Agent A: "I'm stuck on this code snippet"
Agent B: "Let me help. Try this approach..."
Agent A: "Thanks! That worked"
```

### Evaluation Communication

**Peer Review:**
```
Agent A produces: Draft document
Agent B reviews: "Section 2 needs more evidence"
Agent C reviews: "Good structure, but add examples"
Agent A refines: Incorporates feedback
```

---

## Memory and State Management

### Shared Memory Pool

**Central Knowledge Repository:**
- All agent contributions stored centrally
- Historical decisions and rationale
- Intermediate results and artifacts

### Agent-Specific Memory

**Individual Context:**
- Each agent maintains specialized knowledge
- Role-specific expertise and heuristics
- Previous task experiences

### State Tracking

**Task Progress:**
- Current stage (recruitment, decision, execution, evaluation)
- Completed sub-tasks
- Pending work

**Collaboration State:**
- Active agents and their roles
- Communication history
- Consensus status

---

## Planning and Execution

### Stage-Based Planning

#### Expert Recruitment Planning

**Task Decomposition:**
```
Input: Complex task description
Process:
  1. Identify required capabilities
  2. Map capabilities to agent types
  3. Select optimal agent combination
Output: Expert team (3-5 agents)
```

**Example:**
```
Task: "Develop a mobile app"
Required capabilities:
  - UI/UX design -> Designer agent
  - Frontend development -> Frontend engineer
  - Backend development -> Backend engineer
  - Testing -> QA engineer
```

#### Collaborative Decision-Making Planning

**Approach Selection:**
```
Process:
  1. Each expert proposes approach
  2. Group discusses trade-offs
  3. Reaches consensus on strategy
  4. Creates detailed execution plan
Output: Agreed-upon plan
```

#### Execution Planning

**Task Allocation:**
```
Plan: "Build REST API"
Allocation:
  - Agent 1: Design API endpoints
  - Agent 2: Implement authentication
  - Agent 3: Create database schema
  - Agent 4: Write tests
```

**Dependency Management:**
- Identify task dependencies
- Order execution to respect dependencies
- Enable parallel work where possible

#### Evaluation Planning

**Quality Criteria:**
```
Criteria:
  - Functional correctness
  - Code quality
  - Documentation completeness
  - Test coverage
```

### Dynamic Replanning

**Triggers:**
- Evaluation reveals issues
- New requirements emerge
- Execution encounters blockers

**Process:**
```
Evaluation fails -> Return to decision-making
                       |
                       v
                   Revise approach
                       |
                       v
                   Re-execute with new plan
```

---

## Key Experimental Results

### Evaluation Domains

AgentVerse was tested across diverse domains:
1. **Text Understanding**: Reading comprehension, summarization
2. **Reasoning**: Logical puzzles, math problems
3. **Coding**: Code generation, debugging
4. **Tool Utilization**: API usage, web search
5. **Embodied AI**: Robotics tasks, game playing

### Performance Results

#### Text Understanding (Multiple benchmarks)

| Approach | Performance |
|----------|-------------|
| Single Agent (GPT-4) | 78.3% |
| AgentVerse (3 agents) | **84.7%** |
| **Improvement** | **+6.4%** |

#### Reasoning Tasks (GSM8K, MATH)

| Approach | GSM8K | MATH |
|----------|-------|------|
| Single Agent | 57.1% | 31.8% |
| AgentVerse | **68.4%** | **38.2%** |
| **Improvement** | **+11.3%** | **+6.4%** |

#### Coding Tasks (HumanEval, MBPP)

| Approach | HumanEval | MBPP |
|----------|-----------|------|
| Single Agent | 67.0% | 63.4% |
| AgentVerse | **73.2%** | **71.8%** |
| **Improvement** | **+6.2%** | **+8.4%** |

#### Tool Utilization

| Approach | Success Rate |
|----------|--------------|
| Single Agent | 72.5% |
| AgentVerse | **86.3%** |
| **Improvement** | **+13.8%** |

### Emergent Behaviors

AgentVerse discovered **emergent collaborative behaviors**:

#### 1. Spontaneous Role Specialization
```
Task: "Debug this code"
Emergent behavior:
  - Agent A: Identifies logical errors
  - Agent B: Suggests optimizations
  - Agent C: Proposes test cases
[Roles emerged naturally without explicit assignment]
```

#### 2. Collective Error Correction
```
Agent A: "Here's the solution [contains error]"
Agent B: "I notice a bug in line 5"
Agent C: "Let me propose a fix"
Agent A: "Thanks, I've updated the code"
[Group collectively improves solution]
```

#### 3. Knowledge Sharing
```
Agent A: "I'm not familiar with this library"
Agent B: "I've used it before. Here's how it works..."
Agent C: "Based on B's explanation, I suggest..."
[Knowledge transferred across agents]
```

#### 4. Division of Labor
```
Complex task emerges:
  - Agent A takes frontend
  - Agent B takes backend
  - Agent C takes testing
[Natural task distribution]
```

### Ablation Studies

#### Effect of Number of Agents

| Agents | Performance (avg) |
|--------|-------------------|
| 1 | 78.3% |
| 2 | 81.5% |
| 3 | **84.7%** |
| 5 | 84.2% |
| 7 | 83.1% |

**Finding**: 3 agents optimal for most tasks. More agents don't always help.

#### Effect of Four-Stage Framework

| Configuration | Performance |
|--------------|-------------|
| Single stage (execution only) | 76.2% |
| Two stages (recruit + execute) | 80.5% |
| Three stages (recruit + decide + execute) | 82.9% |
| Four stages (full framework) | **84.7%** |

**Finding**: All four stages contribute to performance improvement.

#### Effect of Collaborative Decision-Making

| Approach | Performance |
|----------|-------------|
| Single agent decides | 79.3% |
| Random agent decides | 80.1% |
| Collaborative decision | **84.7%** |

**Finding**: Collaborative decision-making significantly improves outcomes.

### Case Study: Complex Reasoning Task

**Task**: Solve multi-step math problem requiring multiple techniques

**Single Agent:**
- Attempted all steps alone
- Got stuck on intermediate calculation
- Final accuracy: 62%

**AgentVerse (3 agents):**
- Agent 1: Expert in algebra
- Agent 2: Expert in calculus
- Agent 3: Expert in geometry
- Agents collaborated on approach
- Final accuracy: 89%

**Key Observation**: Specialized agents outperformed generalist single agent.

---

## Implications for Multi-Agent Systems

### Architectural Patterns

1. **Four-stage framework**: Recruitment -> Decision -> Execution -> Evaluation
2. **Expert recruitment**: Assemble right team for task
3. **Collaborative decision-making**: Collective intelligence
4. **Emergent specialization**: Roles emerge naturally
5. **Iterative refinement**: Evaluation drives improvement

### Design Principles

**For General Multi-Agent Systems:**
- Use stage-based workflow for complex tasks
- Recruit specialized agents based on task requirements
- Enable collaborative decision-making
- Implement evaluation and iteration
- Allow emergent behaviors to develop

**For Specific Domains:**
- Define expert agent types for domain
- Create domain-specific evaluation criteria
- Design communication patterns for task type
- Set appropriate number of agents (3-5 optimal)

### Strengths

- **Superior performance**: Outperforms single agents across domains
- **Emergent behaviors**: Novel capabilities arise from collaboration
- **Flexibility**: Works across diverse task types
- **Robustness**: Collective error correction
- **Scalability**: Easy to add new expert types

### Limitations

- **Coordination overhead**: Multiple stages and agents increase complexity
- **Token costs**: More expensive than single agent
- **Optimal team size**: Finding right number of agents non-trivial
- **Communication overhead**: Long discussions consume tokens
- **Evaluation difficulty**: Hard to assess emergent behaviors

### Comparison to Other Frameworks

| Feature | AgentVerse | ChatDev | AutoGen | MetaGPT |
|---------|------------|---------|---------|---------|
| **Stages** | 4 (explicit) | 4 (phases) | Configurable | 5 (SOP) |
| **Expert recruitment** | Yes | Fixed roles | Customizable | Fixed roles |
| **Collaborative decision** | Yes | Limited | Yes | Limited |
| **Emergent behaviors** | Yes | No | Yes | No |
| **Domain** | General | Software dev | General | Software dev |
| **Optimal agents** | 3-5 | 5-7 | 2+ | 5-7 |

### Unique Contributions

1. **Four-stage framework**: First explicit stage-based approach
2. **Emergent behaviors**: Systematic study of emergent collaboration
3. **Expert recruitment**: Dynamic team assembly based on task
4. **Cross-domain validation**: Tested across 5 diverse domains
5. **Collaborative decision-making**: Emphasis on collective intelligence

---

## Code Example

```python
from agentverse import AgentVerse, ExpertAgent, Task

# Define expert agents
scientist = ExpertAgent(
    name="Scientist",
    expertise="Scientific knowledge and research",
    llm_config={"model": "gpt-4"}
)

writer = ExpertAgent(
    name="Writer",
    expertise="Technical writing and communication",
    llm_config={"model": "gpt-4"}
)

analyst = ExpertAgent(
    name="Analyst",
    expertise="Data analysis and visualization",
    llm_config={"model": "gpt-4"}
)

# Create AgentVerse system
system = AgentVerse(
    experts=[scientist, writer, analyst],
    stages=["recruitment", "decision", "execution", "evaluation"]
)

# Execute task
task = Task(
    description="Write a research report on renewable energy trends",
    requirements=["Include data analysis", "Cite recent studies", "Clear structure"]
)

result = system.solve(task)

# Output: Collaborative research report
print(result.output)
print(f"Stages completed: {result.stages_completed}")
print(f"Agents involved: {result.agents_used}")
```

---

## References

- Paper: https://arxiv.org/abs/2308.10848
- GitHub (official): https://github.com/OpenBMB/AgentVerse
- ICLR 2024: https://openreview.net/forum?id=EHg5eJ7vAU
- Documentation: https://github.com/OpenBMB/AgentVerse/blob/main/README.md
