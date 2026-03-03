# CAMEL: Research Summary

**Paper:** CAMEL: Communicative Agents for "Mind" Exploration of Large Language Model Society  
**Authors:** Guohao Li, Hasan Hammoud, Hani Itani, Dmitrii Khizbullin, Bernard Ghanem  
**arXiv:** 2303.17760  
**Published:** March 30, 2023  
**Conference:** NeurIPS 2023  
**URL:** https://arxiv.org/abs/2303.17760

---

## Problem Statement and Motivation

### The Challenge
Scaling up LLM capabilities requires:
- Generating high-quality training data at scale
- Enabling autonomous problem-solving without human intervention
- Exploring emergent behaviors in multi-agent interactions
- Creating cooperative AI systems that can collaborate effectively

### The Gap
Prior approaches faced:
- **Data scarcity**: Limited high-quality conversational data for training
- **Human dependency**: Heavy reliance on human prompting and oversight
- **Single-agent limitations**: One LLM cannot effectively critique itself
- **Lack of cooperation**: No framework for autonomous agent collaboration

### The Solution
CAMEL introduces a **communicative agent framework** for "mind" exploration:
1. Two agents engage in role-playing conversations (AI Assistant + AI User)
2. Agents communicate through natural language to solve tasks
3. Framework generates large-scale conversational datasets
4. Enables autonomous cooperation with minimal human intervention

---

## Architecture Overview

CAMEL uses a **two-agent role-playing architecture**:

```
AI User Agent <---> AI Assistant Agent
      |                    |
  Provides tasks      Executes tasks
  Asks questions      Provides answers
  Gives feedback      Refines solutions
```

### Agent Roles

**AI User Agent:**
- Defines task requirements and constraints
- Asks clarifying questions
- Provides feedback on solutions
- Breaks down complex problems into sub-problems

**AI Assistant Agent:**
- Executes tasks and solves problems
- Provides detailed explanations
- Generates code, solutions, or content
- Responds to user feedback and refines work

### Conversation Flow

```
1. User defines goal: "Develop a Python game"
2. User Agent asks: "What type of game?"
3. Assistant Agent answers: "A snake game"
4. User Agent requests: "Show me the implementation"
5. Assistant Agent provides: Code + explanation
6. [Continue until task completion]
```

---

## Communication Mechanisms

### Inception Prompting

CAMEL uses **inception prompting** to bootstrap agent conversations:

#### User Agent Prompt Template
```
You are a user who needs help with [TASK]. 
Your role is to:
1. Clearly define requirements
2. Ask specific questions
3. Provide constructive feedback
4. Ensure the solution meets your needs

Never mention you are an AI. Communicate naturally.
```

#### Assistant Agent Prompt Template
```
You are an AI assistant helping with [TASK].
Your role is to:
1. Provide detailed solutions
2. Explain your reasoning
3. Revise based on feedback
4. Ensure quality and correctness

Never mention you are an AI. Communicate naturally.
```

### Conversation Structure

**Termination Conditions:**
- Task successfully completed
- Maximum conversation turns reached
- Agents reach consensus on completion

**Message Format:**
```
User Agent: <question or request>
Assistant Agent: <response or solution>
User Agent: <feedback or follow-up>
Assistant Agent: <refined response>
...
```

### Cooperative Communication Patterns

#### 1. Task Decomposition
```
User: "Build a web scraper"
Assistant: "I'll break this into: 1) Setup, 2) Parsing, 3) Storage"
User: "Great, start with setup"
```

#### 2. Iterative Refinement
```
User: "This code has a bug in line 5"
Assistant: "You're right. I've fixed it by adding error handling"
User: "Perfect, now add tests"
```

#### 3. Knowledge Sharing
```
User: "What's the best library for this?"
Assistant: "BeautifulSoup is good for simple cases, Scrapy for complex"
User: "Let's use BeautifulSoup"
```

---

## Memory and State Management

### Conversation History

CAMEL maintains:
- **Full conversation transcript**: All messages between agents
- **Context accumulation**: Previous decisions inform future turns
- **Task state**: Progress tracking toward goal completion

