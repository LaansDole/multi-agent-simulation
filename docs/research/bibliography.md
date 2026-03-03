# Multi-Agent Systems Bibliography

This document provides a curated bibliography of relevant papers for the DevAll multi-agent literature review, organized into LLM-based multi-agent systems (2022-2024) and classic multi-agent systems frameworks.

## LLM-Based Multi-Agent Systems (2022-2024)

### 1. ChatDev: Communicative Agents for Software Development

**Citation:** Qian, C., Liu, W., Liu, H., Chen, N., Dang, Y., Li, J., Yang, C., Chen, W., Su, Y., Cong, X., Xu, J., Li, D., Liu, Z., & Sun, M. (2024). ChatDev: Communicative Agents for Software Development. In *Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics (ACL 2024)*.

**arXiv:** https://arxiv.org/abs/2307.07924

**DOI:** https://doi.org/10.48550/arXiv.2307.07924

**Summary:** ChatDev introduces a chat-powered software development framework where specialized LLM-driven agents collaborate through unified natural language communication, guided by chat chains and communicative dehallucination techniques across design, coding, and testing phases.

### 2. Generative Agents: Interactive Simulacra of Human Behavior

**Citation:** Park, J. S., O'Brien, J. C., Cai, C. J., Morris, M. R., Liang, P., & Bernstein, M. S. (2023). Generative Agents: Interactive Simulacra of Human Behavior. In *Proceedings of the 36th Annual ACM Symposium on User Interface Software and Technology (UIST 2023)*.

**arXiv:** https://arxiv.org/abs/2304.03442

**Summary:** This paper introduces generative agents that simulate believable human behavior through an architecture extending LLMs to store experiences in natural language, synthesize memories into reflections, and dynamically retrieve them for planning. The 25-agent sandbox environment demonstrates emergent social behaviors like relationship formation and coordinated group activities.

### 3. AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation

**Citation:** Wu, Q., Bansal, G., Zhang, J., Wu, Y., Zhang, S., Zhu, J., Li, B., Zhang, E., Zhang, C., Liu, A., Wang, L., Awadallah, A., White, R., Burger, D., & Wang, C. (2023). AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation. In *Proceedings of the Conference on Language Modeling (COLM 2024)*.

**arXiv:** https://arxiv.org/abs/2308.08155

**Summary:** AutoGen is an open-source framework enabling developers to build sophisticated LLM applications through automated multi-agent conversations. The framework provides customizable conversable agents that integrate LLMs, human input, and tools, demonstrating consistent performance improvements over single LLM methods across diverse domains.

### 4. MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework

**Citation:** Hong, S., Zhuge, M., Chen, J., Zheng, X., Cheng, Y., Wang, J., Zhang, C., Wang, Z., Yau, S. K. S., Lin, Z., Zhou, L., Ran, C., Xiao, L., Wu, C., & Schmidhuber, J. (2024). MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework. In *Proceedings of the International Conference on Learning Representations (ICLR 2024)*.

**arXiv:** https://arxiv.org/abs/2308.00352

**Summary:** MetaGPT addresses hallucination and logical inconsistencies in LLM multi-agent systems by encoding Standardized Operating Procedures (SOPs) into prompts. The framework mandates modular outputs and assigns diverse roles to agents similar to an assembly line, generating more coherent solutions for collaborative software engineering benchmarks.

### 5. AgentVerse: Facilitating Multi-Agent Collaboration and Exploring Emergent Behaviors

**Citation:** Chen, W., Su, Y., Zuo, J., Yang, C., Yuan, C., Chan, C. M., Yu, H., Lu, Y., Hung, Y. H., Qian, C., Qin, Y., Cong, X., Xie, R., Liu, Z., Sun, M., & Zhou, J. (2024). AgentVerse: Facilitating Multi-Agent Collaboration and Exploring Emergent Behaviors. In *Proceedings of the International Conference on Learning Representations (ICLR 2024)*.

**arXiv:** https://arxiv.org/abs/2308.10848

**Summary:** AgentVerse orchestrates collaborative groups of expert agents inspired by human group dynamics, outperforming single agents across text understanding, reasoning, coding, tool utilization, and embodied AI. The framework divides problem-solving into Expert Recruitment, Collaborative Decision-Making, Action Execution, and Evaluation stages, revealing emergent collaborative behaviors.

