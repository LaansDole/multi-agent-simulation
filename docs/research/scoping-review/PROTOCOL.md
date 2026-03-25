# Scoping Review Protocol

## LLM-Powered Generative Agents for Epidemic Simulation: A Scoping Review with Validation Assessment and Proof-of-Concept Implementation

**Protocol Version:** 2.0  
**Date:** March 2026  
**Protocol Registration:** To be registered with OSF (Open Science Framework)

---

## 1. Administrative Information

### 1.1 Title
LLM-Powered Generative Agents for Epidemic Simulation: A Scoping Review with Validation Assessment and Proof-of-Concept Implementation

### 1.2 Review Team
- **Primary Reviewer:** [Your Name], PhD Candidate, [Department], [University]
- **Secondary Reviewer:** [Advisor Name], [Title], [Department], [University]
- **Methodological Advisor:** [If applicable]

### 1.3 Timeline
| Phase | Duration | Target Dates | Deliverables |
|-------|----------|--------------|--------------|
| Protocol Development | 1 week | Week 1 | Final protocol |
| Database Searching | 1 week | Week 2 | Search results, deduplicated records |
| Title/Abstract Screening | 1 week | Week 3 | Screened records |
| Full-Text Screening | 1 week | Week 4 | Included studies list |
| Data Extraction + Validation Assessment | 1.5 weeks | Weeks 5-6 | Completed extraction forms |
| Gap Identification + PoC Design | 0.5 weeks | Week 6 | PoC specification |
| Proof-of-Concept Implementation | 1 week | Week 7 | Working prototype |
| Analysis, Integration & Writing | 1 week | Week 8 | Final paper |
| **Total** | **8 weeks** | | |

---

## 2. Introduction and Rationale

### 2.1 Background
Large Language Models (LLMs) have emerged as a transformative technology for creating autonomous agents capable of human-like reasoning, communication, and decision-making. The seminal work by Park et al. [1] demonstrated that LLM-powered "generative agents" can simulate believable human behavior in interactive environments, spawning significant research interest in applying these systems to complex social simulations.

Epidemic simulation represents a critical application domain where understanding human behavior, social dynamics, and decision-making under uncertainty is paramount. Traditional agent-based models (ABMs) for epidemic simulation rely on predetermined rules and statistical distributions, limiting their ability to capture the nuanced, context-dependent nature of human responses to disease outbreaks [2]. LLM-powered generative agents offer potential advantages including:

- **Emergent behavior**: Complex social dynamics arising from individual agent interactions
- **Natural language reasoning**: Agents that can process and respond to information as humans do
- **Adaptive decision-making**: Behavioral responses that evolve based on context and memory
- **Scenario flexibility**: Rapid adaptation to new epidemic scenarios without reprogramming

### 2.2 Rationale for Methodological Approach

#### 2.2.1 Why Scoping Review (Not Systematic Review)?

Following the guidance of Munn et al. [3], we adopt a scoping review rather than systematic review approach based on the following considerations:

| Consideration | Assessment | Implication |
|---------------|------------|-------------|
| **Question Type** | Exploratory mapping, not effectiveness | Scoping appropriate |
| **Field Maturity** | Emerging (most work 2023-2024) | Insufficient evidence for SR |
| **Outcome Heterogeneity** | No standardized outcomes across studies | Meta-analysis not feasible |
| **Primary Purpose** | Map landscape + extract design requirements | Scoping appropriate |

A systematic review would be premature for this field, as there is insufficient comparable evidence to synthesize answers to specific effectiveness questions.

#### 2.2.2 Why Include Validation Assessment?

While traditional scoping reviews do not assess methodological quality, Munn et al. [3] note that quality assessment may be included "if there is a specific requirement due to the nature of the scoping review aim." Our review has such a requirement:

> **Justification:** This review aims not only to map existing approaches but to extract **design requirements** for building epidemiologically valid LLM-based simulations. To responsibly inform implementation decisions, we must assess whether existing validation methods are rigorous enough to learn from.

The validation assessment component does NOT aim to:
- Synthesize effectiveness outcomes
- Provide clinical or policy recommendations
- Rank studies by quality for inclusion/exclusion

The validation assessment DOES aim to:
- Characterize the rigor of validation approaches across studies
- Identify which validation methods are underutilized
- Extract requirements for valid LLM-based epidemic simulation
- Inform the proof-of-concept implementation design

