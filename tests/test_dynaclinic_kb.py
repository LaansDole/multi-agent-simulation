"""Tests for dynaclinic.kb (illustrative knowledge base)."""

import pytest

from dynaclinic.kb import (
    allergy_conflicts,
    contraindication_conflicts,
    drugs_in,
    interaction_conflicts,
    precedence_violations,
)
from tests.dynaclinic_fixtures import no_network  # noqa: F401


def _pairs(conflicts: list) -> set[tuple[str, str, str]]:
    return {(c.subject, c.other, c.severity) for c in conflicts}


def test_drugs_in_handles_case_combinations_aliases_and_multiword_names() -> None:
    text = "Start Piperacillin-tazobactam, TMP-SMX and isosorbide  mononitrate; continue lithium carbonate."
    assert drugs_in(text) == {"piperacillin", "trimethoprim", "sulfamethoxazole", "isosorbide mononitrate", "lithium"}


def test_drugs_in_ignores_partial_words() -> None:
    assert drugs_in("Statin therapy and penicillinase-resistant organisms") == set()


def test_allergy_class_membership_and_cross_reactivity() -> None:
    allergies = ["Penicillin (anaphylaxis)"]
    assert _pairs(allergy_conflicts("IV piperacillin-tazobactam", allergies)) == {
        ("piperacillin", "Penicillin (anaphylaxis)", "contraindicated")
    }
    assert allergy_conflicts("Oral azithromycin", allergies) == []


@pytest.mark.parametrize(
    ("allergy", "severity"),
    [("Penicillin (anaphylaxis)", "contraindicated"), ("penicillin (rash)", "caution")],
)
def test_cephalosporin_cross_reactivity_severity_depends_on_reaction(allergy: str, severity: str) -> None:
    assert _pairs(allergy_conflicts("Oral cephalexin", [allergy])) == {("cephalexin", allergy, severity)}


def test_allergy_listed_by_drug_name_covers_its_class() -> None:
    assert _pairs(allergy_conflicts("Ampicillin-sulbactam", ["amoxicillin (hives)"])) == {
        ("ampicillin", "amoxicillin (hives)", "contraindicated")
    }


def test_sulfa_allergy_flags_trimethoprim_sulfamethoxazole() -> None:
    conflicts = allergy_conflicts("Trimethoprim-sulfamethoxazole for 3 days", ["sulfonamide antibiotics (rash)"])
    assert [c.subject for c in conflicts] == ["sulfamethoxazole"]
    assert conflicts[0].kind == "allergy"
    assert "sulfamethoxazole" in str(conflicts[0])


@pytest.mark.parametrize(
    "text",
    [
        "Avoid amoxicillin given the allergy; give azithromycin.",
        "Do not give amoxicillin.",
        "The patient is allergic to penicillin, so azithromycin is chosen.",
    ],
)
def test_negated_mentions_are_not_conflicts(text: str) -> None:
    assert allergy_conflicts(text, ["penicillin"]) == []


def test_negation_does_not_cross_sentences_or_long_clauses() -> None:
    assert [c.subject for c in allergy_conflicts("No fever. Give amoxicillin.", ["penicillin"])] == ["amoxicillin"]
    assert [c.subject for c in interaction_conflicts("Stop warfarin and start ibuprofen", ["warfarin"])] == ["ibuprofen"]


@pytest.mark.parametrize(
    "text",
    [
        "Given her penicillin allergy, oral azithromycin is appropriate.",
        "Avoid amoxicillin because of penicillin anaphylaxis.",
        "History of penicillin-class hypersensitivity; start azithromycin.",
        "Prior amoxicillin rash; use azithromycin.",
    ],
)
def test_regression_allergy_history_mention_is_not_an_assertion(text: str) -> None:
    assert allergy_conflicts(text, ["penicillin (anaphylaxis)", "sulfonamide (rash)"]) == []


@pytest.mark.parametrize(
    "text",
    [
        "Azithromycin avoids penicillin exposure.",
        "The team avoided amoxicillin given the allergy.",
        "She stops amoxicillin today.",
        "The plan holds penicillin; azithromycin instead.",
        "Pharmacology withholds amoxicillin.",
    ],
)
def test_regression_inflected_negation_cue_is_not_an_assertion(text: str) -> None:
    assert allergy_conflicts(text, ["penicillin (anaphylaxis)"]) == []


def test_drug_followed_by_unrelated_noun_is_still_asserted() -> None:
    assert [c.subject for c in allergy_conflicts("Penicillin therapy for 10 days", ["penicillin"])] == ["penicillin"]

