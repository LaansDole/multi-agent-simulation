# Methodology Section Draft

## LLM-Powered Generative Agents for Epidemic Simulation: A Scoping Review with Validation Assessment and Proof-of-Concept Implementation

**Note:** This is a ready-to-use methodology section for your qualifying paper. Adjust institution-specific details and dates as needed.

---

## Methods

### Study Design

This study employed a hybrid methodological approach combining: (1) a scoping review to map the current state of research, (2) a validation assessment to characterize the rigor of existing approaches, and (3) a proof-of-concept implementation to demonstrate feasibility of addressing identified gaps. This design was selected to provide both a comprehensive landscape analysis and actionable contributions to the field.

#### Rationale for Methodological Approach

Following the guidance of Munn et al. [1], we selected a scoping review over a systematic review based on several considerations. First, the application of large language models (LLMs) to epidemic simulation is a nascent field with most relevant work published since 2023, representing an emerging and heterogeneous body of literature. Second, our primary aim is to map the conceptual landscape and identify research gaps rather than synthesize evidence to answer specific effectiveness questions. Third, the heterogeneity of study designs and outcomes across included studies precludes meaningful meta-analysis. Under these conditions, a scoping review is the appropriate methodological choice [1], [2].

However, we diverged from traditional scoping review methodology in one important respect: the inclusion of a validation assessment component. While Munn et al. [1] note that quality assessment is "generally not performed" in scoping reviews, they acknowledge that such assessment may be appropriate "if there is a specific requirement due to the nature of the scoping review aim." Our review has such a requirement: we aim not only to map existing approaches but to extract design requirements for building epidemiologically valid LLM-based simulations. To responsibly inform implementation decisions, we must characterize whether existing validation methods are rigorous enough to learn from. Importantly, this validation assessment does not serve as quality appraisal for inclusion/exclusion decisions; all studies meeting eligibility criteria were included regardless of validation rigor.

The scoping review component followed the methodological framework proposed by Arksey and O'Malley [3] as enhanced by Levac et al. [4], comprising five stages: (1) identifying the research question, (2) identifying relevant studies, (3) study selection, (4) charting the data, and (5) collating, summarizing, and reporting results. Reporting adhered to the Preferred Reporting Items for Systematic Reviews and Meta-Analyses extension for Scoping Reviews (PRISMA-ScR) guidelines [5].

### Research Questions

The review was guided by research questions developed using the Population-Concept-Context (PCC) framework recommended for scoping reviews [6]. The population was defined as LLM-powered generative agents (transformer-based language models powering autonomous agents with memory, planning, and reasoning capabilities). The concept was epidemic/outbreak simulation (computational modeling of infectious disease spread, public health interventions, or population-level behavioral responses). The context encompassed academic research and application settings including public health planning tools, policy analysis frameworks, and educational simulations.

**Primary Research Question:** What is the current state of research on LLM-powered generative agents for epidemic simulation, and what are the key gaps in validation approaches that limit their practical utility?

**Secondary Research Questions:**

*Scoping Component:*
1. What LLM architectures and agent frameworks are being used for epidemic simulation?
2. What types of epidemic scenarios and diseases are being modeled?
3. How do studies model human behavior during epidemics?

*Validation Assessment Component:*
4. What validation methods are employed and how rigorous are they?
5. What are the gaps between current validation practices and epidemiological standards?

*Synthesis Component:*
6. What design requirements emerge for building valid LLM-based epidemic simulations?

*Implementation Component:*
7. Can an identified gap be feasibly addressed using existing multi-agent platforms?

### Eligibility Criteria

#### Inclusion Criteria

Studies were included if they met all of the following criteria:

1. **Agent Type:** Utilized transformer-based large language models (e.g., GPT-3.5, GPT-4, LLaMA 2, Claude, PaLM, or equivalent architectures) to power autonomous agents.

2. **Agent Capabilities:** Demonstrated agents with at least two of the following capabilities: (a) memory or state persistence across interactions, (b) autonomous decision-making, (c) natural language interaction with other agents or the environment, or (d) planning and reasoning abilities.