#### 2.2.3 Why Include Proof-of-Concept Implementation?

The addition of a proof-of-concept implementation addresses a key limitation of pure scoping reviews: the "so what?" problem. By implementing a prototype that addresses a gap identified in the review, this study:

1. **Demonstrates feasibility** of addressing identified gaps
2. **Bridges theory and practice** by translating review findings into concrete design
3. **Provides stronger contribution** for qualifying paper requirements
4. **Leverages available resources** (DevAll multi-agent orchestration platform)

### 2.3 Objectives

**Primary Objective:** To systematically map the current state of research on LLM-powered generative agents for epidemic simulation, assess validation approaches, and demonstrate feasibility of addressing an identified gap through proof-of-concept implementation.

**Secondary Objectives:**
1. Characterize architectural approaches and technical implementations
2. Identify types of epidemic scenarios and research questions addressed
3. **Assess validation methods against epidemiological standards** (validation assessment)
4. Synthesize reported limitations and challenges
5. Extract design requirements for valid LLM-based epidemic simulation
6. **Implement proof-of-concept addressing a key identified gap** (implementation)

---

## 3. Research Questions

### 3.1 PCC Framework Elements

| Element | Definition | Operationalization |
|---------|------------|-------------------|
| **Population** | LLM-powered generative agents | Transformer-based language models (GPT-3.5+, GPT-4, LLaMA 2+, Claude, PaLM, etc.) used to power autonomous agents with memory, planning, and reasoning capabilities |
| **Concept** | Epidemic/outbreak simulation | Computational modeling of infectious disease spread, public health interventions, or population-level behavioral responses to epidemics/pandemics |
| **Context** | Research and application settings | Academic research, public health planning tools, policy analysis frameworks, educational simulations |

### 3.2 Research Questions

**Primary Research Question:**
> What is the current state of research on LLM-powered generative agents for epidemic simulation, and what are the key gaps in validation approaches that limit their practical utility?

**Secondary Research Questions:**

| ID | Question | Component | Rationale |
|----|----------|-----------|-----------|
| RQ1 | What LLM architectures and agent frameworks are used for epidemic simulation? | Scoping | Characterize technical approaches |
| RQ2 | What types of epidemic scenarios and diseases are being modeled? | Scoping | Map application domains |
| RQ3 | How do studies model human behavior during epidemics? | Scoping | Understand behavioral modeling |
| RQ4 | What validation methods are employed and how rigorous are they? | **Validation Assessment** | Assess methodological rigor |
| RQ5 | What are the gaps between current validation practices and epidemiological standards? | **Validation Assessment** | Identify validation gaps |
| RQ6 | What design requirements emerge for building valid LLM-based epidemic simulations? | **Synthesis** | Extract actionable requirements |
| RQ7 | Can an identified gap be feasibly addressed using existing multi-agent platforms? | **Implementation** | Demonstrate feasibility |

---

## 4. Eligibility Criteria

### 4.1 Inclusion Criteria

| Criterion | Description | Rationale |
|-----------|-------------|-----------|
| **IC1: Agent Type** | Studies must use transformer-based LLMs (GPT-3.5+, GPT-4, LLaMA 2+, Claude, PaLM, Gemini, or equivalent) to power autonomous agents | Focus on modern generative AI capabilities |
| **IC2: Agent Capabilities** | Agents must demonstrate at least TWO of: (a) memory/state persistence, (b) autonomous decision-making, (c) natural language interaction, (d) planning/reasoning | Distinguish from simple LLM prompting |
| **IC3: Simulation Domain** | Studies must involve simulation of epidemic/pandemic scenarios, infectious disease spread, public health emergencies, or population behavioral responses to outbreaks | Scope to epidemic domain |
| **IC4: Publication Type** | Peer-reviewed journal articles, conference papers, or preprints with demonstrated impact (10+ citations for arXiv) | Ensure quality threshold |
| **IC5: Language** | English language publications | Practical constraint |
| **IC6: Availability** | Full text accessible | Required for data extraction |

### 4.2 Exclusion Criteria

