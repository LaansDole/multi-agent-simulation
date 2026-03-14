#!/bin/bash
# Verification script for LaTeX paper structure

echo "=== LaTeX Paper Verification ==="
echo ""

# Check if pdflatex is available
if command -v pdflatex &> /dev/null; then
    echo "✓ pdflatex found"
    echo ""
    echo "Compiling paper..."
    pdflatex -interaction=nonstopmode main.tex
    bibtex main
    pdflatex -interaction=nonstopmode main.tex
    pdflatex -interaction=nonstopmode main.tex
    echo ""
    if [ -f main.pdf ]; then
        echo "✓ PDF generated successfully: main.pdf"
    else
        echo "✗ PDF generation failed"
    fi
else
    echo "✗ pdflatex not found"
    echo ""
    echo "To install LaTeX:"
    echo "  macOS:   brew install --cask basictex"
    echo "  Ubuntu:  sudo apt-get install texlive-latex-base"
    echo "  Windows: Install MiKTeX or TeX Live"
    echo ""
    echo "Once installed, run: ./verify.sh"
fi