3. **Simulation Domain:** Involved simulation of epidemic or pandemic scenarios, infectious disease spread, public health emergencies, or population-level behavioral responses to disease outbreaks.

4. **Publication Type:** Peer-reviewed journal articles, peer-reviewed conference papers, or preprints demonstrating scholarly impact (defined as 10 or more citations for arXiv preprints).

5. **Language:** Published in English.

6. **Accessibility:** Full text available for review.

#### Exclusion Criteria

Studies were excluded if they: (1) used only rule-based agents or traditional agent-based models without LLM integration; (2) employed LLMs solely for data analysis rather than agent-based simulation; (3) represented chatbot or conversational AI applications without a simulation component; (4) focused on medical diagnosis or clinical decision support without population-level simulation; (5) were opinion pieces, editorials, or review articles without original research; (6) mentioned epidemic or health contexts only peripherally to the main study focus; or (7) were duplicate publications of the same study.

### Information Sources and Search Strategy

A comprehensive search was conducted across six electronic databases: Google Scholar, IEEE Xplore, ACM Digital Library, PubMed/MEDLINE, arXiv, and Semantic Scholar. No date restrictions were applied to capture foundational works, though the majority of relevant literature was anticipated to be published from 2023 onward given the emergence of capable LLMs.

The search strategy combined three concept groups using Boolean operators:

**Concept 1 (LLM/Generative Agents):** "large language model*" OR "LLM" OR "GPT-4" OR "GPT-3.5" OR "ChatGPT" OR "generative agent*" OR "LLM agent*" OR "autonomous agent*" OR "LLM-based agent*" OR "LLaMA" OR "Claude"

**Concept 2 (Simulation/Modeling):** "simulation" OR "agent-based model*" OR "ABM" OR "multi-agent" OR "computational model*" OR "social simulation" OR "behavior simulation"

**Concept 3 (Epidemic/Health Domain):** "epidemic*" OR "pandemic*" OR "outbreak" OR "infectious disease*" OR "disease spread" OR "contagion" OR "public health" OR "COVID*" OR "vaccination"

Search strings were adapted for each database's syntax requirements (see Appendix A). Supplementary search methods included forward and backward citation tracking of included studies, author searches for researchers with multiple publications in the field, and review of reference lists of included studies.

### Study Selection

Study selection was conducted in two stages. In the first stage, one reviewer (primary author) screened all titles and abstracts against the eligibility criteria. Studies that clearly did not meet inclusion criteria were excluded, while studies with uncertain eligibility were retained for full-text review. In the second stage, full texts of potentially eligible studies were retrieved and assessed against the detailed eligibility criteria. Reasons for exclusion at the full-text stage were documented.

Given the nature of this qualifying paper, a single-reviewer approach was adopted for feasibility. To enhance rigor, a random sample of 20% of excluded studies was reviewed with the thesis advisor to verify consistency of exclusion decisions. Any disagreements were resolved through discussion. The study selection process is presented in a PRISMA flow diagram (Figure 1).

### Data Extraction

A standardized data extraction form was developed to capture relevant information from included studies. The form was piloted on three studies and refined based on initial extraction experience. The following data categories were extracted:

**Bibliographic Information:** Authors, publication year, title, venue, DOI, and citation count.

**Study Characteristics:** Study type (empirical, framework, proof-of-concept, benchmark), objectives, and research questions addressed.

**Technical Architecture:** LLM model used, agent framework, memory system design, and agent capabilities (planning, reasoning, tool use, communication).

**Simulation Design:** Disease or outbreak type modeled, epidemic model characteristics, population size and heterogeneity, environment type, and simulation time scale.

**Behavioral Modeling:** Types of behaviors modeled (e.g., health protective behaviors, vaccination decisions, information sharing), decision-making mechanisms, and emergent behaviors reported.

**Validation and Evaluation:** Validation methods employed, evaluation metrics, baseline comparisons, and datasets used.

**Outcomes:** Key findings, reported limitations, and proposed future directions.

Data extraction was performed by the primary reviewer using the standardized form. Extracted data were entered into a structured database for analysis.