| Criterion | Description | Rationale |
|-----------|-------------|-----------|
| **EC1** | Studies using only rule-based agents or traditional ABMs without LLM integration | Outside technological scope |
| **EC2** | Studies using LLMs only for data analysis, not agent simulation | Not agent-based |
| **EC3** | Pure NLP/chatbot applications without simulation component | Not simulation research |
| **EC4** | Medical diagnosis or clinical decision support without population simulation | Different application domain |
| **EC5** | Opinion pieces, editorials, or reviews without original research | No primary data |
| **EC6** | Studies where epidemic/health is only mentioned peripherally | Not focused on epidemic simulation |
| **EC7** | Duplicate publications of same study | Avoid double-counting |

### 4.3 Operational Definitions

**Generative Agent:** An autonomous software entity powered by an LLM that can perceive its environment, maintain memory of past experiences, make decisions, and take actions based on natural language reasoning.

**Epidemic Simulation:** Computational modeling that represents the spread of infectious disease through a population, including transmission dynamics, intervention effects, or behavioral responses.

**LLM-Powered:** The agent's core reasoning, decision-making, or communication capabilities are driven by a large language model rather than predefined rules or statistical models.

**Validation:** Any method used to assess whether simulation outputs correspond to real-world phenomena, including comparison to empirical data, expert evaluation, sensitivity analysis, or benchmarking against established models.

---

## 5. Search Strategy

### 5.1 Information Sources

| Database | Rationale | Coverage |
|----------|-----------|----------|
| **Google Scholar** | Broad coverage, includes preprints | All disciplines |
| **IEEE Xplore** | Technical/engineering focus | CS, Engineering |
| **ACM Digital Library** | Computing research | CS, HCI |
| **PubMed/MEDLINE** | Biomedical literature | Medicine, Public Health |
| **arXiv** | Preprints in AI/ML | CS, AI/ML |
| **Semantic Scholar** | AI-focused discovery | Cross-disciplinary |

### 5.2 Search Terms

**Concept 1: LLM/Generative Agents**
```
"large language model*" OR "LLM" OR "GPT-4" OR "GPT-3.5" OR "ChatGPT" OR 
"generative agent*" OR "LLM agent*" OR "autonomous agent*" OR "LLM-based agent*" OR
"language model agent*" OR "LLaMA" OR "Claude" OR "transformer agent*"
```

**Concept 2: Simulation/Modeling**
```
"simulation" OR "agent-based model*" OR "ABM" OR "multi-agent" OR 
"computational model*" OR "social simulation" OR "behavior simulation" OR
"synthetic population" OR "virtual population"
```

**Concept 3: Epidemic/Health Domain**
```
"epidemic*" OR "pandemic*" OR "outbreak" OR "infectious disease*" OR 
"disease spread" OR "contagion" OR "public health" OR "COVID*" OR 
"vaccination" OR "health intervention*" OR "epidemiolog*"
```

### 5.3 Database-Specific Search Strings

**Google Scholar:**
```
("large language model" OR "LLM" OR "GPT-4" OR "generative agent") 
AND ("simulation" OR "agent-based model" OR "multi-agent") 
AND ("epidemic" OR "pandemic" OR "outbreak" OR "infectious disease" OR "public health")
```

**IEEE Xplore:**
```
(("large language model*" OR "LLM" OR "GPT" OR "generative agent*") 
AND ("simulation" OR "agent-based" OR "multi-agent") 
AND ("epidemic*" OR "pandemic*" OR "disease" OR "public health"))
```

**PubMed:**
```
(("large language model"[tiab] OR "LLM"[tiab] OR "GPT"[tiab] OR "generative agent"[tiab]) 
AND ("simulation"[tiab] OR "agent-based"[tiab] OR "computational model"[tiab]) 
AND ("epidemic"[tiab] OR "pandemic"[tiab] OR "infectious disease"[tiab] OR "public health"[tiab]))
```

**arXiv:**
```
(ti:"large language model" OR ti:"LLM" OR ti:"generative agent" OR abs:"LLM agent") 
AND (ti:simulation OR ti:"agent-based" OR abs:simulation) 
AND (abs:epidemic OR abs:pandemic OR abs:"disease spread" OR abs:"public health")
```

### 5.4 Supplementary Search Methods

1. **Citation Tracking:** Forward and backward citation search of included studies
2. **Key Author Search:** Search publications by authors of seminal works (Park, Gao, Williams)
3. **Reference List Review:** Manual review of reference lists of included studies
4. **Grey Literature:** Search for technical reports from major AI labs (OpenAI, Anthropic, DeepMind)

---

## 6. Study Selection

### 6.1 Selection Process

