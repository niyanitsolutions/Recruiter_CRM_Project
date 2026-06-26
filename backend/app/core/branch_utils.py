"""
Branch / Specialization normalization for ATS candidate-job matching.

Canonical value = short slug (e.g. "cse").
Each registry entry has a human-readable label and a list of pre-normalised
aliases. The module exposes:

    find_canonical(text)           → Optional[str]
    candidate_qualifies_for_branches(required, education_list)  → bool
    BRANCH_OPTIONS                 — list of {value, label} for the API
    BRANCH_LABEL_MAP               — slug → label dict
"""
import re
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Core normaliser — applied to alias strings at build time AND to inputs at
# match time, so the comparison is always apples-to-apples.
# ---------------------------------------------------------------------------

def _n(s: str) -> str:
    """Normalise: lowercase, & → and, strip non-alnum/space, collapse spaces."""
    s = s.lower()
    s = s.replace("&", "and").replace("+", "and")
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


# Degree-level prefixes stripped from inputs like "B.Tech CSE" → "cse".
# Sorted longest-first so "bachelor of engineering" is tried before "be".
_DEGREE_PREFIXES: List[str] = sorted(
    [_n(p) for p in [
        "Bachelor of Engineering", "Bachelor of Technology",
        "Bachelor of Science", "Bachelor of Computer Applications",
        "Bachelor of Architecture", "Bachelor of Arts", "Bachelor of Commerce",
        "Master of Engineering", "Master of Technology",
        "Master of Science", "Master of Computer Applications",
        "Master of Business Administration",
        "B.Tech", "B.E.", "B.E", "B.Sc.", "B.Sc",
        "M.Tech", "M.E.", "M.Sc.", "M.Sc",
        "B Tech", "B E", "B Sc",
        "M Tech", "M E", "M Sc",
        "Btech", "Mtech",
    ]],
    key=len, reverse=True,
)


def _strip_degree(s: str) -> str:
    """Remove a degree-level prefix from an already-normalised string."""
    for p in _DEGREE_PREFIXES:
        if s.startswith(p + " "):
            return s[len(p):].strip()
    return s


# ---------------------------------------------------------------------------
# Alias list builder — normalises each raw string and deduplicates.
# ---------------------------------------------------------------------------

def _a(*raw: str) -> List[str]:
    seen: Dict[str, None] = {}
    for r in raw:
        seen[_n(r)] = None
    return list(seen.keys())


# ---------------------------------------------------------------------------
# Branch registry
# Each entry: value (slug), label (display), aliases (pre-normalised list)
# Add new branches here — no other file needs changing.
# ---------------------------------------------------------------------------