### 6. CAMEL: Communicative Agents for "Mind" Exploration of Large Language Model Society

**Citation:** Li, G., Hammoud, H. A. A. K., Itani, H., Khizbullin, D., & Ghanem, B. (2023). CAMEL: Communicative Agents for "Mind" Exploration of Large Language Model Society. In *Proceedings of the 37th Conference on Neural Information Processing Systems (NeurIPS 2023)*.

**arXiv:** https://arxiv.org/abs/2303.17760

**Summary:** CAMEL introduces a role-playing approach facilitating autonomous cooperation between AI assistant and AI user agents through structured dialogue. The framework generates large-scale conversational datasets enhancing LLM capabilities in coding, math, and science, outperforming single-shot solutions with reduced human intervention.

### 7. MemGPT: Towards LLMs as Operating Systems

**Citation:** Packer, C., Wooders, S., Lin, K., Fang, V., Patil, S. G., Stoica, I., & Gonzalez, J. E. (2023). MemGPT: Towards LLMs as Operating Systems. arXiv preprint arXiv:2308.07108.

**arXiv:** https://arxiv.org/abs/2308.07108

**Summary:** MemGPT enables LLMs to manage their own memory through hierarchical memory systems inspired by operating systems. The framework provides virtual context management allowing LLMs to intelligently manage storage tiers, retrieve relevant historical data, and evict less relevant information, creating the illusion of unbounded context.

### 8. BabyAGI: Task-driven Autonomous Agent Utilizing GPT-4, Pinecone, and LangChain

**Citation:** Nakajima, Y. (2023). Task-driven Autonomous Agent Utilizing GPT-4, Pinecone, and LangChain for Diverse Applications.

**arXiv:** https://arxiv.org/abs/2304.04196

**Summary:** BabyAGI introduces a task-driven autonomous agent operating through three LLM chains: task creation, task prioritization, and execution. The system generates and executes tasks based on objectives, continuously refining tasks and adapting to changing priorities using vector databases for context storage.

### 9. Chain-of-Thought Prompting Elicits Reasoning in Large Language Models

**Citation:** Wei, J., Wang, X., Schuurmans, D., Bosma, M., Chi, E. H., Xia, F., Le, Q., & Zhou, D. (2022). Chain-of-Thought Prompting Elicits Reasoning in Large Language Models. In *Proceedings of the 36th Conference on Neural Information Processing Systems (NeurIPS 2022)*.

**arXiv:** https://arxiv.org/abs/2201.11903

**Summary:** This seminal work introduces Chain-of-Thought (CoT) prompting, significantly enhancing LLM reasoning by providing intermediate reasoning steps. The technique achieves state-of-the-art accuracy on math word problems and demonstrates that reasoning abilities emerge naturally in sufficiently large language models without fine-tuning.

### 10. ReAct: Synergizing Reasoning and Acting in Language Models

**Citation:** Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan, K., & Cao, Y. (2022). ReAct: Synergizing Reasoning and Acting in Language Models. In *Proceedings of the International Conference on Learning Representations (ICLR 2023)*.

**arXiv:** https://arxiv.org/abs/2210.03629

**Summary:** ReAct combines step-by-step reasoning with action-taking capabilities through a "thought-action-observation" cycle. The framework enables LLMs to generate interleaved reasoning traces and task-specific actions, reducing hallucination by interacting with external sources and improving interpretability in question answering and decision-making tasks.

### 11. MRKL Systems: A Modular, Neuro-symbolic Architecture That Combines Large Language Models, External Knowledge Sources and Discrete Reasoning

**Citation:** Karpas, E., Abend, O., Belinkov, Y., Lenz, B., Lieber, O., Ratner, N., Shacham, Y., Shmueli-Scheuer, E., Slonim, N., & Katz, L. (2022). MRKL Systems: A Modular, Neuro-symbolic Architecture That Combines Large Language Models, External Knowledge Sources and Discrete Reasoning.

**arXiv:** https://arxiv.org/abs/2205.00445

**Summary:** MRKL proposes a neuro-symbolic architecture combining LLMs with external knowledge sources and discrete reasoning modules. The system uses an LLM as a router directing inputs to specialized expert modules, offering safe fallback, robust extensibility, and access to up-to-date information while overcoming LLM limitations in symbolic reasoning.