```
+----------------------------------+
|     Records from Databases       |
|        (n = estimated)           |
+----------------------------------+
                |
                v
+----------------------------------+
|    Remove Duplicates (Zotero)    |
+----------------------------------+
                |
                v
+----------------------------------+
|   Title/Abstract Screening       |
|   (Single reviewer + sampling)   |
+----------------------------------+
                |
                v
+----------------------------------+
|    Full-Text Assessment          |
|    (Apply eligibility criteria)  |
+----------------------------------+
                |
                v
+----------------------------------+
|    Final Included Studies        |
|    (Target: 12-18 papers)        |
+----------------------------------+
                |
                v
+----------------------------------+
|    Data Extraction +             |
|    Validation Assessment         |
+----------------------------------+
                |
                v
+----------------------------------+
|    Gap Analysis +                |
|    Requirements Synthesis        |
+----------------------------------+
                |
                v
+----------------------------------+
|    Proof-of-Concept              |
|    Implementation                |
+----------------------------------+
```

### 6.2 Screening Procedure

**Stage 1: Title/Abstract Screening**
- Primary reviewer screens all titles and abstracts
- Apply inclusion/exclusion criteria
- When uncertain, include for full-text review
- Document reasons for exclusion

**Stage 2: Full-Text Review**
- Retrieve full texts of potentially eligible studies
- Apply detailed eligibility criteria
- Document specific exclusion reasons
- Resolve uncertainties through discussion with advisor

### 6.3 Screening Tool
Use Rayyan (rayyan.ai) or Zotero for systematic screening with tagging.

---

## 7. Data Extraction (Charting)

### 7.1 Data Extraction Form

See accompanying file: `DATA_EXTRACTION_TEMPLATE.md`

### 7.2 Charting Categories

| Category | Data Items | Component |
|----------|------------|-----------|
| **Bibliographic** | Authors, year, title, venue, DOI, citation count | Scoping |
| **Study Characteristics** | Study type, objectives, research questions | Scoping |
| **Technical Architecture** | LLM model, agent framework, memory system, tools | Scoping |
| **Simulation Design** | Disease type, population size, environment, time scale | Scoping |
| **Behavioral Modeling** | Behavior types, decision mechanisms, social interactions | Scoping |
| **Validation Methods** | Methods used, metrics, baselines, real-world comparison | **Validation Assessment** |
| **Validation Rigor** | Epidemiological alignment, reproducibility, limitations | **Validation Assessment** |
| **Design Requirements** | Implied requirements for valid simulation | **Requirements Synthesis** |
| **Outcomes** | Key findings, reported limitations, future directions | Scoping |

### 7.3 Data Extraction Process
- Primary reviewer extracts data using standardized form
- Pilot test on first 3 papers, refine form as needed
- Track extraction decisions and ambiguities

---

## 8. Validation Assessment Framework

### 8.1 Purpose and Scope

The validation assessment component evaluates the rigor of validation methods employed in included studies. This is NOT a quality appraisal for inclusion/exclusion decisions, but rather a characterization of validation practices to:

1. Identify gaps in current validation approaches
2. Extract requirements for epidemiologically valid simulations
3. Inform proof-of-concept design decisions

### 8.2 Validation Assessment Criteria

Studies will be assessed against the following validation dimensions:

| Dimension | Description | Assessment Questions |
|-----------|-------------|---------------------|
| **V1: Empirical Grounding** | Comparison to real-world epidemic data | Is simulation output compared to actual epidemic curves, R0 estimates, or behavioral data? |
| **V2: Epidemiological Validity** | Alignment with established epidemic models | Are transmission dynamics consistent with SIR/SEIR principles? Are parameters epidemiologically plausible? |
| **V3: Behavioral Realism** | Validation of agent behavior fidelity | Are agent decisions compared to human behavior data? Is behavioral validity assessed? |
| **V4: Sensitivity Analysis** | Robustness to parameter variations | Are key parameters varied systematically? Are results stable across conditions? |
| **V5: Baseline Comparison** | Comparison to established methods | Is the LLM approach compared to traditional ABM or other baselines? |
| **V6: Reproducibility** | Ability to replicate results | Are code, data, and parameters available? Is methodology sufficiently detailed? |

### 8.3 Validation Assessment Rubric

For each dimension, studies will be rated:

| Rating | Description |
|--------|-------------|
| **0 - Not Addressed** | Dimension not mentioned or assessed |
| **1 - Minimally Addressed** | Mentioned but not rigorously evaluated |
| **2 - Partially Addressed** | Some evaluation but with limitations |
| **3 - Fully Addressed** | Rigorous evaluation with clear methodology |

### 8.4 Synthesis of Validation Findings

Validation assessment results will be synthesized to:
1. Calculate distribution of validation rigor across studies
2. Identify most common validation gaps
3. Map validation methods to study characteristics
4. Extract design requirements for valid implementations

---

## 9. Requirements Synthesis

### 9.1 Purpose

Based on the scoping review findings and validation assessment, this component synthesizes actionable design requirements for building epidemiologically valid LLM-based epidemic simulations.

### 9.2 Requirements Categories

| Category | Description | Source |
|----------|-------------|--------|
| **Architectural Requirements** | LLM selection, agent framework, memory design | RQ1 findings |
| **Behavioral Requirements** | Decision mechanisms, social modeling, information processing | RQ3 findings |
| **Validation Requirements** | Minimum validation standards, metrics, benchmarks | RQ4-5 findings |
| **Epidemiological Requirements** | Transmission fidelity, parameter calibration, outbreak dynamics | Validation assessment |

### 9.3 Gap Prioritization

Identified gaps will be prioritized for proof-of-concept implementation based on:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| **Prevalence** | 30% | How commonly is this gap observed across studies? |
| **Impact** | 30% | How significantly does this gap affect validity? |
| **Feasibility** | 25% | Can this gap be addressed within timeline/resources? |
| **Platform Fit** | 15% | Does DevAll platform support addressing this gap? |

---

## 10. Proof-of-Concept Implementation

### 10.1 Purpose

The proof-of-concept (PoC) demonstrates feasibility of addressing a key gap identified in the scoping review and validation assessment. It provides:

1. Concrete implementation of review-derived requirements
2. Preliminary validation against epidemic dynamics
3. Demonstration of practical applicability of findings

### 10.2 Implementation Platform

**Platform:** DevAll Multi-Agent Orchestration Platform

**Relevant Capabilities (from contagion_simulation.md):**
- Agent state machine: HEALTHY -> INFECTED -> RECOVERED/DECEASED
- Configurable transmission parameters (infection radius, probability)
- Disease progression modeling (recovery time, fatality probability, mutation)
- Environmental factors (floor contamination, decay)
- Spatial simulation with real-time visualization
- Currently rule-based; PoC will integrate LLM decision-making

### 10.3 PoC Scope Definition

The specific PoC scope will be determined in Week 6 based on review findings. Candidate implementation targets include:

| Gap | Implementation Approach | Complexity |
|-----|------------------------|------------|
| **Behavioral decision-making** | LLM agents deciding protective behaviors based on information + personality | Medium |
| **Information processing** | Agents reasoning about health information from environment | Medium |
| **Compliance modeling** | Agents deciding intervention compliance based on social context | Low-Medium |
| **Validation framework** | Implementing missing validation metrics for existing simulations | Low |

### 10.4 PoC Evaluation

The proof-of-concept will be evaluated on:

| Criterion | Metric |
|-----------|--------|
| **Functional Completeness** | Does the implementation address the identified gap? |
| **Behavioral Plausibility** | Are agent decisions qualitatively reasonable? |
| **Epidemic Dynamics** | Do aggregate outcomes follow expected epidemic patterns? |
| **Technical Feasibility** | Can it run within reasonable computational constraints? |

### 10.5 Limitations Acknowledgment

The PoC is explicitly NOT intended to:
- Provide validated predictions for real epidemics
- Serve as a production-ready simulation system
- Replace traditional epidemiological modeling
- Demonstrate superiority over existing approaches

The PoC IS intended to:
- Demonstrate feasibility of addressing identified gaps
- Illustrate translation from review findings to implementation
- Provide foundation for future research and development

---

## 11. Data Synthesis

### 11.1 Synthesis Approach
Narrative synthesis with tabular and visual summaries, integrating:
1. Scoping review findings (mapping)
2. Validation assessment findings (rigor characterization)
3. Requirements synthesis (design guidance)
4. Proof-of-concept results (feasibility demonstration)

### 11.2 Planned Analyses

1. **Descriptive Numerical Summary**
   - Publication trends over time
   - Geographic distribution
   - Publication venues
   - Validation method distribution

2. **Thematic Analysis**
   - Technical architectures taxonomy
   - Application domains mapping
   - Validation approaches classification
   - Gap categorization