BRANCH_REGISTRY: List[Dict[str, Any]] = [
    {
        "value": "any_branch",
        "label": "Any Branch",
        "aliases": _a(
            "any branch", "any", "all branches", "open to all", "all streams",
            "any specialization",
        ),
    },
    {
        "value": "cse",
        "label": "Computer Science Engineering (CSE)",
        "aliases": _a(
            "cse", "cs", "computer science", "computer science engineering",
            "computer science engg", "computer science and engineering",
            "comp sci", "comp science", "computer sci engg", "cse engg",
            "computer science eng",
        ),
    },
    {
        "value": "it",
        "label": "Information Technology (IT)",
        "aliases": _a(
            "it", "information technology", "information tech",
            "info tech", "infotech", "info technology",
        ),
    },
    {
        "value": "ece",
        "label": "Electronics & Communication Engineering (ECE)",
        "aliases": _a(
            "ece", "ec",
            "electronics and communication",
            "electronics communication",
            "electronics and communication engineering",
            "electronics communication engineering",
            "electronics and communication engg",
            "electronics and comm engineering",
            "e and c",
        ),
    },
    {
        "value": "eee",
        "label": "Electrical & Electronics Engineering (EEE)",
        "aliases": _a(
            "eee",
            "electrical and electronics",
            "electrical and electronics engineering",
            "electrical electronics",
            "electrical electronics engineering",
            "electrical and electronics engg",
        ),
    },
    {
        "value": "ee",
        "label": "Electrical Engineering (EE)",
        "aliases": _a(
            "ee", "electrical engineering", "electrical engg", "electrical",
        ),
    },
    {
        "value": "mech",
        "label": "Mechanical Engineering (ME)",
        "aliases": _a(
            "me", "mech", "mechanical", "mechanical engineering",
            "mechanical engg", "mechanical eng",
        ),
    },
    {
        "value": "ce",
        "label": "Civil Engineering (CE)",
        "aliases": _a(
            "ce", "civil", "civil engineering", "civil engg", "civil eng",
        ),
    },
    {
        "value": "che",
        "label": "Chemical Engineering (CHE)",
        "aliases": _a(
            "che", "chemical", "chemical engineering", "chemical engg",
            "chem engg",
        ),
    },
    {
        "value": "aiml",
        "label": "Artificial Intelligence & Machine Learning (AI & ML)",
        "aliases": _a(
            "aiml", "ai ml", "ai and ml",
            "artificial intelligence machine learning",
            "artificial intelligence and machine learning",
            "ai and machine learning",
        ),
    },
    {
        "value": "aids",
        "label": "Artificial Intelligence & Data Science (AI & DS)",
        "aliases": _a(
            "aids", "ai ds", "ai and ds",
            "artificial intelligence data science",
            "artificial intelligence and data science",
            "ai and data science",
        ),
    },
    {
        "value": "ds",
        "label": "Data Science (DS)",
        "aliases": _a(
            "ds", "data science", "data sci",
        ),
    },
    {
        "value": "cyber_security",
        "label": "Cyber Security",
        "aliases": _a(
            "cyber security", "cybersecurity", "cyber sec",
            "information security", "info security", "network security",
            "cyber",
        ),
    },
    {
        "value": "iot",
        "label": "Internet of Things (IoT)",
        "aliases": _a(
            "iot", "internet of things",
        ),
    },
    {
        "value": "robotics",
        "label": "Robotics & Automation",
        "aliases": _a(
            "robotics", "robotics and automation",
            "automation", "robot engg", "robotics engineering",
            "robotics engg",
        ),
    },
    {
        "value": "aerospace",
        "label": "Aerospace Engineering",
        "aliases": _a(
            "aerospace", "aerospace engineering",
            "aeronautical engineering", "aeronautical", "aero engg",
            "aeronautics",
        ),
    },
    {
        "value": "automobile",
        "label": "Automobile Engineering",
        "aliases": _a(
            "automobile", "automobile engineering", "auto engg",
            "automotive engineering", "automotive",
        ),
    },
    {
        "value": "biomedical",
        "label": "Biomedical Engineering",
        "aliases": _a(
            "biomedical", "biomedical engineering",
            "bio medical", "bio medical engineering",
        ),
    },
    {
        "value": "biotechnology",
        "label": "Biotechnology",
        "aliases": _a(
            "biotechnology", "biotech", "bio technology", "bio tech",
        ),
    },
    {
        "value": "mining",
        "label": "Mining Engineering",
        "aliases": _a(
            "mining", "mining engineering", "mine engg",
        ),
    },
    {
        "value": "metallurgical",
        "label": "Metallurgical Engineering",
        "aliases": _a(
            "metallurgical", "metallurgy", "metallurgical engineering",
            "metal engg", "metallurgy engg",
        ),
    },
    {
        "value": "agricultural",
        "label": "Agricultural Engineering",
        "aliases": _a(
            "agricultural", "agriculture", "agricultural engineering",
            "agri engg", "agri engineering",
        ),
    },
    {
        "value": "architecture",
        "label": "Architecture (B.Arch)",
        "aliases": _a(
            "architecture", "arch", "b arch", "barch",
        ),
    },
    {
        "value": "bca",
        "label": "BCA",
        "aliases": _a(
            "bca", "bachelor of computer applications",
            "bachelor computer applications",
        ),
    },
    {
        "value": "mca",
        "label": "MCA",
        "aliases": _a(
            "mca", "master of computer applications",
            "master computer applications",
        ),
    },
    {
        "value": "bsc_cs",
        "label": "B.Sc Computer Science",
        "aliases": _a(
            "bsc cs", "bsc computer science",
            "b sc cs", "b sc computer science",
            "bsc cse", "b sc cse",
        ),
    },
    {
        "value": "bsc_it",
        "label": "B.Sc Information Technology",
        "aliases": _a(
            "bsc it", "bsc information technology",
            "b sc it", "b sc information technology",
        ),
    },
    {
        "value": "bcom",
        "label": "B.Com",
        "aliases": _a(
            "bcom", "b com", "bachelor of commerce", "commerce",
        ),
    },
    {
        "value": "bba",
        "label": "BBA",
        "aliases": _a(
            "bba", "bachelor of business administration",
            "bachelor business administration",
        ),
    },
    {
        "value": "mba",
        "label": "MBA",
        "aliases": _a(
            "mba", "master of business administration",
            "master business administration",
        ),
    },
    {
        "value": "mtech",
        "label": "M.Tech",
        "aliases": _a(
            "mtech", "m tech", "master of technology",
            "masters in technology",
        ),
    },
    {
        "value": "me_degree",
        "label": "M.E",
        "aliases": _a(
            "m e degree", "master of engineering", "masters in engineering",
        ),
    },
]

