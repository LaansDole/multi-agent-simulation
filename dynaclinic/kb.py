"""Static Experience-Memory-lite knowledge base.

ILLUSTRATIVE, NOT CLINICALLY VALIDATED. A small hand-written subset of well-known
drug interactions, allergy classes, contraindications and precedence rules, used by
the Layer-4 safety gates (T_SAD / A_SAD) and the Clinical Critic's rule score.
It is not a drug database and must never be used for patient care.

Severity: ``contraindicated`` means "avoid" (a gate violation); ``caution`` is a note only.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, Literal

from dynaclinic.interfaces import sections_from_structured

Severity = Literal["contraindicated", "caution"]


@dataclass(frozen=True)
class KBConflict:
    """One knowledge-base hit: ``subject`` (drug or activity) conflicts with ``other``."""

    kind: Literal["allergy", "interaction", "contraindication", "precedence"]
    subject: str
    other: str
    reason: str
    severity: Severity = "contraindicated"

    def __str__(self) -> str:
        return f"{self.kind} ({self.severity}): {self.subject} vs {self.other} - {self.reason}"


DRUG_CLASSES: dict[str, frozenset[str]] = {
    name: frozenset(members)
    for name, members in {
        "penicillin": ["penicillin", "amoxicillin", "ampicillin", "piperacillin", "nafcillin", "oxacillin", "dicloxacillin"],
        "cephalosporin": ["cephalexin", "cefazolin", "cefuroxime", "ceftriaxone", "cefotaxime", "cefepime", "cefdinir"],
        "sulfonamide": ["sulfamethoxazole", "sulfadiazine"],
        "macrolide": ["azithromycin", "clarithromycin", "erythromycin"],
        "fluoroquinolone": ["ciprofloxacin", "levofloxacin", "moxifloxacin"],
        "aminoglycoside": ["gentamicin", "tobramycin", "amikacin"],
        "other_antibiotic": [
            "vancomycin", "meropenem", "doxycycline", "tetracycline", "nitrofurantoin", "clindamycin",
            "metronidazole", "aztreonam", "fosfomycin", "trimethoprim", "linezolid",
        ],
        "nsaid": ["ibuprofen", "naproxen", "diclofenac", "ketorolac", "indomethacin", "celecoxib", "meloxicam", "aspirin"],
        "ssri": ["sertraline", "fluoxetine", "paroxetine", "citalopram", "escitalopram"],
        "maoi": ["phenelzine", "tranylcypromine", "isocarboxazid", "selegiline", "linezolid"],
        "serotonergic_other": ["tramadol", "meperidine", "dextromethorphan"],
        "ace_inhibitor": ["lisinopril", "enalapril", "ramipril", "captopril", "benazepril"],
        "arb": ["losartan", "valsartan", "irbesartan", "candesartan"],
        "potassium_raising": ["spironolactone", "eplerenone", "amiloride", "triamterene", "potassium chloride"],
        "cyp3a4_statin": ["simvastatin", "lovastatin"],
        "nitrate": ["nitroglycerin", "isosorbide mononitrate", "isosorbide dinitrate"],
        "pde5_inhibitor": ["sildenafil", "tadalafil", "vardenafil"],
        "beta_blocker": ["metoprolol", "atenolol", "bisoprolol", "propranolol", "carvedilol", "labetalol", "nadolol"],
        "nonselective_beta_blocker": ["propranolol", "nadolol", "carvedilol", "labetalol", "timolol"],
        "teratogen": ["isotretinoin", "warfarin", "methotrexate", "valproate", "misoprostol"],
        "thrombolytic": ["alteplase", "tenecteplase"],
        "warfarin_potentiator": ["fluconazole", "metronidazole", "amiodarone"],
        "ppi_cyp2c19": ["omeprazole", "esomeprazole"],
        "unclassified": [
            "warfarin", "methotrexate", "lithium", "metformin", "clopidogrel", "digoxin", "amiodarone", "allopurinol",
            "azathioprine", "theophylline", "acetaminophen", "apixaban", "rivaroxaban", "heparin", "insulin",
            "levothyroxine", "prednisone", "furosemide", "hydrochlorothiazide", "amlodipine", "atorvastatin",
            "dulaglutide", "pyridostigmine", "pantoprazole",
        ],
    }.items()
}
ANTIBIOTICS = frozenset().union(
    *(DRUG_CLASSES[c] for c in ("penicillin", "cephalosporin", "sulfonamide", "macrolide", "fluoroquinolone",
                                "aminoglycoside", "other_antibiotic"))
)
_ALIASES = {
    "tmp-smx": ("trimethoprim", "sulfamethoxazole"),
    "co-trimoxazole": ("trimethoprim", "sulfamethoxazole"),
    "bactrim": ("trimethoprim", "sulfamethoxazole"),
    "augmentin": ("amoxicillin",),
    "paracetamol": ("acetaminophen",),
}
_ALL_DRUGS = frozenset().union(*DRUG_CLASSES.values())


def _members(*names: str) -> frozenset[str]:
    """Resolve class names and/or drug names to a set of drugs."""
    return frozenset().union(*(DRUG_CLASSES.get(name, {name}) for name in names))


def _phrase_regex(phrases: Iterable[str]) -> re.Pattern[str]:
    alternation = "|".join(re.escape(p).replace(r"\ ", r"\s+") for p in sorted(phrases, key=len, reverse=True))
    return re.compile(rf"\b(?:{alternation})\b", re.IGNORECASE)


_DRUG_RE = _phrase_regex([*_ALL_DRUGS, *_ALIASES])
# ponytail: surface negation heuristic (cue within two words, same clause); a parsed plan would replace it.
_NEGATION_RE = re.compile(
    r"\b(?:avoid(?:s|ed|ing)?|no|not|without|discontinue[ds]?|stop(?:s|ping|ped)?|hold(?:s|ing)?|withhold(?:s|ing)?|"
    r"instead\s+of|contraindicated|allergic\s+to|allergy\s+to)\b(?:\s+[^\s.;:!?]+){0,2}\s*$",
    re.IGNORECASE,
)
# "penicillin allergy", "amoxicillin rash", "penicillin-class hypersensitivity": the drug names a past reaction.
_REACTION_AFTER_RE = re.compile(
    r"(?:[\s-]+class)?[\s-]+(?:allerg|anaphyla|hypersensitiv|intoleran|reaction|rash)", re.IGNORECASE
)


def _canonical(match: str) -> tuple[str, ...]:
    name = re.sub(r"\s+", " ", match.lower())
    return _ALIASES.get(name, (name,))


def drugs_in(text: str) -> set[str]:
    """Return every known drug mentioned in ``text`` (canonical lower-case names, negated mentions included)."""
    return {drug for match in _DRUG_RE.finditer(text) for drug in _canonical(match.group())}


def _asserted_drugs(text: str) -> set[str]:
    """Drugs mentioned in ``text`` that are not negated ("avoid X", "allergic to X") or a past reaction ("X allergy")."""
    return {
        drug
        for match in _DRUG_RE.finditer(text)
        if not _NEGATION_RE.search(text[max(0, match.start() - 60) : match.start()])
        and not _REACTION_AFTER_RE.match(text, match.end())
        for drug in _canonical(match.group())
    }


# --- allergies -----------------------------------------------------------------------------------

_ALLERGY_CLASS_RE = {
    name: re.compile(pattern, re.IGNORECASE)
    for name, pattern in {
        "penicillin": r"penicillin",
        "cephalosporin": r"cephalosporin",
        "sulfonamide": r"\bsulfa|sulfonamide",
        "macrolide": r"macrolide",
        "fluoroquinolone": r"quinolone",
        "nsaid": r"nsaid|non-?steroidal",
    }.items()
}
_CROSS_REACTIVITY = {
    "penicillin": ("cephalosporin", "penicillin-cephalosporin cross-reactivity (~1-2%); avoid after anaphylaxis"),
}


def allergy_conflicts(text: str, allergies: Iterable[str]) -> list[KBConflict]:
    """Drugs asserted in ``text`` that belong to an allergy class (or cross-react) for this patient."""
    asserted = _asserted_drugs(text)
    found: set[KBConflict] = set()
    for allergy in allergies:
        classes = {c for c, regex in _ALLERGY_CLASS_RE.items() if regex.search(allergy)}
        classes |= {c for c in _ALLERGY_CLASS_RE for drug in drugs_in(allergy) if drug in DRUG_CLASSES[c]}
        blocked = _members(*classes) | drugs_in(allergy)
        for drug in asserted & blocked:
            found.add(KBConflict("allergy", drug, allergy, "drug is in the patient's allergy class"))
        severity: Severity = "contraindicated" if re.search(r"anaphyla", allergy, re.IGNORECASE) else "caution"
        for allergy_class in classes & _CROSS_REACTIVITY.keys():
            cross_class, note = _CROSS_REACTIVITY[allergy_class]
            for drug in (asserted & DRUG_CLASSES[cross_class]) - blocked:
                found.add(KBConflict("allergy", drug, allergy, note, severity))
    return sorted(found, key=lambda c: (c.subject, c.other))


# --- drug-drug interactions ----------------------------------------------------------------------

_INTERACTIONS: list[tuple[frozenset[str], frozenset[str], str, Severity]] = [
    (_members("warfarin"), _members("nsaid"), "major bleeding risk", "contraindicated"),
    (_members("warfarin"), _members("warfarin_potentiator"), "CYP2C9 inhibition raises INR (bleeding)", "contraindicated"),
    (_members("maoi"), _members("ssri"), "serotonin syndrome", "contraindicated"),
    (_members("maoi"), _members("serotonergic_other"), "serotonin syndrome / hypertensive crisis", "contraindicated"),
    (_members("ssri"), _members("tramadol"), "serotonin syndrome and seizure risk", "caution"),
    (_members("ace_inhibitor", "arb"), _members("potassium_raising"), "hyperkalemia", "contraindicated"),
    (_members("clarithromycin", "erythromycin"), _members("cyp3a4_statin"), "CYP3A4 inhibition: rhabdomyolysis",
     "contraindicated"),
    (_members("nitrate"), _members("pde5_inhibitor"), "profound hypotension", "contraindicated"),
    (_members("methotrexate"), _members("trimethoprim"), "additive antifolate effect: bone-marrow suppression",
     "contraindicated"),
    (_members("lithium"), _members("nsaid"), "reduced lithium clearance: lithium toxicity", "contraindicated"),
    (_members("allopurinol"), _members("azathioprine"), "xanthine oxidase inhibition: myelotoxicity", "contraindicated"),
    (_members("theophylline"), _members("ciprofloxacin"), "CYP1A2 inhibition: theophylline toxicity", "contraindicated"),
    (_members("digoxin"), _members("amiodarone"), "raised digoxin levels; reduce the digoxin dose", "caution"),
    (_members("clopidogrel"), _members("ppi_cyp2c19"), "CYP2C19 inhibition reduces clopidogrel activation", "caution"),
]


def interaction_conflicts(text: str, meds: Iterable[str]) -> list[KBConflict]:
    """Drugs asserted in ``text`` that interact with the patient's current ``meds``."""
    asserted = _asserted_drugs(text)
    current = drugs_in(" ; ".join(meds))
    found = {
        KBConflict("interaction", drug, med, reason, severity)
        for group_a, group_b, reason, severity in _INTERACTIONS
        for drug in asserted
        for med in current
        if drug != med and ((drug in group_a and med in group_b) or (drug in group_b and med in group_a))
    }
    return sorted(found, key=lambda c: (c.subject, c.other))


