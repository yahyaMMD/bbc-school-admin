#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carefully match parent-form submissions to students and link high-confidence pairs."""
from __future__ import annotations

import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

API = "https://quality-education-algerie.duckdns.org/api"
ADMIN_PASSWORD = "AdminBBC2026"
REPORT = Path(__file__).resolve().parents[1] / "reports" / "parent_match_link_report.json"
APPLY = "--apply" in sys.argv


def req(path, data=None, token=None, method=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    m = method or ("POST" if body is not None else "GET")
    request = urllib.request.Request(API + path, data=body, headers=headers, method=m)
    try:
        with urllib.request.urlopen(request, timeout=300) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {e.code}: {err}") from e


def norm_ar(s):
    s = str(s or "")
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    for a, b in {
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ٱ": "ا",
        "ى": "ي",
        "ئ": "ي",
        "ؤ": "و",
        "ة": "ه",
        "گ": "ك",
        "ڤ": "ف",
        "ـ": "",
        "ء": "",
    }.items():
        s = s.replace(a, b)
    s = re.sub(r"[^\w\u0600-\u06FF]+", " ", s, flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).strip().lower()


def norm_latin(s):
    s = str(s or "")
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    s = re.sub(r"[^a-zA-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip().lower()


def has_arabic(s):
    return bool(re.search(r"[\u0600-\u06FF]", str(s or "")))


def norm_dob(s):
    s = str(s or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r"^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), m.group(3)
        if d <= 31 and mo <= 12:
            return f"{y}-{mo:02d}-{d:02d}"
    return ""


def gender_norm(g):
    g = str(g or "").strip().lower()
    if g in ("male", "m", "ذكر", "garçon", "boy"):
        return "male"
    if g in ("female", "f", "أنثى", "fille", "girl"):
        return "female"
    return ""


def parse_level_hint(level_text):
    t = str(level_text or "").lower()
    raw = str(level_text or "")
    dept = None
    year = None
    if any(x in t for x in ["متوسط", "moyen", "college", "collège", " am", "1am", "2am", "3am", "4am"]):
        dept = "middle"
    if any(x in t for x in ["ابتد", "primaire", "primary", " ap", "1ap", "2ap", "3ap", "4ap", "5ap"]):
        dept = "primary"
    if any(x in t for x in ["تحض", "prépa", "prepa", "maternelle", "prepar", "moyenne section", "grande section"]):
        dept = "primary"
    m = re.search(r"([1-5])\s*(?:ère|ere|eme|ème|e)?\s*(?:année|annee)?", t)
    if not m:
        m = re.search(r"(?:ap|am|p|m)\s*([1-5])", t)
    if not m:
        m = re.search(r"([1-5])\s*(?:ap|am|p|م)", t)
    if m:
        year = int(m.group(1))
    ar_ord = {
        "الاولى": 1,
        "الأولى": 1,
        "الاول": 1,
        "الأول": 1,
        "الثانية": 2,
        "الثاني": 2,
        "الثالثة": 3,
        "الثالث": 3,
        "الرابعة": 4,
        "الرابع": 4,
        "الخامسة": 5,
        "الخامس": 5,
    }
    for k, v in ar_ord.items():
        if k in raw:
            year = v
    return dept, year


def name_score(sub_nar, sub_nlat, stu):
    scores = []
    if sub_nar and stu["nar"]:
        scores.append(SequenceMatcher(None, sub_nar, stu["nar"]).ratio())
        a, b = set(sub_nar.split()), set(stu["nar"].split())
        if a and b:
            scores.append(len(a & b) / len(a | b))
    if sub_nlat and stu["nlat"]:
        scores.append(SequenceMatcher(None, sub_nlat, stu["nlat"]).ratio())
        a, b = set(sub_nlat.split()), set(stu["nlat"].split())
        if a and b:
            scores.append(len(a & b) / len(a | b))
    return max(scores) if scores else 0


def load_students(school):
    students = []
    for dept_key in ("primary", "middle"):
        dept = school.get(dept_key) or {}
        for level in dept.get("levels") or []:
            ly = level.get("year")
            if not ly:
                m = re.search(r"(\d+)", str(level.get("id") or level.get("name") or ""))
                ly = int(m.group(1)) if m else None
            for cls in level.get("classes") or []:
                cy = cls.get("year") or ly
                for s in cls.get("students") or []:
                    students.append(
                        {
                            "id": s["id"],
                            "first": s.get("firstName") or "",
                            "last": s.get("lastName") or "",
                            "dob": norm_dob(s.get("dateOfBirth") or ""),
                            "gender": gender_norm(s.get("gender")),
                            "classCode": cls.get("code") or "",
                            "dept": dept_key,
                            "levelName": level.get("name") or "",
                            "year": int(cy) if str(cy).isdigit() else cy,
                            "nar": norm_ar(f"{s.get('lastName', '')} {s.get('firstName', '')}"),
                            "nlat": norm_latin(
                                f"{s.get('firstNameLatin', '')} {s.get('lastNameLatin', '')}"
                            ),
                            "alreadyLinked": bool(s.get("parentFormId") or s.get("parentProfile")),
                        }
                    )
    return students


def match_all(students, subs):
    by_dob = defaultdict(list)
    for s in students:
        if s["dob"]:
            by_dob[s["dob"]].append(s)

    matches = []
    ambiguous = []
    unmatched = []

    for sub in subs:
        if sub.get("studentId"):
            continue  # already linked
        fd = sub.get("formData") or {}
        st = fd.get("student") or {}
        last = (st.get("lastName") or sub.get("studentLastName") or "").strip()
        first = (st.get("firstName") or sub.get("studentFirstName") or "").strip()
        if not last and not first:
            unmatched.append({"reason": "empty-name", "submissionId": sub["id"]})
            continue

        dob = norm_dob(st.get("dateOfBirth") or sub.get("dateOfBirth") or "")
        sex = gender_norm(st.get("sex"))
        level_text = st.get("level") or sub.get("studentLevel") or ""
        dept_hint, year_hint = parse_level_hint(level_text)

        if has_arabic(f"{last} {first}"):
            nar = norm_ar(f"{last} {first}")
            nlat = ""
        else:
            nar = ""
            nlat = norm_latin(f"{first} {last}")

        if dob and by_dob.get(dob):
            pool = by_dob[dob]
            pool_mode = "dob"
        else:
            pool = students
            pool_mode = "all"
            if dept_hint:
                narrowed = [s for s in pool if s["dept"] == dept_hint]
                if year_hint:
                    yn = [s for s in narrowed if s["year"] == year_hint]
                    if yn:
                        narrowed = yn
                if narrowed:
                    pool = narrowed

        cands = []
        for stu in pool:
            if stu["alreadyLinked"]:
                continue
            sc = name_score(nar, nlat, stu)
            if sex and stu["gender"] and sex != stu["gender"]:
                sc *= 0.65
            if dob and stu["dob"] == dob:
                sc = max(sc, 0.5) * 0.5 + 0.5
                if sc < 0.75 and name_score(nar, nlat, stu) >= 0.45:
                    sc = max(sc, 0.78)
            if dept_hint and stu["dept"] == dept_hint:
                sc = min(1.0, sc + 0.03)
            if year_hint and stu["year"] == year_hint:
                sc = min(1.0, sc + 0.03)
            if sc >= 0.58:
                cands.append((sc, stu))
        cands.sort(key=lambda x: -x[0])
        if not cands:
            unmatched.append(
                {
                    "reason": "no-candidate",
                    "submissionId": sub["id"],
                    "name": f"{last} {first}".strip(),
                    "dob": dob,
                    "level": level_text,
                }
            )
            continue

        best_sc, best = cands[0]
        second = cands[1][0] if len(cands) > 1 else 0
        gap = best_sc - second

        accept = False
        reason = ""
        if dob and best["dob"] == dob and best_sc >= 0.75 and (gap >= 0.04 or second < 0.75):
            accept, reason = True, "dob+name"
        elif pool_mode == "dob" and dob and best["dob"] == dob and best_sc >= 0.68 and gap >= 0.08:
            accept, reason = True, "dob+gap"
        elif (not dob or not best["dob"]) and best_sc >= 0.93 and gap >= 0.07:
            accept, reason = True, "name-strict"
        elif best_sc >= 0.97 and gap >= 0.05:
            accept, reason = True, "near-exact"

        row = {
            "score": round(best_sc, 3),
            "gap": round(gap, 3),
            "reason": reason or "ambiguous",
            "submissionId": sub["id"],
            "formName": f"{last} {first}".strip(),
            "formDob": dob,
            "formLevel": level_text,
            "studentId": best["id"],
            "studentName": f"{best['last']} {best['first']}".strip(),
            "studentDob": best["dob"],
            "classCode": best["classCode"],
            "dept": best["dept"],
        }
        if accept:
            matches.append(row)
        else:
            row["secondScore"] = round(second, 3)
            ambiguous.append(row)

    matches.sort(key=lambda x: -x["score"])
    used_stu = set()
    used_sub = set()
    final = []
    for row in matches:
        if row["submissionId"] in used_sub or row["studentId"] in used_stu:
            continue
        used_stu.add(row["studentId"])
        used_sub.add(row["submissionId"])
        final.append(row)
    return final, ambiguous, unmatched


def main():
    login = req("/auth/login", {"password": ADMIN_PASSWORD, "role": "admin"})
    token = login["token"]
    school = req("/school-data", token=token)
    subs = req("/parent-form", token=token)["submissions"]
    students = load_students(school)
    print(f"students={len(students)} submissions={len(subs)} apply={APPLY}")

    final, ambiguous, unmatched = match_all(students, subs)
    print(
        f"high-confidence={len(final)} ambiguous={len(ambiguous)} unmatched={len(unmatched)} "
        f"reasons={Counter(r['reason'] for r in final)}"
    )

    linked = 0
    failed = []
    if APPLY and final:
        # batch in chunks
        chunk = 40
        for i in range(0, len(final), chunk):
            pairs = [
                {"submissionId": r["submissionId"], "studentId": r["studentId"]}
                for r in final[i : i + chunk]
            ]
            res = req(
                "/parent-form/bulk-link",
                {"pairs": pairs, "fillGapsOnly": True},
                token=token,
            )
            linked += res.get("linked", 0)
            for row in res.get("results") or []:
                if not row.get("ok"):
                    failed.append(row)
            print(f"  linked chunk {i // chunk + 1}: +{res.get('linked', 0)}")

    report = {
        "apply": APPLY,
        "matched": len(final),
        "linked": linked,
        "failed": failed,
        "ambiguous": len(ambiguous),
        "unmatched": len(unmatched),
        "pairs": final,
        "ambiguousRows": ambiguous[:200],
        "unmatchedRows": unmatched[:200],
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", REPORT)
    if not APPLY:
        print("Dry run only. Re-run with --apply to write links into the database.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e, file=sys.stderr)
        sys.exit(1)