### 12. Large Language Model based Multi-Agents: A Survey of Progress and Challenges

**Citation:** Guo, T., Chen, X., Wang, Y., Chang, R., Pei, S., Patel, N., Li, Z., & Wang, H. (2024). Large Language Model based Multi-Agents: A Survey of Progress and Challenges. arXiv preprint arXiv:2402.01680.

**arXiv:** https://arxiv.org/abs/2402.01680

**Summary:** This comprehensive survey discusses essential aspects of LLM-based multi-agent systems including agent profiling, communication mechanisms, and capacity growth strategies. The paper provides an in-depth analysis of datasets, benchmarks, and open challenges in the field.

### 13. LLM Multi-Agent Systems: Challenges and Open Problems

**Citation:** Liu, J., Zhang, Y., Chen, C., Li, Y., & Wang, L. (2024). LLM Multi-Agent Systems: Challenges and Open Problems. arXiv preprint arXiv:2402.01737.

**arXiv:** https://arxiv.org/abs/2402.01737

**Summary:** This paper explores key challenges in LLM multi-agent systems including optimizing task allocation, fostering robust reasoning through iterative debates, managing complex context information, and enhancing memory management. The work also discusses potential applications in blockchain systems and other domains.

### 14. LLM Powered Autonomous Agents

**Citation:** Weng, L. (2023). LLM Powered Autonomous Agents. Lil'Log blog post.

**URL:** https://lilianweng.github.io/posts/2023-06-23-agent/

**Summary:** This comprehensive overview discusses building agents with LLMs as core controllers, covering key components like planning (task decomposition, self-reflection), memory (short-term and long-term), and tool use. The work provides foundational concepts for understanding autonomous agent architectures.

### 15. Unlocking AI Creativity: A Multi-Agent Approach with CrewAI

**Citation:** Venkadesh, P., Divya, S. V., & Kumar, K. S. (2024). Unlocking AI Creativity: A Multi-Agent Approach with CrewAI. *Journal of Trends in Computer Science and Smart Technology*, 6(4).

**Summary:** This study investigates how multi-agent systems integrate System 2 thinking into AI using CrewAI as a no-code framework. The paper explores practical applications like intelligent grid management and automated customer support, addressing scalability and coordination challenges through dynamic role assignment and hierarchical task management.

## Classic Multi-Agent Systems Papers

### 1. Modeling Rational Agents within a BDI-Architecture