# --- condition contraindications -----------------------------------------------------------------

_PREGNANT = r"(?<!not )\bpregnant\b|\bpregnancy\b(?!\s+test)|\bweeks?'?\s+(?:of\s+)?gestation"
_MYASTHENIA = r"myasthenia"


def _egfr_below_30(conditions: str) -> bool:
    if re.search(r"dialysis|end-stage renal|\besrd\b", conditions):
        return True
    values = re.findall(r"\begfr\b\D{0,20}?(\d+(?:\.\d+)?)", conditions)
    return bool(values) and float(values[-1]) < 30  # last value = most recent in time-ordered labs


_CONTRAINDICATIONS: list[tuple[frozenset[str], str | None, str]] = [
    (_members("beta_blocker"), r"decompensated heart failure|cardiogenic shock|pulmonary edema",
     "negative inotropy worsens acute decompensated heart failure"),
    (_members("nonselective_beta_blocker"), r"asthma", "non-selective beta-blockade provokes bronchospasm"),
    (_members("metformin"), None, "eGFR < 30: lactic acidosis risk"),
    (_members("fluoroquinolone"), _MYASTHENIA, "boxed warning: exacerbates myasthenia gravis"),
    (_members("aminoglycoside"), _MYASTHENIA, "neuromuscular blockade in myasthenia gravis"),
    (_members("macrolide"), _MYASTHENIA, "reported to exacerbate myasthenia gravis"),
    (_members("ace_inhibitor", "arb"), _PREGNANT, "fetotoxic in pregnancy"),
    (_members("teratogen"), _PREGNANT, "teratogenic in pregnancy"),
    (_members("fluoroquinolone"), _PREGNANT, "avoided in pregnancy"),
    (_members("nsaid"), r"peptic ulcer|gastrointestinal bleed|\bgi bleed|melena|hematemesis", "gastrointestinal bleeding"),
    (_members("thrombolytic"), r"intracranial hemorrhage|active bleeding|recent major surgery", "bleeding risk"),
]