### Memory Constraints

**Context Window Management:**
- Long conversations may exceed LLM context limits
- CAMEL uses truncation or summarization for very long dialogues
- Important context preserved across truncations

### State Tracking

**Task Progress:**
- Completed sub-tasks
- Pending requirements
- Issues encountered and resolved

**Solution Evolution:**
- Initial solution attempts
- Revisions based on feedback
- Final deliverables

---

## Planning and Execution

### Task-Driven Planning

CAMEL agents engage in **collaborative planning**:

#### Planning Process

1. **Goal Definition**: User agent specifies overall objective
2. **Task Breakdown**: Agents jointly decompose into sub-tasks
3. **Execution**: Assistant agent implements each sub-task
4. **Review**: User agent evaluates outputs
5. **Refinement**: Iterative improvement based on feedback

### Autonomous Cooperation

**Key Innovation**: Agents cooperate autonomously without human intervention:

```
Human provides: Initial task description
Agents perform: 
  - Task decomposition
  - Solution generation
  - Self-evaluation
  - Iterative refinement
Output: Complete solution with minimal human input
```

### Example Planning Flow

**Task: "Develop a Python calculator"**

```
Turn 1:
User: "I need a calculator that handles basic arithmetic"
Assistant: "I'll create a Python class with add, subtract, multiply, divide"

Turn 2:
User: "Also add support for parentheses and operator precedence"
Assistant: "I'll implement a parser for expressions using the shunting-yard algorithm"

Turn 3:
User: "Can you add error handling for division by zero?"
Assistant: "I've added try-except blocks to handle ZeroDivisionError"

Turn 4:
User: "Great! Add a CLI interface"
Assistant: "I've created a command-line interface with input validation"

[Continue until completion]
```

---

## Key Experimental Results

### Dataset Generation

CAMEL generated large-scale conversational datasets across multiple domains:

#### Dataset Statistics

| Domain | Conversations | Turns per Conv | Total Turns |
|--------|--------------|----------------|-------------|
| **Coding** | 25,000 | 15.3 | 382,500 |
| **Math** | 20,000 | 12.7 | 254,000 |
| **Science** | 15,000 | 14.1 | 211,500 |
| **Total** | **60,000** | **14.0 avg** | **840,000+** |

### Dataset Quality

**Human Evaluation:**
- **Relevance**: 92% of conversations relevant to task
- **Coherence**: 89% coherent and logical flow
- **Helpfulness**: 86% provide useful information

### Model Training

CAMEL datasets used to fine-tune LLMs:

#### Performance Improvement

| Model | Task | Baseline | After CAMEL Training | Improvement |
|-------|------|----------|----------------------|-------------|
| LLaMA-7B | Coding (HumanEval) | 10.5% | 14.2% | +3.7% |
| LLaMA-7B | Math (GSM8K) | 11.8% | 16.3% | +4.5% |
| LLaMA-7B | Science (MMLU) | 33.5% | 38.9% | +5.4% |

**Key Finding**: Training on CAMEL-generated conversational data improves LLM performance across domains.

### Benchmark Comparisons

#### Coding Tasks (HumanEval)

| Approach | Pass@1 |
|----------|--------|
| Single LLM (GPT-3.5) | 28.8% |
| CAMEL (no human) | 32.1% |
| CAMEL (with human feedback) | 35.4% |

**Finding**: Two-agent cooperation outperforms single LLM, even without human intervention.

#### Math Reasoning (GSM8K)

| Approach | Accuracy |
|----------|----------|
| Single LLM (GPT-3.5) | 57.1% |
| CAMEL (two agents) | 63.8% |

**Finding**: Collaborative problem-solving improves mathematical reasoning.

### Emergent Behaviors

CAMEL observed emergent behaviors in agent conversations:

1. **Self-correction**: Agents identify and fix their own errors
2. **Knowledge synthesis**: Agents combine knowledge from multiple sources
3. **Creative problem-solving**: Novel solutions emerge from dialogue
4. **Teaching behavior**: Assistant agent explains concepts to user agent

### Ablation Studies

#### Effect of Conversation Turns

