# Research Paper: Multi-Agent Simulation with Conway's Game of Life Integration

This directory contains the LaTeX source for the research paper.

## Compilation Requirements

To compile this paper, you need a LaTeX distribution with the following installed:
- pdflatex
- bibtex
- IEEEtran document class
- Standard LaTeX packages (cite, amsmath, graphicx, etc.)

### Installing LaTeX

**macOS:**
```bash
brew install --cask basictex
# Or for full installation:
brew install --cask mactex
```

**Ubuntu/Debian:**
```bash
sudo apt-get install texlive-latex-base texlive-latex-extra bibtex2html
```

**Windows:**
Download and install [MiKTeX](https://miktex.org/) or [TeX Live](https://www.tug.org/texlive/)

## Compiling the Paper

From this directory, run:

```bash
pdflatex main.tex
bibtex main
pdflatex main.tex
pdflatex main.tex
```

Or use latexmk for automatic compilation:

```bash
latexmk -pdf main.tex
```

## Structure

- `main.tex` - Main document file
- `sections/` - Individual section files
  - `methodology.tex` - Research methodology (US-001)
- `figures/` - Figures and diagrams
- `references.bib` - Bibliography database

## Status

- [x] US-001: Research Methodology Justification - Content complete, awaiting LaTeX compilation verification
- [ ] US-002: Problem Statement and Research Questions
- [ ] US-003: Real-World Applications and Impact
- [ ] US-004: Literature Review - Conway's Game of Life Theory
- [ ] US-005: Literature Review - Epidemiological Applications
- [ ] US-006: Introduction Section
- [ ] US-007: Reproducibility Section
- [ ] US-008: System Architecture Description
- [ ] US-009: Agent State Machine Formalization
- [ ] US-010: Transmission Mechanisms Description
- [ ] US-011: Comparison with Existing Tools
- [ ] US-012: Scenario Presets and Use Cases
- [ ] US-013: Emergent Behavior Analysis
- [ ] US-014: Figure Generation
- [ ] US-015: Discussion Section
- [ ] US-016: Conclusion Section
- [ ] US-017: References and Bibliography
- [ ] US-018: Abstract Section