### Validation Assessment

In addition to standard scoping review data extraction, a validation assessment was conducted for each included study. This assessment characterized the rigor of validation approaches across six dimensions:

1. **Empirical Grounding:** Whether simulation outputs were compared to actual epidemic data
2. **Epidemiological Validity:** Whether transmission dynamics were consistent with established epidemiological principles (e.g., SIR/SEIR models)
3. **Behavioral Realism:** Whether agent behaviors were validated against human behavior data
4. **Sensitivity Analysis:** Whether results were tested for robustness to parameter variations
5. **Baseline Comparison:** Whether the LLM approach was compared to established methods
6. **Reproducibility:** Whether sufficient information was provided to replicate results

Each dimension was rated on a 0-3 scale (0 = not addressed, 1 = minimally addressed, 2 = partially addressed, 3 = fully addressed) using a standardized rubric with calibration examples. This assessment did not influence inclusion decisions but served to characterize the state of validation practices in the field and identify gaps to be addressed in the proof-of-concept implementation.

### Requirements Synthesis

Based on the scoping review findings and validation assessment results, design requirements for valid LLM-based epidemic simulations were synthesized. Requirements were categorized as architectural (LLM selection, agent framework, memory design), behavioral (decision mechanisms, social modeling), validation (minimum standards, metrics, benchmarks), or epidemiological (transmission fidelity, parameter calibration). Gaps identified through this synthesis informed the selection of the proof-of-concept implementation focus.

### Proof-of-Concept Implementation

To demonstrate the feasibility of addressing an identified gap, a proof-of-concept (PoC) was implemented using the DevAll multi-agent orchestration platform. DevAll provides a configurable contagion simulation sandbox with agent state machines (HEALTHY, INFECTED, RECOVERED, DECEASED), transmission mechanics (proximity-based and environmental contamination), and real-time visualization capabilities.

The specific PoC focus was determined based on the gap prioritization analysis, considering: (1) prevalence of the gap across included studies, (2) impact on validity, (3) feasibility within the project timeline, and (4) fit with the DevAll platform capabilities. The PoC was evaluated on functional completeness, behavioral plausibility, consistency with expected epidemic dynamics, and technical feasibility.

The PoC is explicitly not intended to provide validated predictions for real epidemics or to serve as a production-ready simulation system. Rather, it demonstrates the translation of review findings into concrete implementation and establishes a foundation for future research.

### Data Synthesis

Given the heterogeneity of included studies and the exploratory nature of the review, a narrative synthesis approach was employed [7]. Results were organized thematically according to the research questions. Descriptive statistics summarized study characteristics including publication trends, geographic distribution, and methodological approaches. Validation assessment results were aggregated to characterize the distribution of rigor scores across dimensions and identify common gaps.

A conceptual mapping of the field was developed to illustrate relationships between LLM architectures, simulation domains, and validation approaches. The requirements synthesis integrated findings from both the scoping and validation assessment components. Proof-of-concept results were reported with explicit acknowledgment of limitations.

No quantitative meta-analysis was planned or conducted, consistent with scoping review methodology.

---

## References

[1] Z. Munn, M. D. J. Peters, C. Stern, C. Tufanaru, A. McArthur, and E. Aromataris, "Systematic review or scoping review? Guidance for authors when choosing between a systematic or scoping review approach," BMC Med. Res. Methodol., vol. 18, no. 1, Art. no. 143, Nov. 2018.

[2] M. D. J. Peters et al., "Updated methodological guidance for the conduct of scoping reviews," JBI Evid. Synth., vol. 18, no. 10, pp. 2119-2126, Oct. 2020.

[3] H. Arksey and L. O'Malley, "Scoping studies: Towards a methodological framework," Int. J. Soc. Res. Methodol., vol. 8, no. 1, pp. 19-32, 2005.

[4] D. Levac, H. Colquhoun, and K. K. O'Brien, "Scoping studies: Advancing the methodology," Implement. Sci., vol. 5, no. 1, Art. no. 69, Sep. 2010.