def contraindication_conflicts(text: str, conditions: Iterable[str]) -> list[KBConflict]:
    """Drugs asserted in ``text`` that are contraindicated by the patient's ``conditions`` (history, labs, status)."""
    context = " ; ".join(conditions).lower()
    asserted = _asserted_drugs(text)
    found: set[KBConflict] = set()
    for drugs, pattern, reason in _CONTRAINDICATIONS:
        if pattern is None:
            label = "eGFR < 30" if _egfr_below_30(context) else None
        else:
            match = re.search(pattern, context)
            label = match.group() if match else None
        if label:
            found |= {KBConflict("contraindication", drug, label, reason) for drug in asserted & drugs}
    return sorted(found, key=lambda c: (c.subject, c.other))


def patient_conflicts(text: str, structured: dict[str, Any]) -> list[KBConflict]:
    """Allergy, interaction and contraindication conflicts of ``text`` for one patient (all severities).

    Allergies and meds come from ``structured``; conditions from its Demographics, History and Labs
    sections. Single source for the Clinical Critic's rule score and the safety gates, so they flag
    exactly what the dataset's ``unsafe_options`` were checked against.
    """
    sections = sections_from_structured(structured)
    return [
        *allergy_conflicts(text, structured.get("allergies") or []),
        *interaction_conflicts(text, structured.get("meds") or []),
        *contraindication_conflicts(text, [sections["Demographics"], sections["History"], sections["Labs"]]),
    ]


