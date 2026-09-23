#!/usr/bin/env python3
"""Add approximate Latin (French-style) spellings for Arabic student names."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "school_data.json"

# Common Algerian name digraphs first (longest match)
DIGRAPHS = [
    ("عبدال", "Abdel"),
    ("عبد ال", "Abdel "),
    ("عبد", "Abd"),
    ("بن ", "Ben "),
    ("بو", "Bou"),
    ("الش", "Ech"),
    ("ال", "El"),
    ("ة", "a"),
    ("ى", "a"),
    ("آ", "A"),
    ("أ", "A"),
    ("إ", "I"),
    ("ئ", "i"),
    ("ؤ", "ou"),
    ("ء", ""),
    ("ث", "th"),
    ("خ", "kh"),
    ("ذ", "dh"),
    ("ش", "ch"),
    ("ص", "s"),
    ("ض", "d"),
    ("ط", "t"),
    ("ظ", "dh"),
    ("ع", "a"),
    ("غ", "gh"),
    ("ق", "k"),
    ("ك", "k"),
    ("ه", "h"),
    ("ح", "h"),
    ("ج", "dj"),
    ("ي", "i"),
    ("و", "ou"),
    ("ة", "a"),
    ("ا", "a"),
    ("ب", "b"),
    ("ت", "t"),
    ("ث", "th"),
    ("ج", "j"),
    ("د", "d"),
    ("ذ", "z"),
    ("ر", "r"),
    ("ز", "z"),
    ("س", "s"),
    ("ش", "ch"),
    ("ف", "f"),
    ("ق", "q"),
    ("ك", "k"),
    ("ل", "l"),
    ("م", "m"),
    ("ن", "n"),
    ("ه", "h"),
    ("و", "ou"),
    ("ي", "i"),
    ("ى", "a"),
    ("ة", "a"),
    ("ً", ""),
    ("ٌ", ""),
    ("ٍ", ""),
    ("َ", ""),
    ("ُ", ""),
    ("ِ", ""),
    ("ّ", ""),
    ("ْ", ""),
    ("ـ", ""),
]

AR_RE = re.compile(r"[\u0600-\u06FF]")

# Frequent given names (approx. French school spelling)
GIVEN = {
    "محمد": "Mohamed",
    "امير": "Amir",
    "أمير": "Amir",
    "انس": "Anes",
    "أنس": "Anes",
    "جواد": "Djouad",
    "سامي": "Sami",
    "زياد": "Ziad",
    "ميس": "Mays",
    "ماهر": "Maher",
    "مريم": "Meriem",
    "فاطمة": "Fatima",
    "عائشة": "Aicha",
    "ايمان": "Imane",
    "إيمان": "Imane",
    "ياسين": "Yacine",
    "يوسف": "Youcef",
    "أمين": "Amine",
    "امين": "Amine",
    "أحمد": "Ahmed",
    "احمد": "Ahmed",
    "علي": "Ali",
    "سارة": "Sara",
    "نور": "Nour",
    "ريم": "Rim",
    "لينا": "Lina",
    "آية": "Aya",
    "اية": "Aya",
    "ملك": "Malek",
    "مالك": "Malek",
    "خالد": "Khaled",
    "سليم": "Salim",
    "سلمى": "Selma",
    "هند": "Hind",
    "هدى": "Houda",
    "هناء": "Hana",
    "رانيا": "Rania",
    "رانية": "Rania",
    "أسامة": "Oussama",
    "اسامة": "Oussama",
    "عمر": "Omar",
    "كريم": "Karim",
    "نادر": "Nader",
    "نادية": "Nadia",
    "سمير": "Samir",
    "سمية": "Soumia",
    "حسين": "Hocine",
    "حسن": "Hassan",
    "إبراهيم": "Ibrahim",
    "ابراهيم": "Ibrahim",
    "اسماعيل": "Ismail",
    "إسماعيل": "Ismail",
    "عبد الرحمان": "Abderrahmane",
    "عبد الرحمن": "Abderrahmane",
    "عبد الله": "Abdallah",
}


def has_arabic(s: str) -> bool:
    return bool(AR_RE.search(s or ""))


def has_latin(s: str) -> bool:
    return bool(re.search(r"[A-Za-z]", s or ""))


def title_case_token(tok: str) -> str:
    if not tok:
        return tok
    return tok[:1].upper() + tok[1:].lower()


def letter_map(text: str) -> str:
    out = []
    i = 0
    while i < len(text):
        matched = False
        for src, dst in DIGRAPHS:
            if text.startswith(src, i):
                out.append(dst)
                i += len(src)
                matched = True
                break
        if matched:
            continue
        ch = text[i]
        if ch.isspace():
            out.append(" ")
        elif ch in "-'’":
            out.append(ch)
        elif not has_arabic(ch):
            out.append(ch)
        i += 1
    raw = "".join(out)
    raw = re.sub(r"\s+", " ", raw).strip()
    raw = re.sub(r"([aeiouy])\1{2,}", r"\1\1", raw, flags=re.I)
    return " ".join(title_case_token(p) for p in raw.split(" ") if p)


def transliterate(ar: str) -> str:
    if not ar:
        return ""
    if not has_arabic(ar):
        return " ".join(title_case_token(p) for p in ar.split())

    text = ar.strip()
    # Whole-string given-name lookup
    if text in GIVEN:
        return GIVEN[text]

    parts = text.split()
    mapped = []
    for p in parts:
        if p in GIVEN:
            mapped.append(GIVEN[p])
        else:
            mapped.append(letter_map(p) or p)
    return " ".join(mapped)


def latin_parts(first: str, last: str, full: str) -> tuple[str, str, str]:
    # Prefer transliterating each part so admin can edit later
    fl = transliterate(first) if has_arabic(first) else (first or "").strip()
    ll = transliterate(last) if has_arabic(last) else (last or "").strip()
    if fl or ll:
        # Algerian order often Family First in Arabic fullName; Latin usually First Last for FR/EN
        full_l = f"{fl} {ll}".strip() if (fl or ll) else transliterate(full)
        # If Arabic fullName is "Last First", Latin display for EN/FR is "First Last"
        return fl, ll, full_l
    return "", "", transliterate(full)


def main() -> None:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    data["school"]["name"] = "Quality education Algerie (Q.E.A)"
    data["school"]["nameShort"] = "Q.E.A"
    data["school"]["tagline"] = "Administration — Cheraga, Algiers"

    updated = 0
    for dept_key in ("primary", "middle"):
        for level in data[dept_key]["levels"]:
            for cls in level["classes"]:
                for s in cls["students"]:
                    fl, ll, full_l = latin_parts(
                        s.get("firstName", ""),
                        s.get("lastName", ""),
                        s.get("fullName", ""),
                    )
                    s["firstNameLatin"] = fl
                    s["lastNameLatin"] = ll
                    s["fullNameLatin"] = full_l
                    # Keep searchName searchable in both scripts
                    s["searchName"] = " ".join(
                        filter(
                            None,
                            [
                                s.get("fullName", ""),
                                full_l,
                                s.get("firstName", ""),
                                fl,
                                s.get("lastName", ""),
                                ll,
                            ],
                        )
                    )
                    updated += 1

    # Teachers: ensure nameLatin when Arabic
    for t in data.get("teachers", []):
        if not (t.get("nameLatin") or "").strip():
            fn = t.get("firstName", "")
            ln = t.get("lastName", "")
            if has_arabic(fn + ln):
                fl, ll, full_l = latin_parts(fn, ln, f"{ln} {fn}".strip())
                t["nameLatin"] = full_l
            elif fn or ln:
                t["nameLatin"] = f"{fn} {ln}".strip()

    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {updated} students with Latin names")
    # sample
    s0 = data["primary"]["levels"][0]["classes"][0]["students"][0]
    print("sample:", s0["fullName"], "→", s0["fullNameLatin"])


if __name__ == "__main__":
    main()