[5] A. C. Tricco et al., "PRISMA extension for scoping reviews (PRISMA-ScR): Checklist and explanation," Ann. Intern. Med., vol. 169, no. 7, pp. 467-473, Oct. 2018.

[6] The Joanna Briggs Institute, "Joanna Briggs Institute Reviewers' Manual: 2015 Edition/Supplement," Adelaide, Australia: The Joanna Briggs Institute, 2015.

[7] V. Braun and V. Clarke, "Using thematic analysis in psychology," Qual. Res. Psychol., vol. 3, no. 2, pp. 77-101, 2006.

---

## Figure Placeholder

**Figure 1.** PRISMA-ScR flow diagram of study selection process.

```
+-----------------------------------------------+
|    Records identified from databases          |
|    (n = ___)                                  |
|    - Google Scholar (n = ___)                 |
|    - IEEE Xplore (n = ___)                    |
|    - ACM DL (n = ___)                         |
|    - PubMed (n = ___)                         |
|    - arXiv (n = ___)                          |
+-----------------------------------------------+
                      |
                      v
+-----------------------------------------------+
|    Records after duplicates removed           |
|    (n = ___)                                  |
+-----------------------------------------------+
                      |
                      v
+-----------------------------------------------+
|    Records screened (title/abstract)          |
|    (n = ___)                                  |
+-----------------------------------------------+
          |                       |
          v                       v
+-------------------+   +---------------------------+
| Records excluded  |   | Full-text articles        |
| (n = ___)         |   | assessed for eligibility  |
+-------------------+   | (n = ___)                 |
                        +---------------------------+
                                  |
                    +-------------+-------------+
                    |                           |
                    v                           v
        +-------------------+       +-------------------+
        | Full-text articles|       | Studies included  |
        | excluded (n = ___):|       | in review         |
        | - Not LLM-based   |       | (n = ___)         |
        | - Not epidemic    |       +-------------------+
        | - Not simulation  |                |
        | - Other reasons   |                v
        +-------------------+       +-------------------+
                                   | Data Extraction + |
                                   | Validation        |
                                   | Assessment        |
                                   +-------------------+
                                            |
                                            v
                                   +-------------------+
                                   | Gap Analysis +    |
                                   | Requirements      |
                                   | Synthesis         |
                                   +-------------------+
                                            |
                                            v
                                   +-------------------+
                                   | Proof-of-Concept  |
                                   | Implementation    |
                                   +-------------------+
```

---

## Appendix A: Database-Specific Search Strings

### Google Scholar
```
("large language model" OR "LLM" OR "GPT-4" OR "generative agent") 
AND ("simulation" OR "agent-based model" OR "multi-agent") 
AND ("epidemic" OR "pandemic" OR "outbreak" OR "infectious disease" OR "public health")
```

### IEEE Xplore
```
(("large language model*" OR "LLM" OR "GPT" OR "generative agent*") 
AND ("simulation" OR "agent-based" OR "multi-agent") 
AND ("epidemic*" OR "pandemic*" OR "disease" OR "public health"))
```

### PubMed
```
(("large language model"[tiab] OR "LLM"[tiab] OR "GPT"[tiab] OR "generative agent"[tiab]) 
AND ("simulation"[tiab] OR "agent-based"[tiab] OR "computational model"[tiab]) 
AND ("epidemic"[tiab] OR "pandemic"[tiab] OR "infectious disease"[tiab] OR "public health"[tiab]))
```

### ACM Digital Library
```
[[All: "large language model"] OR [All: "llm"] OR [All: "generative agent"]] 
AND [[All: simulation] OR [All: "agent-based"]] 
AND [[All: epidemic] OR [All: pandemic] OR [All: "public health"]]
```

### arXiv
```
(ti:"large language model" OR ti:"LLM" OR ti:"generative agent" OR abs:"LLM agent") 
AND (ti:simulation OR ti:"agent-based" OR abs:simulation) 
AND (abs:epidemic OR abs:pandemic OR abs:"disease spread" OR abs:"public health")
```

---

**Word Count (Methods section):** ~2,100 words