# --- precedence (A_SAD) --------------------------------------------------------------------------

_ANTIBIOTIC_RE = r"\bantibiotics?\b|\bantimicrobials?\b|" + _phrase_regex(ANTIBIOTICS).pattern
_THROMBOLYSIS_RE = r"thromboly|fibrinoly|alteplase|tenecteplase"
_PRECEDENCE: list[tuple[str, str, str, str, str]] = [
    ("coagulation profile", r"coagulation (?:profile|panel|studies|screen)|\binr\b|\bp?ptt\b|prothrombin time",
     "invasive procedure", r"biopsy|lumbar puncture|paracentesis|thoracentesis|central (?:venous )?(?:line|catheter)",
     "check coagulation before an invasive procedure"),
    ("blood cultures", r"blood cultures?", "antibiotics", _ANTIBIOTIC_RE,
     "draw blood cultures before the first antibiotic dose in sepsis"),
    ("pregnancy test", r"pregnancy test|\b(?:beta-?)?hcg\b", "CT or teratogenic drug",
     r"\bct\b|computed tomography|isotretinoin|methotrexate|valproate|misoprostol",
     "exclude pregnancy before ionising imaging or teratogens"),
    ("ECG", r"\becg\b|\bekg\b|electrocardiogra", "thrombolysis", _THROMBOLYSIS_RE, "obtain an ECG before thrombolysis"),
    ("CT head", r"\bct (?:head|brain)\b|\bhead ct\b|non-?contrast ct", "thrombolysis", _THROMBOLYSIS_RE,
     "exclude haemorrhage on CT before thrombolysis"),
]
_REVERSED_ORDER = re.compile(r"\b(?:after|once|following|until|pending)\b", re.IGNORECASE)


def precedence_violations(text: str) -> list[KBConflict]:
    """Pairs of activities mentioned in the wrong order (e.g. antibiotics before blood cultures).

    Fires only when both activities are mentioned. Surface order is used, except that
    "X after/once/following Y" counts as Y first.
    """
    found = []
    for first_label, first_re, then_label, then_re, reason in _PRECEDENCE:
        first = re.search(first_re, text, re.IGNORECASE)
        then = re.search(then_re, text, re.IGNORECASE)
        if (
            first
            and then
            and then.start() < first.start()
            and not _REVERSED_ORDER.search(text[then.end() : first.start()])
        ):
            found.append(KBConflict("precedence", then_label, first_label, reason))
    return found