@pytest.mark.parametrize(
    ("text", "meds", "expected"),
    [
        ("Ibuprofen 400 mg", ["warfarin 5 mg daily"], ("ibuprofen", "warfarin", "contraindicated")),
        ("Continue warfarin", ["naproxen as needed"], ("warfarin", "naproxen", "contraindicated")),
        ("Sublingual nitroglycerin", ["sildenafil 50 mg (taken 12 hours ago)"], ("nitroglycerin", "sildenafil", "contraindicated")),
        ("Start sertraline", ["phenelzine"], ("sertraline", "phenelzine", "contraindicated")),
        ("Meperidine for pain", ["phenelzine 15 mg"], ("meperidine", "phenelzine", "contraindicated")),
        ("Increase spironolactone", ["lisinopril 20 mg"], ("spironolactone", "lisinopril", "contraindicated")),
        ("Clarithromycin triple therapy", ["simvastatin 40 mg"], ("clarithromycin", "simvastatin", "contraindicated")),
        ("TMP-SMX DS", ["methotrexate weekly"], ("trimethoprim", "methotrexate", "contraindicated")),
        ("Ibuprofen", ["lithium carbonate"], ("ibuprofen", "lithium", "contraindicated")),
        ("Omeprazole daily", ["clopidogrel 75 mg"], ("omeprazole", "clopidogrel", "caution")),
    ],
)
def test_interaction_conflicts(text: str, meds: list[str], expected: tuple[str, str, str]) -> None:
    conflicts = interaction_conflicts(text, meds)
    assert expected in _pairs(conflicts)
    assert all(c.kind == "interaction" for c in conflicts)


def test_interaction_skips_same_drug_and_unrelated_meds() -> None:
    assert interaction_conflicts("Continue spironolactone", ["spironolactone 25 mg"]) == []
    assert interaction_conflicts("Acetaminophen 1 g", ["warfarin"]) == []
    assert interaction_conflicts("Ibuprofen", []) == []


@pytest.mark.parametrize(
    ("text", "conditions", "subject"),
    [
        ("Increase metformin to 1000 mg twice daily", ["type 2 diabetes", "eGFR 24 mL/min/1.73 m2"], "metformin"),
        ("Oral ciprofloxacin", ["pregnancy, 18 weeks gestation"], "ciprofloxacin"),
        ("Continue lisinopril", ["chronic hypertension", "currently pregnant"], "lisinopril"),
        ("Levofloxacin 750 mg daily", ["myasthenia gravis on pyridostigmine"], "levofloxacin"),
        ("Azithromycin", ["myasthenia gravis"], "azithromycin"),
        ("Propranolol for tremor", ["asthma"], "propranolol"),
        ("IV metoprolol", ["acute decompensated heart failure"], "metoprolol"),
        ("Ketorolac IV", ["upper gastrointestinal bleed"], "ketorolac"),
    ],
)
def test_contraindication_conflicts(text: str, conditions: list[str], subject: str) -> None:
    conflicts = contraindication_conflicts(text, conditions)
    assert [c.subject for c in conflicts] == [subject]
    assert conflicts[0].severity == "contraindicated"


@pytest.mark.parametrize(
    ("text", "conditions"),
    [
        ("Metformin 500 mg", ["eGFR 45 mL/min/1.73 m2"]),
        ("Metformin 500 mg", ["eGFR 24 (last year)", "eGFR 52 today"]),
        ("CT pulmonary angiography; lisinopril", ["urine pregnancy test negative", "not pregnant"]),
        ("Metoprolol", ["asthma"]),
        ("Discontinue metformin and start dulaglutide", ["eGFR 24"]),
    ],
)
def test_contraindication_negatives(text: str, conditions: list[str]) -> None:
    assert contraindication_conflicts(text, conditions) == []


@pytest.mark.parametrize(
    "text",
    [
        "Start ceftriaxone now, then draw blood cultures.",
        "Give alteplase immediately and obtain an ECG.",
        "Proceed to liver biopsy; check coagulation profile afterwards.",
        "Order a CT abdomen, then a pregnancy test.",
    ],
)
def test_precedence_violations_fire_when_out_of_order(text: str) -> None:
    violations = precedence_violations(text)
    assert len(violations) == 1
    assert violations[0].kind == "precedence"


@pytest.mark.parametrize(
    "text",
    [
        "Draw blood cultures, then start ceftriaxone.",
        "Start antibiotics after blood cultures are drawn.",
        "Obtain an ECG, then give alteplase.",
        "Start ceftriaxone.",
        "Check coagulation profile before the biopsy.",
    ],
)
def test_precedence_in_order_or_single_activity_passes(text: str) -> None:
    assert precedence_violations(text) == []
