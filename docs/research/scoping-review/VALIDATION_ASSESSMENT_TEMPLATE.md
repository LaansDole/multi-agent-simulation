# Validation Assessment Template

## LLM-Powered Generative Agents for Epidemic Simulation: Scoping Review

**Purpose:** This template assesses the rigor of validation methods in included studies. It supplements the main data extraction form and is used to:
1. Characterize validation practices across the field
2. Identify common validation gaps
3. Extract requirements for valid LLM-based epidemic simulations
4. Inform proof-of-concept implementation design

**Note:** This is NOT a quality appraisal for inclusion/exclusion. All studies meeting eligibility criteria are included regardless of validation rigor score.

---

## Study Identification

| Field | Value |
|-------|-------|
| **Extraction ID** | [STUDY-001] |
| **First Author** | |
| **Year** | |
| **Short Title** | |

---

## Section 1: Validation Methods Inventory

### 1.1 Validation Approaches Used

Check all validation methods employed in the study:

| Method | Used | Description/Details |
|--------|------|---------------------|
| **Comparison to real epidemic data** | [ ] Yes  [ ] No | |
| **Comparison to established epidemic models (SIR/SEIR)** | [ ] Yes  [ ] No | |
| **Comparison to traditional ABM** | [ ] Yes  [ ] No | |
| **Human behavior validation (surveys, experiments)** | [ ] Yes  [ ] No | |
| **Expert evaluation/review** | [ ] Yes  [ ] No | |
| **Sensitivity analysis** | [ ] Yes  [ ] No | |
| **Ablation studies** | [ ] Yes  [ ] No | |
| **Statistical significance testing** | [ ] Yes  [ ] No | |
| **Reproducibility documentation** | [ ] Yes  [ ] No | |
| **Other** | [ ] Yes  [ ] No | Specify: |

### 1.2 Validation Metrics Used

Check all metrics reported:

| Metric Category | Specific Metrics | Reported Values |
|-----------------|------------------|-----------------|
| **Epidemiological** | [ ] R0/Rt  [ ] Attack rate  [ ] Peak timing  [ ] Curve shape  [ ] Other: | |
| **Behavioral** | [ ] Compliance rate  [ ] Decision accuracy  [ ] Behavior distribution  [ ] Other: | |
| **Agent Fidelity** | [ ] Believability score  [ ] Human-likeness  [ ] Turing test  [ ] Other: | |
| **Computational** | [ ] Runtime  [ ] Memory  [ ] Scalability  [ ] Other: | |

---

## Section 2: Validation Rigor Assessment

Rate each dimension using the rubric below:

**Rating Scale:**
- **0 - Not Addressed:** Dimension not mentioned or assessed
- **1 - Minimally Addressed:** Mentioned but not rigorously evaluated
- **2 - Partially Addressed:** Some evaluation but with significant limitations
- **3 - Fully Addressed:** Rigorous evaluation with clear methodology

### V1: Empirical Grounding

> Is simulation output compared to actual epidemic data?

| Rating | Criteria |
|--------|----------|
| 0 | No comparison to real-world epidemic data |
| 1 | Mentions real epidemics but no quantitative comparison |
| 2 | Compares to some real data but limited scope or informal comparison |
| 3 | Systematic comparison to real epidemic curves, R0 estimates, or behavioral data with quantitative metrics |

**Rating:** [ ] 0  [ ] 1  [ ] 2  [ ] 3

**Evidence/Notes:**

---

### V2: Epidemiological Validity

> Are transmission dynamics consistent with established epidemiological principles?

| Rating | Criteria |
|--------|----------|
| 0 | No consideration of epidemiological validity |
| 1 | Claims epidemiological relevance but no verification |
| 2 | Some parameters grounded in epidemiology but transmission mechanics not validated |
| 3 | Transmission dynamics verified against SIR/SEIR or calibrated to epidemiological literature |

**Rating:** [ ] 0  [ ] 1  [ ] 2  [ ] 3

**Evidence/Notes:**

---

### V3: Behavioral Realism

> Are agent behaviors validated against human behavior data?

| Rating | Criteria |
|--------|----------|
| 0 | No validation of behavioral fidelity |
| 1 | Claims believable behavior but no empirical assessment |
| 2 | Some behavioral validation (e.g., qualitative review) but limited |
| 3 | Systematic validation against human behavior data, surveys, or experimental results |

**Rating:** [ ] 0  [ ] 1  [ ] 2  [ ] 3

**Evidence/Notes:**

---

### V4: Sensitivity Analysis

> Are results robust to parameter variations?

| Rating | Criteria |
|--------|----------|
| 0 | No sensitivity analysis |
| 1 | Mentions parameter uncertainty but no systematic analysis |
| 2 | Limited sensitivity analysis (few parameters, narrow ranges) |
| 3 | Comprehensive sensitivity analysis with systematic parameter variation |

**Rating:** [ ] 0  [ ] 1  [ ] 2  [ ] 3

**Evidence/Notes:**

---

### V5: Baseline Comparison

> Is the LLM approach compared to established methods?

| Rating | Criteria |
|--------|----------|
| 0 | No baseline comparison |
| 1 | Mentions other approaches but no direct comparison |
| 2 | Some comparison but limited (e.g., qualitative only, single baseline) |
| 3 | Rigorous comparison to multiple baselines with quantitative metrics |

**Rating:** [ ] 0  [ ] 1  [ ] 2  [ ] 3

