# Data Extraction Template

## LLM-Powered Generative Agents for Epidemic Simulation: Scoping Review

**Instructions:** Complete one form per included study. Use "NR" for not reported, "NA" for not applicable.

---

## Section 1: Bibliographic Information

| Field | Value |
|-------|-------|
| **Extraction ID** | [STUDY-001] |
| **Extractor** | |
| **Extraction Date** | |
| **Authors** | |
| **Year** | |
| **Title** | |
| **Publication Venue** | |
| **Venue Type** | [ ] Journal  [ ] Conference  [ ] arXiv  [ ] Other: ___ |
| **DOI/URL** | |
| **Citation Count** (at extraction) | |
| **Country/Affiliation** | |

---

## Section 2: Study Overview

| Field | Value |
|-------|-------|
| **Study Type** | [ ] Empirical  [ ] Framework/Architecture  [ ] Proof-of-concept  [ ] Benchmark  [ ] Mixed |
| **Primary Objective** | |
| **Research Questions** | |
| **Key Contributions Claimed** | |

---

## Section 3: Technical Architecture (RQ1)

### 3.1 Language Model

| Field | Value |
|-------|-------|
| **Primary LLM Used** | [ ] GPT-4  [ ] GPT-3.5  [ ] LLaMA 2  [ ] Claude  [ ] PaLM  [ ] Other: ___ |
| **Model Version/Size** | |
| **API or Local Deployment** | [ ] API  [ ] Local  [ ] Both  [ ] NR |
| **Fine-tuning Applied** | [ ] Yes  [ ] No  [ ] NR |
| **If Fine-tuned, Method** | |

### 3.2 Agent Architecture

| Field | Value |
|-------|-------|
| **Agent Framework** | [ ] Custom  [ ] LangChain  [ ] AutoGPT  [ ] CAMEL  [ ] MetaGPT  [ ] Other: ___ |
| **Number of Agent Types** | |
| **Agent Types/Roles** | |
| **Multi-Agent** | [ ] Yes  [ ] No |
| **If Multi-Agent, Interaction Type** | [ ] Cooperative  [ ] Competitive  [ ] Mixed  [ ] Independent |

### 3.3 Memory System

| Component | Present | Description |
|-----------|---------|-------------|
| **Short-term Memory** | [ ] Yes  [ ] No  [ ] NR | |
| **Long-term Memory** | [ ] Yes  [ ] No  [ ] NR | |
| **Episodic Memory** | [ ] Yes  [ ] No  [ ] NR | |
| **Semantic Memory** | [ ] Yes  [ ] No  [ ] NR | |
| **Memory Retrieval Method** | | |
| **Memory Reflection/Synthesis** | [ ] Yes  [ ] No  [ ] NR | |

### 3.4 Agent Capabilities

| Capability | Present | Implementation Notes |
|------------|---------|---------------------|
| **Planning** | [ ] Yes  [ ] No  [ ] NR | |
| **Reasoning** | [ ] Yes  [ ] No  [ ] NR | |
| **Tool Use** | [ ] Yes  [ ] No  [ ] NR | |
| **Natural Language Communication** | [ ] Yes  [ ] No  [ ] NR | |
| **Environment Perception** | [ ] Yes  [ ] No  [ ] NR | |
| **Learning/Adaptation** | [ ] Yes  [ ] No  [ ] NR | |

---

## Section 4: Simulation Design (RQ2)

### 4.1 Epidemic Context

| Field | Value |
|-------|-------|
| **Disease/Outbreak Type** | [ ] COVID-19  [ ] Influenza  [ ] Generic/Abstract  [ ] Other: ___ |
| **Epidemic Model Type** | [ ] SIR/SEIR  [ ] Network-based  [ ] Spatial  [ ] Behavioral  [ ] Other: ___ |
| **Transmission Mechanism Modeled** | [ ] Yes  [ ] No  [ ] Simplified |
| **Public Health Interventions** | |

### 4.2 Population and Environment

| Field | Value |
|-------|-------|
| **Population Size** | |
| **Agent Heterogeneity** | [ ] Homogeneous  [ ] Demographic  [ ] Behavioral  [ ] Full heterogeneity |
| **Environment Type** | [ ] Abstract  [ ] Grid-based  [ ] Network  [ ] Geographic  [ ] 3D/Virtual |
| **Environment Name (if applicable)** | |
| **Simulation Time Scale** | |
| **Simulation Duration** | |

### 4.3 Scenario Design

| Field | Value |
|-------|-------|
| **Scenario Type** | [ ] Historical recreation  [ ] Hypothetical  [ ] Counterfactual  [ ] Policy testing |
| **Scenario Description** | |
| **Number of Scenarios Tested** | |

---

## Section 5: Behavioral Modeling (RQ3)

### 5.1 Behaviors Modeled

| Behavior Type | Modeled | How Implemented |
|---------------|---------|-----------------|
| **Health Protective Behaviors** (masking, distancing) | [ ] Yes  [ ] No  [ ] NR | |
| **Vaccination Decisions** | [ ] Yes  [ ] No  [ ] NR | |
| **Information Seeking/Sharing** | [ ] Yes  [ ] No  [ ] NR | |
| **Social Interactions** | [ ] Yes  [ ] No  [ ] NR | |
| **Mobility/Movement** | [ ] Yes  [ ] No  [ ] NR | |
| **Compliance with Interventions** | [ ] Yes  [ ] No  [ ] NR | |
| **Emotional/Psychological Responses** | [ ] Yes  [ ] No  [ ] NR | |
| **Economic Behaviors** | [ ] Yes  [ ] No  [ ] NR | |

