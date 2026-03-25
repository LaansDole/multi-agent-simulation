# Candidate Papers for Screening

## LLM-Powered Generative Agents for Epidemic Simulation: Scoping Review

**Status:** Pre-screening candidate list (Updated with verified papers and URLs)  
**Date Generated:** March 2026  
**Last Updated:** March 24, 2026  
**Target Papers:** 12-18 for final inclusion

---

## Legend

| Status | Meaning |
|--------|---------|
| **Verified** | Paper existence confirmed with full bibliographic details and URL |
| **To screen** | Paper exists, needs title/abstract screening |
| **To search** | Paper mentioned but not yet verified |
| **Included** | Passed screening, included in review |
| **Excluded** | Did not meet eligibility criteria |

---

## Tier 1: Core Epidemic-Specific LLM Agent Papers (Highest Priority)

These papers directly address LLM/generative agents for epidemic/pandemic simulation.

### Verified Core Papers

| ID | Authors | Year | Title | Venue | arXiv ID | URL | Status |
|----|---------|------|-------|-------|----------|-----|--------|
| C01 | Hou et al. | 2025 | Can A Society of Generative Agents Simulate Human Behavior and Inform Public Health Policy? A Case Study on Vaccine Hesitancy (VacSim) | COLM 2025 | arXiv:2503.09639 | [Link](https://arxiv.org/abs/2503.09639) | **Verified** |
| C02 | Du et al. | 2024 | Advancing Real-time Pandemic Forecasting Using Large Language Models: A COVID-19 Case Study (PandemicLLM) | arXiv | arXiv:2404.06962 | [Link](https://arxiv.org/abs/2404.06962) | **Verified** |
| C03 | Shi et al. | 2026 | Coordinated Pandemic Control with Large Language Model Agents as Policymaking Assistants | arXiv | arXiv:2601.09264 | [Link](https://arxiv.org/abs/2601.09264) | **Verified** |
| C04 | Chen et al. | 2026 | MACRO-LLM: LLM-Empowered Multi-Agent Collaborative Reasoning under Spatiotemporal Partial Observability | arXiv | arXiv:2601.09295 | [Link](https://arxiv.org/abs/2601.09295) | **Verified** |
| C05 | Samaei et al. | 2025 | EpidemIQs: Prompt-to-Paper LLM Agents for Epidemic Modeling and Analysis | arXiv | arXiv:2510.00024 | [Link](https://arxiv.org/abs/2510.00024) | **Verified** |

### Paper Details

#### C01: VacSim - Vaccine Hesitancy Simulation
- **Full Title:** Can A Society of Generative Agents Simulate Human Behavior and Inform Public Health Policy? A Case Study on Vaccine Hesitancy
- **Authors:** Abe Bohan Hou, Hongru Du, Yichen Wang, Jingyu Zhang, Zixiao Wang, Paul Pu Liang, Daniel Khashabi, Lauren Gardner, Tianxing He
- **arXiv:** [2503.09639](https://arxiv.org/abs/2503.09639)
- **Venue:** Accepted to COLM 2025
- **Submitted:** March 11, 2025
- **Key Features:**
  - 100 generative agents powered by LLMs
  - Demographics based on census data
  - Social network connections for attitude modeling
  - Public health intervention evaluation
  - Models: Llama, Qwen tested
- **Validation:** 2.82% MAE alignment with real-world data; Kendall's tau up to 0.733 for policy ranking
- **Relevance:** CORE - Direct epidemic + behavioral simulation + policy evaluation

#### C02: PandemicLLM
- **Full Title:** Advancing Real-time Pandemic Forecasting Using Large Language Models: A COVID-19 Case Study
- **Authors:** Hongru Du, Jianan Zhao, Yang Zhao, Shaochong Xu, Xihong Lin, Yiran Chen, Lauren M. Gardner, Hao Frank Yang
- **arXiv:** [2404.06962](https://arxiv.org/abs/2404.06962)
- **Submitted:** April 10, 2024
- **Key Features:**
  - Multi-modal data integration (text + time series)
  - Reformulates forecasting as text reasoning problem
  - Incorporates: virological characteristics, variant prevalence, public health policy, healthcare performance
  - Case study: COVID-19 hospitalization across 50 US states
- **Validation:** High-performing pandemic forecasting; captures emerging variant impacts
- **Relevance:** CORE - LLM for pandemic forecasting with multi-modal data

#### C03: Coordinated Pandemic Control
- **Full Title:** Coordinated Pandemic Control with Large Language Model Agents as Policymaking Assistants
- **Authors:** Ziyi Shi, Xusen Guo, Hongliang Lu, Mingxing Peng, Haotian Wang, Zheng Zhu, Zhenning Li, Yuxuan Liang, Xinhu Zheng, Hai Yang
- **arXiv:** [2601.09264](https://arxiv.org/abs/2601.09264)
- **Submitted:** January 14, 2026
- **Key Features:**
  - LLM agent per administrative region
  - Inter-agent communication for cross-regional coordination
  - Pandemic evolution simulator integration
  - Counterfactual intervention scenarios
- **Validation:** COVID-19 state-level US data (Apr-Dec 2020); up to 63.7% infection reduction, 40.1% death reduction; aggregate 39.0% and 27.0% reduction
- **Relevance:** CORE - Multi-agent LLM for coordinated epidemic policy

#### C04: MACRO-LLM (Pandemic Control Application)
- **Full Title:** MACRO-LLM: LLM-Empowered Multi-Agent Collaborative Reasoning under Spatiotemporal Partial Observability
- **Authors:** Handi Chen, Running Zhao, Xiuzhe Wu, Edith C. H. Ngai
- **arXiv:** [2601.09295](https://arxiv.org/abs/2601.09295)
- **Submitted:** January 14, 2026
- **Key Features:**
  - CoProposer: verifies candidate actions via predictive rollouts
  - Negotiator: resolves conflicts through mean-field statistical aggregation
  - Introspector: analyzes environmental drift
  - Evaluated on pandemic control task
- **Relevance:** CORE - Multi-agent LLM architecture with pandemic control evaluation

#### C05: EpidemIQs
- **Full Title:** EpidemIQs: Prompt-to-Paper LLM Agents for Epidemic Modeling and Analysis
- **Authors:** Mohammad Hossein Samaei, Faryad Darabi Sahneh, Lee W. Cohnstaedt, Caterina Scoglio
- **arXiv:** [2510.00024](https://arxiv.org/abs/2510.00024)
- **Submitted:** September 24, 2025
- **Key Features:**
  - Scientist agent + task-expert agents architecture
  - Autonomous: literature review, derivations, network modeling, SEIR modeling, simulations
  - Generates complete scientific manuscripts
  - 79% task success rate; ~$1.57 per study; 870K tokens average
- **Relevance:** HIGH - Multi-agent LLM for epidemic research automation

---

## Tier 2: Foundational Generative Agents Work

These papers establish the generative agent paradigm used in epidemic simulations.

| ID | Authors | Year | Title | Venue | arXiv ID / DOI | URL | Status |
|----|---------|------|-------|-------|----------------|-----|--------|
| C10 | Park et al. | 2023 | Generative Agents: Interactive Simulacra of Human Behavior | UIST '23 | arXiv:2304.03442 / DOI:10.1145/3586183.3606763 | [Link](https://arxiv.org/abs/2304.03442) | **Verified** |
| C11 | Gao et al. | 2023 | S3: Social-network Simulation System with Large Language Model-Empowered Agents | arXiv | arXiv:2307.14984 | [Link](https://arxiv.org/abs/2307.14984) | **Verified** |

### Paper Details

#### C10: Generative Agents (Park et al.) - FOUNDATIONAL
- **Full Title:** Generative Agents: Interactive Simulacra of Human Behavior
- **Authors:** Joon Sung Park, Joseph C. O'Brien, Carrie J. Cai, Meredith Ringel Morris, Percy Liang, Michael S. Bernstein
- **Affiliations:** Stanford University, Google
- **arXiv:** [2304.03442](https://arxiv.org/abs/2304.03442)
- **DOI:** [10.1145/3586183.3606763](https://doi.org/10.1145/3586183.3606763)
- **Venue:** ACM UIST '23 (Oct 29 - Nov 1, 2023, San Francisco)
- **Key Features:**
  - 25 agents in "Smallville" sandbox environment
  - Memory stream + reflection + planning architecture
  - Emergent social behaviors and relationships
- **Relevance:** FOUNDATIONAL - Establishes generative agent paradigm that epidemic papers build upon

#### C11: S3 Social Network Simulation
- **Full Title:** S3: Social-network Simulation System with Large Language Model-Empowered Agents
- **Authors:** Chen Gao et al.
- **arXiv:** [2307.14984](https://arxiv.org/abs/2307.14984)
- **Submitted:** July 2023
- **Key Features:**
  - Simulates emotion, attitude, and interaction behaviors
  - Prompt engineering for human-like behavior
  - Population-level phenomena emergence
  - Information, attitude, and emotion propagation
- **Validation:** Evaluated on real-world social network data
- **Relevance:** HIGH - Social dynamics simulation transferable to epidemic context

---

## Tier 3: Healthcare/Medical LLM Agent Simulation

| ID | Authors | Year | Title | Venue | arXiv ID | URL | Status |
|----|---------|------|-------|-------|----------|-----|--------|
| C20 | Li et al. | 2024 | Agent Hospital: A Simulacrum of Hospital with Evolvable Medical Agents | arXiv | arXiv:2405.02957 | [Link](https://arxiv.org/abs/2405.02957) | **Verified** |
| C21 | -- | 2024 | AgentClinic: A Multimodal Agent Benchmark to Evaluate AI in Clinical Environments | arXiv | -- | -- | To screen |
| C22 | -- | 2024 | ClinicalAgent: Clinical Trial Multi-Agent System with Large Language Model | -- | -- | -- | To search |

### Paper Details

#### C20: Agent Hospital
- **Full Title:** Agent Hospital: A Simulacrum of Hospital with Evolvable Medical Agents
- **Authors:** Junkai Li, Yunghwei Lai, Weitao Li, Jingyi Ren, Meng Zhang, Xinhui Kang, Siyu Wang, Peng Li, Ya-Qin Zhang, Weizhi Ma, Yang Liu
- **arXiv:** [2405.02957](https://arxiv.org/abs/2405.02957)
- **Submitted:** May 5, 2024
- **Key Features:**
  - Patients, nurses, and doctors as LLM agents
  - MedAgent-Zero: learning from successful/unsuccessful cases
  - State-of-the-art on MedQA benchmark (USMLE questions)
- **Relevance:** METHODOLOGY - Hospital simulation methodology, but not epidemic-focused

---

## Tier 4: Multi-Agent Frameworks (Architecture Reference)

These provide architectural patterns but are not epidemic-specific.

| ID | Authors | Year | Title | Venue | Status |
|----|---------|------|-------|-------|--------|
| C30 | Li et al. | 2023 | CAMEL: Communicative Agents for "Mind" Exploration of Large Language Model Society | NeurIPS | To screen |
| C31 | Hong et al. | 2023 | MetaGPT: Meta Programming for Multi-Agent Collaborative Framework | arXiv | To screen |
| C32 | Qian et al. | 2023 | ChatDev: Communicative Agents for Software Development | arXiv | To screen |
| C33 | Wu et al. | 2023 | AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation | arXiv | To screen |

**Note:** Include 1-2 most relevant for architecture discussion only.

---

## Tier 5: Surveys and Reviews (Context/Background)

| ID | Authors | Year | Title | Venue | Status | Notes |
|----|---------|------|-------|-------|--------|-------|
| C40 | -- | 2024 | Artificial intelligence agents in healthcare research: A scoping review | -- | To screen | Check for overlap |
| C41 | -- | 2024 | Large Language Model Agents for Biomedicine: A comprehensive review | -- | To screen | Check for overlap |
| C42 | -- | 2024 | A Survey of LLM-based Agents in Medicine | -- | To screen | Check for overlap |
| C43 | Lorig et al. | 2021 | Agent-based social simulation of COVID-19 pandemic (126 ABMs) | -- | To screen | Traditional ABM baseline |
| C44 | -- | 2024 | A Survey on Large Language Model based Autonomous Agents | arXiv | To screen | Agent architecture survey |

---

## Search Tracking

### Completed Searches

| Database | Date | Query | Results | Notes |
|----------|------|-------|---------|-------|
| Google Scholar | Mar 24, 2026 | VacSim generative agents vaccine hesitancy | 5+ | VacSim verified: arXiv:2503.09639 |
| Google Scholar | Mar 24, 2026 | PandemicLLM multi-modal pandemic forecasting | 5+ | PandemicLLM verified: arXiv:2404.06962 |
| Google Scholar | Mar 24, 2026 | Generative Agents Park Stanford DOI | 10+ | Park et al. verified: arXiv:2304.03442 |
| Google Scholar | Mar 24, 2026 | S3 Social-network Simulation LLM Gao | 4+ | S3 verified: arXiv:2307.14984 |
| Google Scholar | Mar 24, 2026 | Agent Hospital LLM medical 2024 | 4+ | Agent Hospital verified: arXiv:2405.02957 |
| Google Scholar | Mar 24, 2026 | LLM agents epidemic policy SEIR 2024 | 8+ | Multiple papers found |
| Google Scholar | Mar 24, 2026 | EpidemIQs multi-agent LLM epidemic | 5+ | EpidemIQs verified: arXiv:2510.00024 |
| Google Scholar | Mar 24, 2026 | Coordinated pandemic control LLM 2026 | 3+ | Coordinated control verified: arXiv:2601.09264 |
| arXiv Direct | Mar 24, 2026 | Various title searches | -- | MACRO-LLM verified: arXiv:2601.09295 |

### Pending Searches

| Database | Query | Priority | Status |
|----------|-------|----------|--------|
| IEEE Xplore | Full search string per protocol | High | Pending |
| PubMed | Full search string per protocol | High | Pending |
| ACM Digital Library | Full search string per protocol | Medium | Pending |
| arXiv (direct) | Full search string per protocol | High | Pending |
| Semantic Scholar | Full search string per protocol | Medium | Pending |

---

## Screening Decisions Made

### Definite Inclusions (Core Papers with URLs)
1. **VacSim (C01)** - [arXiv:2503.09639](https://arxiv.org/abs/2503.09639) - Direct: LLM agents + vaccine hesitancy + policy simulation
2. **PandemicLLM (C02)** - [arXiv:2404.06962](https://arxiv.org/abs/2404.06962) - Direct: LLM + pandemic forecasting
3. **Coordinated Pandemic Control (C03)** - [arXiv:2601.09264](https://arxiv.org/abs/2601.09264) - Direct: Multi-agent LLM + pandemic policy
4. **MACRO-LLM (C04)** - [arXiv:2601.09295](https://arxiv.org/abs/2601.09295) - Direct: Multi-agent LLM + pandemic control evaluation
5. **EpidemIQs (C05)** - [arXiv:2510.00024](https://arxiv.org/abs/2510.00024) - Direct: Multi-agent LLM + epidemic modeling
6. **Park et al. Generative Agents (C10)** - [arXiv:2304.03442](https://arxiv.org/abs/2304.03442) - Foundational methodology

### Pending Screening Decisions
1. **S3 (C11)** - [arXiv:2307.14984](https://arxiv.org/abs/2307.14984) - Include if social dynamics methodology transfers to epidemic context?
2. **Agent Hospital (C20)** - [arXiv:2405.02957](https://arxiv.org/abs/2405.02957) - Include if methodology applicable to population-level epidemic simulation?
3. **Framework papers (C30-C33)** - Include 1-2 for architecture discussion only

### Exclusion Candidates
- Papers focused solely on individual clinical diagnosis (not population-level)
- Pure forecasting without agent-based simulation
- Traditional ABM without LLM integration

---

## Key Gaps Identified (for PoC)

Based on verified papers, potential gaps for proof-of-concept:

1. **Behavioral Decision Integration:** Most papers use LLMs for policy or forecasting, not individual behavioral decisions within epidemic simulations
2. **Real-time Validation:** Limited real-time validation against emerging outbreak data
3. **Heterogeneous Agent Reasoning:** Opportunity for agents with diverse reasoning patterns/personalities in epidemic response
4. **Platform Integration:** No existing work on integrating LLM agents into orchestration platforms like DevAll

---

## Quick Reference: All Verified arXiv URLs

| Paper | arXiv URL |
|-------|-----------|
| VacSim | https://arxiv.org/abs/2503.09639 |
| PandemicLLM | https://arxiv.org/abs/2404.06962 |
| Coordinated Pandemic Control | https://arxiv.org/abs/2601.09264 |
| MACRO-LLM | https://arxiv.org/abs/2601.09295 |
| EpidemIQs | https://arxiv.org/abs/2510.00024 |
| Generative Agents (Park) | https://arxiv.org/abs/2304.03442 |
| S3 Social Network | https://arxiv.org/abs/2307.14984 |
| Agent Hospital | https://arxiv.org/abs/2405.02957 |

---

## Reference Management

**Tool:** Zotero  
**Screening Tool:** Rayyan (rayyan.ai) for collaborative screening  
**Export Format:** BibTeX for LaTeX integration

---

## Next Steps

1. [ ] Complete database searches (IEEE, PubMed, ACM DL, arXiv direct)
2. [ ] De-duplicate results using Zotero
3. [ ] Title/abstract screening (target: reduce to ~30 papers)
4. [ ] Full-text retrieval for eligible studies
5. [ ] Full-text screening with documented exclusion reasons
6. [ ] Data extraction using template
7. [ ] Validation assessment using rubric
8. [ ] Gap prioritization for PoC scope

---

**Last Updated:** March 24, 2026