| Turns | HumanEval Pass@1 |
|-------|------------------|
| 1 (single shot) | 28.8% |
| 5 | 30.2% |
| 10 | 31.7% |
| 20 | **32.1%** |

**Finding**: More conversation turns improve solution quality.

#### Effect of Role Assignment

| Configuration | HumanEval Pass@1 |
|--------------|------------------|
| Two identical agents | 29.5% |
| Role-play (user + assistant) | **32.1%** |
| **Improvement** | **+2.6%** |

**Finding**: Distinct roles improve cooperation quality.

---

## Implications for Multi-Agent Systems

### Architectural Patterns

1. **Two-agent role-playing**: Simple but effective collaboration pattern
2. **Inception prompting**: Bootstrap agent behavior without human intervention
3. **Task-driven communication**: Conversations centered around specific goals
4. **Autonomous cooperation**: Minimal human oversight required

### Design Principles

**For Conversational Data Generation:**
- Use two-agent role-playing for scalable dataset creation
- Implement inception prompts to define agent roles clearly
- Allow long conversations for complex tasks
- Enable self-correction through iterative refinement

**For General Multi-Agent Systems:**
- Role assignment improves collaboration quality
- Long conversations enable better solutions than single-shot
- Autonomous cooperation reduces human dependency
- Task-driven communication maintains focus

### Strengths

- **Scalability**: Can generate massive conversational datasets
- **Autonomy**: Minimal human intervention required
- **Quality**: Outperforms single-agent approaches
- **Versatility**: Works across domains (coding, math, science)
- **Emergent behaviors**: Novel capabilities emerge from interaction

### Limitations

- **Cost**: Long conversations consume many tokens
- **Context limits**: Very long dialogues may exceed context windows
- **Domain knowledge**: Limited by base LLM's knowledge
- **Hallucination**: Agents may generate incorrect information
- **Evaluation difficulty**: Hard to assess solution quality automatically

### Comparison to Other Frameworks

| Feature | CAMEL | ChatDev | AutoGen | Stanford Agents |
|---------|-------|---------|---------|-----------------|
| **Agents** | 2 | 5-7 | Configurable | 25 |
| **Roles** | User + Assistant | Software roles | Customizable | Personalities |
| **Communication** | Natural dialogue | Chat chains | Flexible | Natural language |
| **Human input** | Minimal | None | Optional | None |
| **Dataset generation** | Yes | No | No | No |
| **Domain** | General | Software dev | General | Social simulation |

### Unique Contributions

1. **Inception prompting**: Novel technique to bootstrap agent behavior
2. **Scalable data generation**: First framework focused on dataset creation
3. **Minimal human intervention**: Autonomous cooperation
4. **Cross-domain applicability**: Works across coding, math, science

---

## Code Example

```python
from camel.agents import AssistantAgent, UserAgent
from camel.messages import SystemMessage

# Define inception prompts
assistant_sys_msg = SystemMessage(
    role_name="AI Assistant",
    content="You are a helpful AI assistant. Provide detailed solutions."
)

user_sys_msg = SystemMessage(
    role_name="AI User",
    content="You are a user who needs help. Ask specific questions."
)

# Create agents
assistant = AssistantAgent(assistant_sys_msg)
user = UserAgent(user_sys_msg)

# Initiate conversation
task_prompt = "Develop a Python function to sort a list using quicksort"

# Agents converse autonomously
user_msg = user.step(task_prompt)
assistant_msg = assistant.step(user_msg)

# Continue conversation for multiple turns
for _ in range(10):
    user_msg = user.step(assistant_msg)
    assistant_msg = assistant.step(user_msg)
    
    # Check for task completion
    if assistant_msg.terminated:
        break

# Final solution in assistant_msg.content
```

---

## References

- Paper: https://arxiv.org/abs/2303.17760
- GitHub (official): https://github.com/camel-ai/camel
- NeurIPS 2023: https://neurips.cc/virtual/2023/poster/70569
- Project Website: https://www.camel-ai.org/
- Dataset: https://huggingface.co/datasets/camel-ai/ai_society