**Citation:** Rao, A. S., & Georgeff, M. P. (1991). Modeling Rational Agents within a BDI-Architecture. In *Proceedings of the 2nd International Conference on Principles of Knowledge Representation and Reasoning (KR'91)* (pp. 473-484). Morgan Kaufmann.

**DOI:** https://doi.org/10.1016/B978-1-4832-1444-5.50043-5

**Summary:** This seminal paper translates Bratman's philosophical Belief-Desire-Intention (BDI) framework into a computational agent architecture, establishing the foundational model for rational agents that has influenced decades of multi-agent systems research.

### 2. BDI Agents: From Theory to Practice

**Citation:** Rao, A. S., & Georgeff, M. P. (1995). BDI Agents: From Theory to Practice. In *Proceedings of the First International Conference on Multi-Agent Systems (ICMAS-95)* (pp. 312-319). AAAI Press.

**Summary:** This paper bridges the gap between BDI theory and practical implementation, demonstrating how the theoretical framework can be realized in actual agent systems and establishing patterns for BDI-based agent development.

### 3. Intention, Plans, and Practical Reason

**Citation:** Bratman, M. E. (1987). *Intention, Plans, and Practical Reason*. Harvard University Press.

**ISBN:** 978-1575861925

**Summary:** This philosophical work provides the theoretical foundation for BDI architectures, establishing the concepts of intention, planning, and practical reasoning that underpin all modern BDI-based agent systems and influencing both AI and philosophy of action.

### 4. BDI Agent Programming in AgentSpeak Using Jason (Tutorial Paper)

**Citation:** Bordini, R. H., & Hübner, J. F. (2005). BDI Agent Programming in AgentSpeak Using Jason (Tutorial Paper). In *Proceedings of the 4th International Joint Conference on Autonomous Agents and Multiagent Systems (AAMAS 2005)* (pp. 10-11). ACM.

**DOI:** https://doi.org/10.1145/1082473.1082761

**Summary:** This tutorial introduces Jason as an interpreter for an extended version of AgentSpeak(L), providing a practical BDI-based agent-oriented programming language implemented in Java with features like strong negation, plan failure handling, and speech-act based communication.

### 5. GOAL: A Multi-Agent Programming Language Applied to an Exploration Game

**Citation:** Hindriks, K. V., de Boer, F. S., van der Hoek, W., & Meyer, J. J. C. (2007). GOAL: A Multi-Agent Programming Language Applied to an Exploration Game. In *Proceedings of the 6th International Joint Conference on Autonomous Agents and Multiagent Systems (AAMAS 2007)*.

**Summary:** GOAL introduces declarative goals as end goals to be realized, addressing the gap between agent logics and programming frameworks. The logic-based BDI language incorporates commitment strategies and modular agent design with environment interaction capabilities.

### 6. 2APL: A Practical Agent Programming Language

**Citation:** Dastani, M. (2008). 2APL: A Practical Agent Programming Language. *Autonomous Agents and Multi-Agent Systems*, 16(3), 214-248.

**DOI:** https://doi.org/10.1007/s10458-008-9036-y

**Summary:** 2APL is a BDI-based agent-oriented programming language that effectively integrates declarative and imperative programming styles, combining declarative beliefs and goals with events and plans while providing practical constructs for generating, repairing, and executing plans.

### 7. FIPA ACL Message Structure Specification

**Citation:** Foundation for Intelligent Physical Agents (FIPA). (2002). *FIPA ACL Message Structure Specification*. FIPA Standard.

**URL:** https://www.fipa.org/specs/fipa00061/

**Summary:** FIPA ACL provides a standardized agent communication protocol built on speech act theory, defining message structure with performatives, sender, receiver, content, ontology, and language parameters. The specification includes interaction protocols like Request and Contract Net for structured multi-agent communication.

### 8. KQML--A Language and Protocol for Knowledge and Information Exchange

**Citation:** Finin, T., Fritzson, R., McKay, D., & McEntire, R. (1994). KQML as an Agent Communication Language. In *Proceedings of the 3rd International Conference on Information and Knowledge Management (CIKM'94)* (pp. 456-463). ACM.

**DOI:** https://doi.org/10.1145/191246.191322

**Summary:** KQML (Knowledge Query and Manipulation Language) is a language and protocol for knowledge sharing among intelligent agents, featuring extensible performatives defining speech acts and a basic architecture with communication facilitators coordinating agent interactions in distributed applications.

## Additional Resources

### Surveys and Reviews

- **A Survey on LLM-based Multi-Agent Systems: Recent Advances and New Frontiers in Application** (2024) - Comprehensive survey capturing the continuous influx of new works in LLM-based multi-agent systems.

- **LLM-based Multi-Agent Systems: Techniques and Business Perspectives** (2024) - Discusses technical and business landscapes, highlighting advantages like dynamic task decomposition, flexibility, and monetization feasibility.

### Frameworks and Tools

- **CrewAI** - Open-source, Python-based multi-agent orchestration framework for collaborative AI agents with sophisticated memory-management systems.

- **LangGraph + CrewAI Integration** - Combined framework improving information transmission efficiency and team collaboration through intelligent task allocation.

## Notes on Selection

This bibliography focuses on:

1. **LLM-based multi-agent papers (2022-2024)**: Emphasizing the rapid emergence and maturation of LLM-powered multi-agent systems, with particular attention to frameworks demonstrating practical applications and novel architectures.

2. **Classic multi-agent systems papers**: Covering foundational BDI architectures, agent-oriented programming languages (Jason, GOAL, 2APL), and communication protocols (FIPA ACL, KQML) that established the theoretical and practical groundwork for modern multi-agent systems.

3. **Seed papers**: ChatDev (arXiv:2307.07924) and Stanford Generative Agents (arXiv:2304.03442) are included as specified, representing key works in software development and believable agent simulation respectively.

## Citation Format

All citations follow standard academic format with full bibliographic information. arXiv papers include both arXiv identifiers and DOIs where available. Classic papers include DOI or ISBN references for easy access to original publications.

## Last Updated

March 2, 2026