# ---------------------------------------------------------------------------
# Fast-lookup maps
# ---------------------------------------------------------------------------

# alias → canonical value
_ALIAS_MAP: Dict[str, str] = {}
for _b in BRANCH_REGISTRY:
    for _alias in _b["aliases"]:
        _ALIAS_MAP.setdefault(_alias, _b["value"])

# Exported constants
BRANCH_OPTIONS: List[Dict[str, str]] = [
    {"value": b["value"], "label": b["label"]}
    for b in BRANCH_REGISTRY
]

BRANCH_LABEL_MAP: Dict[str, str] = {b["value"]: b["label"] for b in BRANCH_REGISTRY}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def find_canonical(text: str) -> Optional[str]:
    """
    Map any input text to its canonical branch slug.

    Algorithm:
      1. Normalise the raw input.
      2. Look up in the alias map.
      3. If not found, strip a degree-level prefix and try again.

    Examples:
        find_canonical("CSE")                  → "cse"
        find_canonical("Computer Science")      → "cse"
        find_canonical("B.Tech CSE")            → "cse"
        find_canonical("BE Computer Science")   → "cse"
        find_canonical("ECE")                   → "ece"
        find_canonical("Electronics & Comm")    → "ece"
        find_canonical("MCA")                   → "mca"
    """
    if not text or not text.strip():
        return None

    normalized = _n(text)

    # Pass 1: direct match
    if normalized in _ALIAS_MAP:
        return _ALIAS_MAP[normalized]

    # Pass 2: strip degree prefix, retry
    stripped = _strip_degree(normalized)
    if stripped and stripped != normalized and stripped in _ALIAS_MAP:
        return _ALIAS_MAP[stripped]

    return None


def candidate_qualifies_for_branches(
    required_branches: List[str],
    candidate_education: List[Dict[str, Any]],
) -> bool:
    """
    Return True when the candidate's education matches at least one required branch.

    Rules:
    - Empty required_branches → no restriction (always True).
    - "any_branch" in required set → always True.
    - Otherwise, compare every education entry's field_of_study and degree
      against the required set using find_canonical().
    """
    if not required_branches:
        return True

    req_canonical: set = set()
    for b in required_branches:
        c = find_canonical(b)
        if c:
            req_canonical.add(c)

    if not req_canonical:
        return True
    if "any_branch" in req_canonical:
        return True

    for edu in (candidate_education or []):
        if not isinstance(edu, dict):
            continue
        for field in ("field_of_study", "degree"):
            val = edu.get(field) or ""
            if val:
                c = find_canonical(val)
                if c and c in req_canonical:
                    return True

    return False