3. **Validation Assessment Summary**
   - Rigor scores by dimension
   - Common validation gaps
   - Best practices identification

4. **Requirements Framework**
   - Design requirements matrix
   - Gap-to-requirement mapping
   - Implementation guidance

### 11.3 Presentation of Results
- PRISMA-ScR flow diagram
- Summary tables by research question
- Validation rigor heat map
- Requirements framework diagram
- PoC architecture and results

---

## 12. Methodological Framework

This review follows a hybrid methodology:

### 12.1 Scoping Review Component

**Framework:** Arksey & O'Malley [4] with Levac et al. enhancements [5]
- Stage 1: Identifying the research question
- Stage 2: Identifying relevant studies
- Stage 3: Study selection
- Stage 4: Charting the data
- Stage 5: Collating, summarizing, and reporting results

**Reporting:** PRISMA-ScR [6]

**Guidance:** JBI Methodology for Scoping Reviews [7]

### 12.2 Validation Assessment Component

**Justification:** Per Munn et al. [3], quality assessment in scoping reviews is appropriate "if there is a specific requirement due to the nature of the scoping review aim."

**Framework:** Custom validation assessment rubric (Section 8) designed to:
- Align with epidemiological validation standards
- Capture LLM-specific validation considerations
- Enable gap identification for implementation

### 12.3 Proof-of-Concept Component

**Approach:** Review-informed implementation
- Gap selection based on systematic analysis
- Requirements derived from review synthesis
- Evaluation aligned with identified validation needs

---

## 13. Ethics and Dissemination

### 13.1 Ethical Considerations
- No primary data collection involving human subjects; ethics approval not required
- All data from published sources
- Proper attribution through citation
- PoC uses synthetic agents, not human data

### 13.2 Dissemination Plan
- Qualifying paper submission
- Potential journal publication (target: Journal of Medical Internet Research, npj Digital Medicine, or Artificial Intelligence in Medicine)
- Conference presentation if applicable
- Open-source release of PoC implementation

---

## 14. References

[1] J. S. Park, J. C. O'Brien, C. J. Cai, M. R. Morris, P. Liang, and M. S. Bernstein, "Generative agents: Interactive simulacra of human behavior," in Proc. 36th Annu. ACM Symp. User Interface Softw. Technol. (UIST), San Francisco, CA, USA, 2023, pp. 1-22.

[2] N. Ferguson et al., "Strategies for mitigating an influenza pandemic," Nature, vol. 442, no. 7101, pp. 448-452, Jul. 2006.

[3] Z. Munn, M. D. J. Peters, C. Stern, C. Tufanaru, A. McArthur, and E. Aromataris, "Systematic review or scoping review? Guidance for authors when choosing between a systematic or scoping review approach," BMC Med. Res. Methodol., vol. 18, no. 1, Art. no. 143, Nov. 2018.

[4] H. Arksey and L. O'Malley, "Scoping studies: Towards a methodological framework," Int. J. Soc. Res. Methodol., vol. 8, no. 1, pp. 19-32, 2005.

[5] D. Levac, H. Colquhoun, and K. K. O'Brien, "Scoping studies: Advancing the methodology," Implement. Sci., vol. 5, no. 1, Art. no. 69, Sep. 2010.

[6] A. C. Tricco et al., "PRISMA extension for scoping reviews (PRISMA-ScR): Checklist and explanation," Ann. Intern. Med., vol. 169, no. 7, pp. 467-473, Oct. 2018.

[7] M. D. J. Peters et al., "Updated methodological guidance for the conduct of scoping reviews," JBI Evid. Synth., vol. 18, no. 10, pp. 2119-2126, Oct. 2020.

---

## Appendices

### Appendix A: PRISMA-ScR Checklist
See: https://www.equator-network.org/reporting-guidelines/prisma-scr/

### Appendix B: Data Extraction Form
See: `DATA_EXTRACTION_TEMPLATE.md`

### Appendix C: Validation Assessment Form
See: `VALIDATION_ASSESSMENT_TEMPLATE.md`

### Appendix D: Candidate Papers List
See: `CANDIDATE_PAPERS.md`

### Appendix E: DevAll Platform Capabilities
See: `docs/user_guide/en/contagion_simulation.md`

---

**Protocol Approval:**

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Primary Reviewer | | | |
| Advisor | | | |
