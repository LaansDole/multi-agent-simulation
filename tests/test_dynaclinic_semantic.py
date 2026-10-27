"""Semantic divergence for open-ended cases: calibration fixture for TAU_SEMANTIC and the distance.

The pairs are written for this fixture (none come from the proposal's examples): each SAME pair states one
diagnosis or plan in two clinical phrasings, each DIFFERENT pair two competing diagnoses for one presentation.
"""

from itertools import pairwise

import pytest

from dynaclinic.divergence import (
    HASHING_EMBEDDER,
    OPENAI_EMBEDDING_MODEL,
    TAU_SEMANTIC,
    cosine_distance,
    semantic_divergence,
    semantic_tau,
)
from dynaclinic.interfaces import HashingEmbeddingMemory

SAME_DIAGNOSIS = [
    ("Acute appendicitis; refer for appendectomy.", "Findings fit acute appendicitis needing appendectomy."),
    ("Diabetic ketoacidosis requiring insulin and fluids.", "DKA: start IV fluids and an insulin infusion."),
    ("Community-acquired pneumonia; start empiric antibiotics.",
     "Right lower lobe community-acquired pneumonia treated with antibiotics."),
    ("Bacterial meningitis; give empiric IV antibiotics now.",
     "Suspected bacterial meningitis requiring immediate IV antibiotics."),
    ("Acute gout flare of the first toe.", "Gouty arthritis flare in the big toe."),
    ("Acute ischemic stroke; assess for thrombolysis.", "Ischemic stroke within the window for thrombolysis."),
    ("Acute pyelonephritis needing antibiotics.", "Pyelonephritis (kidney infection); treat with antibiotics."),
    ("Cellulitis of the lower leg; oral antibiotics.", "Lower leg cellulitis, treat with oral antibiotics."),
    ("Asthma exacerbation; inhaled bronchodilators and oral steroids.",
     "Acute asthma exacerbation: bronchodilators plus systemic steroids."),
    ("Primary hypothyroidism; start levothyroxine.", "Hypothyroidism needing levothyroxine replacement."),
]
DIFFERENT_DIAGNOSIS = [
    ("Acute appendicitis; refer for appendectomy.", "Ovarian torsion; urgent gynecology review."),
    ("Diabetic ketoacidosis requiring insulin and fluids.", "Hyperosmolar hyperglycemic state."),
    ("Community-acquired pneumonia; start empiric antibiotics.", "Decompensated heart failure; start diuretics."),
    ("Bacterial meningitis; give empiric IV antibiotics now.", "Subarachnoid hemorrhage; urgent CT head."),
    ("Acute gout flare of the first toe.", "Septic arthritis of the toe; aspirate the joint."),
    ("Acute ischemic stroke; assess for thrombolysis.", "Hypoglycemia mimicking a stroke; give glucose."),
    ("Acute pyelonephritis needing antibiotics.", "Ureteric stone with renal colic; give analgesia."),
    ("Cellulitis of the lower leg; oral antibiotics.", "Deep vein thrombosis of the leg; start anticoagulation."),
    ("Asthma exacerbation; inhaled bronchodilators and oral steroids.", "Anaphylaxis; give intramuscular epinephrine."),
    ("Primary hypothyroidism; start levothyroxine.", "Major depressive disorder; start an SSRI."),
]


def _hashing_distances(pairs: list[tuple[str, str]]) -> list[float]:
    memory = HashingEmbeddingMemory()
    return [cosine_distance(memory.embed(a), memory.embed(b)) for a, b in pairs]


def test_hashing_tau_semantic_is_the_lowest_max_accuracy_cut_of_the_fixture() -> None:
    same, different = _hashing_distances(SAME_DIAGNOSIS), _hashing_distances(DIFFERENT_DIAGNOSIS)
    points = sorted(same + different)
    cuts = [(low + high) / 2 for low, high in pairwise(points)]

    def correct(tau: float) -> int:  # SAME pairs stay below tau, DIFFERENT pairs switch
        return sum(d < tau for d in same) + sum(d >= tau for d in different)

    best = max(map(correct, cuts))
    tau = TAU_SEMANTIC[HASHING_EMBEDDER]
    assert tau == round(next(cut for cut in cuts if correct(cut) == best), 3)
    assert (best, correct(tau), sum(d < tau for d in same), sum(d >= tau for d in different)) == (19, 19, 10, 9)


def test_cosine_distance_is_clipped_to_the_unit_interval() -> None:
    assert cosine_distance([1, 0], [2, 0]) == 0.0
    assert cosine_distance([1, 0], [0, 3]) == 1.0
    assert cosine_distance([1, 0], [-1, 0]) == 1.0  # opposite vectors clip at 1, not 2
    assert cosine_distance([0, 0], [1, 0]) == 1.0
    assert cosine_distance([1, 1], [1, 0]) == pytest.approx(1 - 2 ** -0.5)


def test_semantic_divergence_is_the_mean_pairwise_distance() -> None:
    assert semantic_divergence([[1, 0], [1, 0], [0, 1]]) == pytest.approx(2 / 3)
    assert semantic_divergence([[1, 0]]) == 0.0


def test_configured_tau_semantic_wins_and_unknown_embedders_get_the_hashing_value() -> None:
    assert semantic_tau(OPENAI_EMBEDDING_MODEL) == TAU_SEMANTIC[OPENAI_EMBEDDING_MODEL] != TAU_SEMANTIC[HASHING_EMBEDDER]
    assert semantic_tau("fake") == TAU_SEMANTIC[HASHING_EMBEDDER]
    assert semantic_tau(OPENAI_EMBEDDING_MODEL, 0.1) == 0.1