**Evidence/Notes:**

---

### V6: Reproducibility

> Can results be replicated?

| Rating | Criteria |
|--------|----------|
| 0 | No reproducibility information |
| 1 | Methods described but insufficient detail for replication |
| 2 | Detailed methods but code/data not available |
| 3 | Code, data, and parameters available; methodology fully reproducible |

**Rating:** [ ] 0  [ ] 1  [ ] 2  [ ] 3

**Evidence/Notes:**

---

## Section 3: Validation Summary

### 3.1 Aggregate Scores

| Dimension | Score (0-3) |
|-----------|-------------|
| V1: Empirical Grounding | |
| V2: Epidemiological Validity | |
| V3: Behavioral Realism | |
| V4: Sensitivity Analysis | |
| V5: Baseline Comparison | |
| V6: Reproducibility | |
| **Total Score** | /18 |
| **Average Score** | /3.0 |

### 3.2 Validation Profile

```
V1 Empirical     [____]  0  1  2  3
V2 Epidemiology  [____]  0  1  2  3
V3 Behavioral    [____]  0  1  2  3
V4 Sensitivity   [____]  0  1  2  3
V5 Baselines     [____]  0  1  2  3
V6 Reproducible  [____]  0  1  2  3
```

### 3.3 Overall Validation Characterization

| Characterization | Description |
|------------------|-------------|
| **Strongest Dimension** | |
| **Weakest Dimension** | |
| **Critical Gaps** | |

---

## Section 4: Requirements Extraction

Based on this study's validation approach and gaps, what design requirements emerge?

### 4.1 What Validation Practices Should Be Adopted?

| Practice | Priority | Notes |
|----------|----------|-------|
| | [ ] High  [ ] Medium  [ ] Low | |
| | [ ] High  [ ] Medium  [ ] Low | |
| | [ ] High  [ ] Medium  [ ] Low | |

### 4.2 What Validation Gaps Should Be Addressed?

| Gap | Addressable in PoC? | Implementation Notes |
|-----|---------------------|---------------------|
| | [ ] Yes  [ ] No  [ ] Partial | |
| | [ ] Yes  [ ] No  [ ] Partial | |
| | [ ] Yes  [ ] No  [ ] Partial | |

### 4.3 Implied Design Requirements

List specific design requirements for valid LLM-based epidemic simulation implied by this study:

| Requirement | Category | Source (section/finding) |
|-------------|----------|--------------------------|
| | [ ] Architectural  [ ] Behavioral  [ ] Validation  [ ] Epidemiological | |
| | [ ] Architectural  [ ] Behavioral  [ ] Validation  [ ] Epidemiological | |
| | [ ] Architectural  [ ] Behavioral  [ ] Validation  [ ] Epidemiological | |

---

## Section 5: PoC Relevance Assessment

### 5.1 Relevance to Proof-of-Concept

| Question | Response |
|----------|----------|
| Does this study reveal a gap addressable by DevAll? | [ ] Yes  [ ] No  [ ] Partial |
| Does this study provide methods applicable to PoC validation? | [ ] Yes  [ ] No  [ ] Partial |
| Does this study provide architectural patterns for PoC? | [ ] Yes  [ ] No  [ ] Partial |

### 5.2 Specific PoC Implications

| Aspect | Implications for PoC Design |
|--------|----------------------------|
| **Architecture** | |
| **Behavioral Modeling** | |
| **Validation Approach** | |
| **Evaluation Metrics** | |

---

## Section 6: Assessor Notes

| Field | Notes |
|-------|-------|
| **Assessment Challenges** | |
| **Uncertainties** | |
| **Follow-up Needed** | |
| **Key Quotes** | |

---

## Quick Reference: Assessment Guidelines

### Scoring Calibration Examples

**V1 - Empirical Grounding:**
- Score 3 example: "Compared model R0 to CDC estimates; matched peak timing within 5% of actual COVID-19 data"
- Score 1 example: "Inspired by COVID-19 pandemic dynamics"
- Score 0 example: "Simulated generic disease spread"

**V2 - Epidemiological Validity:**
- Score 3 example: "Calibrated transmission probability to achieve R0 of 2.5 consistent with influenza literature"
- Score 1 example: "Agents can infect nearby agents"
- Score 0 example: No mention of transmission mechanics or epidemiological parameters

**V3 - Behavioral Realism:**
- Score 3 example: "Validated agent mask-wearing decisions against survey data from [citation]"
- Score 1 example: "Agents exhibit believable protective behaviors"
- Score 0 example: Behaviors not described or validated

**V4 - Sensitivity Analysis:**
- Score 3 example: "Varied infection probability (0.1-0.9), population size (100-10000), and memory length (7-30 days)"
- Score 1 example: "Results may vary with different parameters"
- Score 0 example: Single parameter configuration reported

**V5 - Baseline Comparison:**
- Score 3 example: "Compared to SEIR model, NetLogo ABM, and human subject responses across 5 metrics"
- Score 1 example: "Unlike traditional ABMs, our approach..."
- Score 0 example: No mention of alternative approaches

**V6 - Reproducibility:**
- Score 3 example: "Code available at [GitHub]; all parameters in Table 2; data at [DOI]"
- Score 1 example: "Implementation details in supplementary materials" (but not accessible)
- Score 0 example: No methodology details beyond high-level description

---

**Template Version:** 1.0  
**Last Updated:** March 2026
