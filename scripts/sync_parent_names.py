#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prefer parent-submitted student names when confidently matching linked forms.

Writes uncertain cases to reports/uncertain_parent_names.json for review.
Apply high-confidence name updates with --apply.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://quality-education-algerie.duckdns.org/api"
ADMIN_PASSWORD = "AdminBBC2026"
APPLY = "--apply" in sys.argv
REPORT = ROOT / "reports" / "uncertain_parent_names.json"
APPLY_REPORT = ROOT / "reports" / "parent_name_sync_report.json"


def req(path, data=None, token=None, method=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    m = method or ("POST" if body is not None else "GET")
    request = urllib.request.Request(API + path, data=body, headers=headers, method=m)
    try:
        with urllib.request.urlopen(request, timeout=180) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {e.code}: {err}") from e


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", str(s or "").strip())
    s = re.sub(r"[\u064B-\u065F\u0670]", "", s)
    s = s.replace("ـ", "")
    for a, b in {
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ٱ": "ا",
        "ى": "ي",
        "ة": "ه",
        "ؤ": "و",
        "ئ": "ي",
        "ء": "",
    }.items():
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip().lower()


def main():
    login = req("/auth/login", {"password": ADMIN_PASSWORD, "role": "admin"})
    token = login["token"]
    school = req("/school-data", token=token)
    pf = req("/parent-form", token=token)
    subs = [s for s in (pf.get("submissions") or []) if s.get("studentId")]

    students = {}
    for dept_key in ("primary", "middle"):
        for lev in school[dept_key]["levels"]:
            for cls in lev["classes"]:
                for st in cls["students"]:
                    students[st["id"]] = {**st, "classId": cls["id"], "dept": dept_key}

    apply_rows = []
    uncertain = []
    identical = 0

    for sub in subs:
        sid = sub["studentId"]
        st = students.get(sid)
        if not st:
            continue
        fd = sub.get("formData") or {}
        stu = fd.get("student") or {}
        pf_last = str(stu.get("lastName") or sub.get("studentLastName") or "").strip()
        pf_first = str(stu.get("firstName") or sub.get("studentFirstName") or "").strip()
        pf_full = f"{pf_last} {pf_first}".strip()
        site_full = str(st.get("fullName") or "").strip()
        if not pf_full or not site_full:
            continue
        if norm(pf_full) == norm(site_full):
            # Prefer parent spelling if only diacritics / alef variants differ in display
            if pf_full != site_full and SequenceMatcher(None, norm(pf_full), norm(site_full)).ratio() == 1.0:
                # reject odd diacritics / tatweel on parent side
                if "ً" in pf_full or "ٌ" in pf_full or "ٍ" in pf_full or "ـ" in pf_full:
                    uncertain.append(
                        {
                            "studentId": sid,
                            "submissionId": sub["id"],
                            "from": site_full,
                            "to": pf_full,
                            "reason": "uncertain-parent-odd-marks",
                            "score": 1.0,
                        }
                    )
                elif abs(len(pf_full) - len(site_full)) <= 2:
                    apply_rows.append(
                        {
                            "studentId": sid,
                            "submissionId": sub["id"],
                            "from": site_full,
                            "to": pf_full,
                            "lastName": pf_last,
                            "firstName": pf_first,
                            "reason": "same-normalized-prefer-parent",
                            "score": 1.0,
                        }
                    )
                else:
                    identical += 1
            else:
                identical += 1
            continue

        sc = SequenceMatcher(None, norm(pf_full), norm(site_full)).ratio()
        compact = SequenceMatcher(
            None, norm(pf_full).replace(" ", ""), norm(site_full).replace(" ", "")
        ).ratio()
        sc = max(sc, compact)
        row = {
            "studentId": sid,
            "submissionId": sub["id"],
            "from": site_full,
            "to": pf_full,
            "lastName": pf_last,
            "firstName": pf_first,
            "classId": st.get("classId"),
            "score": round(sc, 3),
        }

        # Reject parent names that look like typos vs school roster
        def looks_worse(a: str, b: str) -> bool:
            # a=site, b=parent — reject if parent introduces odd marks or drops letters badly
            if "ً" in b or "ٌ" in b or "ٍ" in b:
                return True
            if re.search(r"\s{2,}", b):
                return True
            an, bn = norm(a).replace(" ", ""), norm(b).replace(" ", "")
            # parent much shorter without being a known particle fold
            if len(bn) + 2 < len(an) and sc < 0.95:
                return True
            # single-char token corruption in middle of name (جواق/جوتق)
            if sc < 0.92 and abs(len(an) - len(bn)) <= 1:
                # count differing positions in compact forms
                diffs = sum(1 for x, y in zip(an, bn) if x != y) + abs(len(an) - len(bn))
                if diffs == 1 and len(an) >= 6:
                    # likely OCR/typo either way — prefer school roster
                    return True
            return False

        if looks_worse(site_full, pf_full):
            row["reason"] = "uncertain-parent-looks-worse"
            uncertain.append(row)
            continue

        # High confidence: hamza/alef/taa marbuta/spacing variants or mild spelling
        if sc >= 0.90 or (sc >= 0.86 and abs(len(norm(pf_full)) - len(norm(site_full))) <= 2):
            row["reason"] = "high-confidence"
            apply_rows.append(row)
        elif sc >= 0.72:
            row["reason"] = "uncertain-review"
            uncertain.append(row)
        else:
            row["reason"] = "conflict-low"
            uncertain.append(row)

    print(
        f"linked={len(subs)} identical={identical} "
        f"apply_candidates={len(apply_rows)} uncertain={len(uncertain)}"
    )
    for r in apply_rows[:30]:
        print(f"  APPLY [{r['score']}/{r['reason']}] {r['from']!r} → {r['to']!r}")
    if len(apply_rows) > 30:
        print(f"  … +{len(apply_rows) - 30}")
    print(f"Uncertain ({len(uncertain)}) — see report")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps({"uncertain": uncertain, "count": len(uncertain)}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    applied = 0
    errors = 0
    if APPLY and apply_rows:
        for r in apply_rows:
            try:
                req(
                    "/parent-form/link",
                    {
                        "submissionId": r["submissionId"],
                        "studentId": r["studentId"],
                        "fillGapsOnly": True,
                        "updateNames": True,
                    },
                    token=token,
                    method="POST",
                )
                applied += 1
            except Exception as e:
                errors += 1
                print(f"  FAIL {r['studentId']}: {e}")
        school2 = req("/school-data", token=token)
        (ROOT / "data" / "school_data.json").write_text(
            json.dumps(school2, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (ROOT / "js" / "school-data.js").write_text(
            "window.SCHOOL_DATA = " + json.dumps(school2, ensure_ascii=False) + ";\n",
            encoding="utf-8",
        )

    APPLY_REPORT.write_text(
        json.dumps(
            {
                "identical": identical,
                "apply_candidates": apply_rows,
                "uncertain_count": len(uncertain),
                "applied": applied,
                "errors": errors,
                "didApply": APPLY,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Wrote {REPORT}")
    print(f"Wrote {APPLY_REPORT}")
    if not APPLY:
        print("Dry-run. Re-run with --apply to update names (needs deployed updateNames API).")


if __name__ == "__main__":
    main()