### 5.2 Decision-Making Mechanisms

| Field | Value |
|-------|-------|
| **Decision Mechanism** | [ ] LLM reasoning  [ ] Rule-based  [ ] Hybrid  [ ] Other: ___ |
| **Personality/Traits Modeled** | [ ] Yes  [ ] No  [ ] NR |
| **If Yes, Trait Framework** | [ ] Big Five  [ ] MBTI  [ ] Custom  [ ] Other: ___ |
| **Social Influence Modeled** | [ ] Yes  [ ] No  [ ] NR |
| **Information Processing** | |

### 5.3 Emergent Behaviors

| Field | Value |
|-------|-------|
| **Emergent Behaviors Reported** | [ ] Yes  [ ] No |
| **Types of Emergence** | |
| **Emergence Evaluation Method** | |

---

## Section 6: Validation and Evaluation (RQ4)

### 6.1 Validation Methods

| Method | Used | Description |
|--------|------|-------------|
| **Comparison to Real-World Data** | [ ] Yes  [ ] No | |
| **Comparison to Traditional ABM** | [ ] Yes  [ ] No | |
| **Expert Evaluation** | [ ] Yes  [ ] No | |
| **Human Subject Evaluation** | [ ] Yes  [ ] No | |
| **Sensitivity Analysis** | [ ] Yes  [ ] No | |
| **Ablation Studies** | [ ] Yes  [ ] No | |
| **Statistical Testing** | [ ] Yes  [ ] No | |

### 6.2 Evaluation Metrics

| Metric Category | Specific Metrics Used |
|-----------------|----------------------|
| **Epidemiological Accuracy** | |
| **Behavioral Realism** | |
| **Agent Believability** | |
| **Computational Efficiency** | |
| **Other** | |

### 6.3 Baselines/Comparisons

| Field | Value |
|-------|-------|
| **Baselines Used** | |
| **Traditional ABM Comparison** | [ ] Yes  [ ] No |
| **Human Behavior Comparison** | [ ] Yes  [ ] No |

### 6.4 Datasets Used

| Field | Value |
|-------|-------|
| **Real-World Data Sources** | |
| **Synthetic Data** | [ ] Yes  [ ] No |
| **Data Availability** | [ ] Public  [ ] Upon request  [ ] Not available  [ ] NR |

---

## Section 7: Outcomes and Limitations (RQ5)

### 7.1 Key Findings

| Field | Value |
|-------|-------|
| **Primary Findings** | |
| **Novel Contributions** | |
| **Practical Implications** | |

### 7.2 Reported Limitations

| Limitation Category | Reported | Description |
|--------------------|----------|-------------|
| **Computational Cost** | [ ] Yes  [ ] No | |
| **Scalability** | [ ] Yes  [ ] No | |
| **LLM Hallucination/Inconsistency** | [ ] Yes  [ ] No | |
| **Memory Limitations** | [ ] Yes  [ ] No | |
| **Validation Challenges** | [ ] Yes  [ ] No | |
| **Reproducibility** | [ ] Yes  [ ] No | |
| **Generalizability** | [ ] Yes  [ ] No | |
| **Other** | | |

### 7.3 Future Directions Proposed

| Field | Value |
|-------|-------|
| **Technical Improvements** | |
| **Application Extensions** | |
| **Methodological Advances** | |

---

## Section 8: Comparison to Traditional Methods (RQ6)

| Field | Value |
|-------|-------|
| **Explicit Comparison Made** | [ ] Yes  [ ] No |
| **Advantages over Traditional ABM** | |
| **Disadvantages vs Traditional ABM** | |
| **Complementary Use Suggested** | [ ] Yes  [ ] No |

---

## Section 9: Quality and Relevance Assessment

### 9.1 Methodological Quality (Subjective Assessment)

| Dimension | Rating (1-5) | Notes |
|-----------|--------------|-------|
| **Clarity of Objectives** | | |
| **Technical Rigor** | | |
| **Validation Adequacy** | | |
| **Reproducibility** | | |
| **Overall Quality** | | |

### 9.2 Relevance to Review

| Field | Value |
|-------|-------|
| **Relevance Score (1-5)** | |
| **Key Contribution to Review** | |

---

## Section 10: Extractor Notes

| Field | Value |
|-------|-------|
| **Extraction Challenges** | |
| **Ambiguities/Uncertainties** | |
| **Follow-up Required** | |
| **Additional Comments** | |

---

## Quick Reference: Coding Guidelines

### Study Type Definitions
- **Empirical:** Presents experimental results with quantitative/qualitative evaluation
- **Framework/Architecture:** Proposes system design without extensive evaluation
- **Proof-of-concept:** Demonstrates feasibility with limited evaluation
- **Benchmark:** Focuses on evaluation methodology or comparison
- **Mixed:** Combines multiple types

### Quality Rating Scale (1-5)
1. Poor: Major flaws, unclear methods
2. Below Average: Some issues, limited detail
3. Average: Acceptable, standard practices
4. Good: Well-designed, clear methods
5. Excellent: Rigorous, comprehensive, reproducible

### Relevance Rating Scale (1-5)
1. Marginally relevant: Tangential to review questions
2. Somewhat relevant: Addresses some aspects
3. Relevant: Directly addresses review questions
4. Highly relevant: Core contribution to review
5. Essential: Foundational work for the field

---

**Form Version:** 1.0  
**Last Updated:** March 2026
