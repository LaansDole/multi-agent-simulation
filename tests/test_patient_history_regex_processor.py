"""Unit tests for the regex processor used in PatientHistorySplitter edge.

This tests the regex pattern that strips UNDERSTOOD/LOOP ENDED keywords
before passing patient history JSON arrays to DoctorDiagnosis.
"""

import re
import pytest


class TestPatientHistoryRegexProcessor:
    r"""Test suite for the regex pattern: (?:UNDERSTOOD|LOOP ENDED\.)?\s*(\[[\s\S]*\])"""

    @pytest.fixture
    def regex_pattern(self):
        """The regex pattern used in DiagnosisPhase -> PatientHistorySplitter edge."""
        return re.compile(r"(?:UNDERSTOOD|LOOP ENDED\.)?\s*(\[[\s\S]*\])", re.DOTALL)

    def test_extract_from_understood_prefix(self, regex_pattern):
        """Test extraction when input has UNDERSTOOD keyword prefix."""
        input_text = """UNDERSTOOD
[
  {
    "patient": "John Smith",
    "history": "Q1: Nurse intake - fever and cough. Q2: Duration? - 3 days."
  },
  {
    "patient": "Jane Doe",
    "history": "Q1: Nurse intake - headache. Q2: Severity? - 7/10."
  }
]"""

        match = regex_pattern.search(input_text)
        assert match is not None, "Pattern should match UNDERSTOOD prefix"

        extracted = match.group(1)
        assert extracted.startswith("["), "Extracted content should start with ["
        assert extracted.endswith("]"), "Extracted content should end with ]"
        assert "UNDERSTOOD" not in extracted, "Keyword should be stripped"
        assert "John Smith" in extracted, "Patient data should be preserved"
        assert "Jane Doe" in extracted, "All patients should be preserved"

    def test_extract_from_loop_ended_prefix(self, regex_pattern):
        """Test extraction when input has LOOP ENDED. keyword prefix."""
        input_text = """LOOP ENDED.
[
  {
    "patient": "Alice Johnson",
    "history": "Q1: Nurse intake - chest pain. Q2: When started? - 1 hour ago."
  }
]"""

        match = regex_pattern.search(input_text)
        assert match is not None, "Pattern should match LOOP ENDED. prefix"

        extracted = match.group(1)
        assert extracted.startswith("["), "Extracted content should start with ["
        assert extracted.endswith("]"), "Extracted content should end with ]"
        assert "LOOP ENDED" not in extracted, "Keyword should be stripped"
        assert "Alice Johnson" in extracted, "Patient data should be preserved"

    def test_extract_without_prefix(self, regex_pattern):
        """Test extraction when input has no keyword prefix (edge case)."""
        input_text = """[
  {
    "patient": "Bob Williams",
    "history": "Q1: Nurse intake - broken arm. Q2: How? - fell from ladder."
  }
]"""

        match = regex_pattern.search(input_text)
        assert match is not None, "Pattern should match even without prefix"

        extracted = match.group(1)
        assert extracted.startswith("["), "Extracted content should start with ["
        assert extracted.endswith("]"), "Extracted content should end with ]"
        assert "Bob Williams" in extracted, "Patient data should be preserved"

    def test_extract_with_extra_whitespace(self, regex_pattern):
        """Test extraction with extra whitespace between keyword and array."""
        input_text = """UNDERSTOOD


[
  {
    "patient": "Charlie Brown",
    "history": "Q1: Nurse intake - anxiety."
  }
]"""

        match = regex_pattern.search(input_text)
        assert match is not None, "Pattern should handle extra whitespace"

        extracted = match.group(1)
        assert extracted.startswith("["), "Extracted content should start with ["
        assert "UNDERSTOOD" not in extracted, "Keyword should be stripped"
        assert "Charlie Brown" in extracted, "Patient data should be preserved"

    def test_multiline_json_preservation(self, regex_pattern):
        """Test that multiline JSON content is fully preserved."""
        input_text = """LOOP ENDED.
[
  {
    "patient": "David Lee",
    "history": "Q1: Nurse intake - severe abdominal pain, nausea, vomiting for 6 hours. Q2: Location? - Right lower quadrant. Q3: Fever? - Yes, 101.5F. Q4: Previous surgery? - Appendectomy 10 years ago."
  }
]"""

        match = regex_pattern.search(input_text)
        assert match is not None, "Pattern should match multiline content"

        extracted = match.group(1)
        assert "Q1:" in extracted, "First question should be preserved"
        assert "Q2:" in extracted, "Second question should be preserved"
        assert "Q3:" in extracted, "Third question should be preserved"
        assert "Q4:" in extracted, "Fourth question should be preserved"
        assert "Right lower quadrant" in extracted, "Detailed answers preserved"

    def test_empty_array(self, regex_pattern):
        """Test extraction with empty patient array."""
        input_text = "UNDERSTOOD\n[]"

        match = regex_pattern.search(input_text)
        assert match is not None, "Pattern should match empty array"

        extracted = match.group(1)
        assert extracted == "[]", "Empty array should be preserved"

    def test_single_line_json(self, regex_pattern):
        """Test extraction with compact single-line JSON."""
        input_text = 'LOOP ENDED.\n[{"patient": "Eve Smith", "history": "Q1: intake"}]'

        match = regex_pattern.search(input_text)
        assert match is not None, "Pattern should match single-line JSON"

        extracted = match.group(1)
        assert "Eve Smith" in extracted, "Compact JSON should be preserved"
        assert extracted.startswith("["), "Should extract complete array"

    def test_no_match_invalid_input(self, regex_pattern):
        """Test that pattern doesn't match invalid input."""
        input_text = "Just some random text without JSON array"

        match = regex_pattern.search(input_text)
        assert match is None, "Pattern should not match invalid input"

    def test_nested_arrays_in_history(self, regex_pattern):
        """Test that nested structures in history field are preserved."""
        input_text = """UNDERSTOOD
[
  {
    "patient": "Frank Miller",
    "history": "Q1: Symptoms include [fever, chills, fatigue]. Q2: Duration - 5 days."
  }
]"""

        match = regex_pattern.search(input_text)
        assert match is not None, "Pattern should handle nested brackets"

        extracted = match.group(1)
        assert "[fever, chills, fatigue]" in extracted, "Nested content preserved"


def test_regex_processor_template_replacement():
    """Test that the template {{extracted}} correctly replaces with group 1."""
    pattern = re.compile(r"(?:UNDERSTOOD|LOOP ENDED\.)?\s*(\[[\s\S]*\])", re.DOTALL)
    template = "{{extracted}}"

    input_text = 'UNDERSTOOD\n[{"patient": "Test"}]'
    match = pattern.search(input_text)

    assert match is not None
    extracted = match.group(1)

    # Simulate template replacement (simplified version of what processor does)
    result = template.replace("{{extracted}}", extracted)

    assert result == '[{"patient": "Test"}]', "Template should output clean JSON"
    assert "UNDERSTOOD" not in result, "Template output should not contain keyword"


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "--tb=short"])
