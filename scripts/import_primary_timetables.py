#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import primary weekly timetables + English principal/activity from Downloads DOCX.

Posts to /api/timetable/import and updates teacher/class module links.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
import zipfile
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = Path("/Users/yahyaabderrahmanemahdi/Downloads")
API = "https://quality-education-algerie.duckdns.org/api"
ADMIN_PASSWORD = "AdminBBC2026"
APPLY = "--apply" in sys.argv
SCHOOL_YEAR = "2026-2027"
REPORT = ROOT / "reports" / "timetable_import_report.json"

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

DAY_MAP = {
    "الاحد": "sun",
    "الأحد": "sun",
    "الاثنين": "mon",
    "الإثنين": "mon",
    "الثلاثاء": "tue",
    "الاربعاء": "wed",
    "الأربعاء": "wed",
    "الخميس": "thu",
}


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


def find_doc(*needles: str) -> Path:
    for p in DOWNLOADS.iterdir():
        if p.suffix.lower() != ".docx":
            continue
        if p.name.startswith(".~"):
            continue
        name = p.name
        if all(n in name for n in needles):
            return p
    raise FileNotFoundError(f"DOCX not found for {needles}")


def norm_name(s: str) -> str:
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
    s = re.sub(r"^ا\.\s*", "", s)
    s = re.sub(r"^أ\.\s*", "", s)
    s = re.sub(r"^ا\s*\.\s*", "", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def parse_tables(path: Path) -> list[list[list[str]]]:
    z = zipfile.ZipFile(path)
    root = ET.fromstring(z.read("word/document.xml"))
    tables = []
    for tbl in root.iter(W + "tbl"):
        rows = []
        for tr in tbl.iter(W + "tr"):
            cells = []
            for tc in tr.findall(W + "tc"):
                text = "".join(t.text or "" for t in tc.iter(W + "t")).strip()
                cells.append(text)
            if any(cells):
                rows.append(cells)
        if rows:
            tables.append(rows)
    return tables


def class_id_from_code(code: str) -> str | None:
    m = re.search(r"(\d)\s*AP\s*(\d{1,2})", str(code or ""), re.I)
    if not m:
        return None
    year, num = int(m.group(1)), int(m.group(2))
    return f"P-Y{year}-C{num:02d}"


def detect_day(text: str) -> str | None:
    t = str(text or "").strip()
    for k, v in DAY_MAP.items():
        if k in t:
            return v
    return None


def detect_shift(text: str) -> str:
    t = str(text or "")
    if "مساء" in t:
        return "evening"
    if "صباح" in t:
        return "morning"
    return "morning"


def build_teacher_index(teachers: list[dict]) -> list[tuple[str, dict]]:
    out = []
    for t in teachers:
        ar = f"{t.get('firstName') or ''} {t.get('lastName') or ''}".strip()
        latin = f"{t.get('firstNameLatin') or ''} {t.get('lastNameLatin') or ''}".strip()
        for label in filter(None, [ar, latin, t.get("nameLatin"), t.get("fullName")]):
            out.append((norm_name(label), t))
        # also first-only / last-only
        if t.get("firstName"):
            out.append((norm_name(t["firstName"]), t))
        if t.get("lastName"):
            out.append((norm_name(t["lastName"]), t))
    return out


ALIASES = {
    "حجاحي": "حجاجي",
    "حجاجي": "حجاجي",
    "وناس امينه": "وناس امينة",
    "وناس امينة": "وناس امينة",
    "حداد فريال": "حداد فريال",
    "نفيسه": "نفيسة",
    "نفيسة": "نفيسة",
    "قصاد": "قصاد",
}

def match_teacher(name: str, index: list[tuple[str, dict]]) -> tuple[dict | None, float]:
    n = norm_name(name)
    if not n:
        return None, 0.0
    # strip leading أ. / ا.
    n2 = re.sub(r"^ا\.?\s*", "", n)
    candidates = {n, n2, ALIASES.get(n, n), ALIASES.get(n2, n2)}
    best, best_sc = None, 0.0
    for key, t in index:
        if not key:
            continue
        for cand in candidates:
            if key == cand or key in cand or cand in key:
                return t, 1.0
            sc = SequenceMatcher(None, key, cand).ratio()
            if sc > best_sc:
                best, best_sc = t, sc
    if best_sc >= 0.72:
        return best, best_sc
    return None, best_sc


def parse_general(path: Path):
    """Return slots + class default shifts from general timetable."""
    tables = parse_tables(path)
    slots = []
    class_shifts = []
    seen_shift = set()
    for tbl in tables:
        if len(tbl) < 4:
            continue
        # Find class-code row
        code_row_i = None
        for i, row in enumerate(tbl[:5]):
            joined = " ".join(row)
            if re.search(r"\d\s*AP\s*\d", joined, re.I):
                code_row_i = i
                break
        if code_row_i is None:
            continue
        codes = tbl[code_row_i]
        shift_row = tbl[code_row_i + 1] if code_row_i + 1 < len(tbl) else []
        # Map column -> classId / shift
        col_meta = {}
        for ci, code in enumerate(codes):
            cid = class_id_from_code(code)
            if not cid:
                continue
            shift = detect_shift(shift_row[ci] if ci < len(shift_row) else "")
            col_meta[ci] = (cid, shift)
            if cid not in seen_shift:
                class_shifts.append({"classId": cid, "defaultShift": shift})
                seen_shift.add(cid)
        for row in tbl[code_row_i + 2 :]:
            day = None
            # day often last cell
            for cell in reversed(row):
                day = detect_day(cell)
                if day:
                    break
            if not day:
                continue
            for ci, (cid, shift) in col_meta.items():
                if ci >= len(row):
                    continue
                name = row[ci].strip()
                if not name or detect_day(name) or "صباح" in name or "مساء" in name:
                    continue
                if re.search(r"\d\s*AP", name, re.I):
                    continue
                slots.append(
                    {
                        "classId": cid,
                        "teacherName": name,
                        "module": "",
                        "dayOfWeek": day,
                        "shift": shift,
                        "role": "general",
                    }
                )
    return slots, class_shifts


def parse_language_teacher_doc(path: Path, module: str, role: str):
    """Arabic/French teacher-centric grids → slots."""
    tables = parse_tables(path)
    slots = []
    i = 0
    while i < len(tables):
        tbl = tables[i]
        header = " ".join(tbl[0]) if tbl else ""
        # Teacher+class in first cell of first table of a pair
        m = re.search(r"(.+?)(\d\s*AP\s*\d{1,2}(?:\s*/\s*\d\s*AP\s*\d{1,2})*)", header, re.I)
        teacher_name = ""
        class_codes = []
        if m:
            teacher_name = m.group(1).strip()
            class_codes = re.findall(r"\d\s*AP\s*\d{1,2}", m.group(2), re.I)
        # Detail table is often next
        detail = tables[i + 1] if i + 1 < len(tables) else tbl
        # If this table itself looks like a schedule (has morning/evening headers), use it
        flat = " ".join(" ".join(r) for r in tbl)
        if "صباح" in flat or "مساء" in flat:
            detail = tbl
            # try extract teacher from previous one-row table
            if not teacher_name and i > 0:
                prev = " ".join(tables[i - 1][0]) if tables[i - 1] else ""
                m2 = re.search(
                    r"(.+?)(\d\s*AP\s*\d{1,2}(?:\s*/\s*\d\s*AP\s*\d{1,2})*)", prev, re.I
                )
                if m2:
                    teacher_name = m2.group(1).strip()
                    class_codes = re.findall(r"\d\s*AP\s*\d{1,2}", m2.group(2), re.I)
        # Identify morning/evening columns
        morning_ci = evening_ci = day_ci = None
        for ri, row in enumerate(detail[:3]):
            for ci, cell in enumerate(row):
                if "صباح" in cell:
                    morning_ci = ci
                if "مساء" in cell:
                    evening_ci = ci
                if detect_day(cell) or cell in ("اليوم", "يوم"):
                    day_ci = ci
            if morning_ci is not None or evening_ci is not None:
                start_row = ri + 1
                break
        else:
            start_row = 1
            morning_ci, evening_ci, day_ci = 1, 0, 2 if detail and len(detail[0]) > 2 else None

        for row in detail[start_row:]:
            day = None
            if day_ci is not None and day_ci < len(row):
                day = detect_day(row[day_ci])
            if not day:
                for cell in row:
                    day = detect_day(cell)
                    if day:
                        break
            if not day:
                continue
            for shift, ci in (("morning", morning_ci), ("evening", evening_ci)):
                if ci is None or ci >= len(row):
                    continue
                cell = row[ci].strip()
                if not cell:
                    continue
                codes = re.findall(r"\d\s*AP\s*\d{1,2}", cell, re.I) or class_codes
                for code in codes:
                    cid = class_id_from_code(code)
                    if not cid:
                        continue
                    slots.append(
                        {
                            "classId": cid,
                            "teacherName": teacher_name or cell,
                            "module": module,
                            "dayOfWeek": day,
                            "shift": shift,
                            "role": role,
                        }
                    )
        i += 1
    return slots


def parse_english(path: Path):
    tables = parse_tables(path)
    if not tables:
        return [], []
    rows = tables[0]
    slots = []
    module_teachers = []
    for row in rows[1:]:
        if len(row) < 4:
            continue
        day_shift, activity, principal, section = row[0], row[1], row[2], row[3]
        cid = class_id_from_code(section)
        if not cid:
            continue
        day = detect_day(day_shift) or "tue"
        shift = detect_shift(day_shift)
        slots.append(
            {
                "classId": cid,
                "teacherName": activity,
                "module": "English",
                "dayOfWeek": day,
                "shift": shift,
                "role": "english_activity",
            }
        )
        module_teachers.append(
            {
                "classId": cid,
                "module": "English",
                "role": "activity",
                "teacherName": activity,
            }
        )
        module_teachers.append(
            {
                "classId": cid,
                "module": "English",
                "role": "principal",
                "teacherName": principal,
            }
        )
    return slots, module_teachers


def resolve_slots(slots, index):
    unmatched = defaultdict(int)
    out = []
    teacher_updates = defaultdict(lambda: {"modules": set(), "classIds": set(), "names": set()})
    for s in slots:
        t, sc = match_teacher(s["teacherName"], index)
        item = {**s, "teacherId": t["id"] if t else "", "matchScore": round(sc, 3)}
        out.append(item)
        if not t:
            unmatched[s["teacherName"]] += 1
        else:
            tu = teacher_updates[t["id"]]
            if s.get("module"):
                tu["modules"].add(s["module"])
            tu["classIds"].add(s["classId"])
            tu["names"].add(s["teacherName"])
    return out, unmatched, teacher_updates


def main():
    from collections import Counter  # noqa: F401 — unused but kept for future stats

    general_path = find_doc("التوقيت", "العام")
    arabic_path = find_doc("العربية")
    french_path = find_doc("الفرنسية")
    english_path = None
    for p in DOWNLOADS.iterdir():
        if p.suffix.lower() == ".docx" and not p.name.startswith(".~") and p.stat().st_size == 116935:
            english_path = p
            break
    if not english_path:
        english_path = find_doc("إنجليز") if False else find_doc("انجليز") if False else None
    if not english_path:
        # NFC/NFD: match by size or partial
        cands = [
            p
            for p in DOWNLOADS.iterdir()
            if p.suffix.lower() == ".docx"
            and "نشاط" not in p.name
            and ("إنجليز" in p.name or "انجليز" in p.name or "نجليز" in p.name)
            and not p.name.startswith(".~")
        ]
        english_path = cands[0] if cands else None
    if not english_path:
        raise FileNotFoundError("English activities docx not found")

    print("Parsing DOCX…")
    print(" ", general_path.name)
    print(" ", arabic_path.name)
    print(" ", french_path.name)
    print(" ", english_path.name)

    gen_slots, class_shifts = parse_general(general_path)
    ar_slots = parse_language_teacher_doc(arabic_path, "Arabic", "arabic")
    fr_slots = parse_language_teacher_doc(french_path, "French", "french")
    en_slots, en_roles = parse_english(english_path)

    print(
        f"  general={len(gen_slots)} arabic={len(ar_slots)} french={len(fr_slots)} "
        f"english_activity={len(en_slots)} class_shifts={len(class_shifts)}"
    )

    login = req("/auth/login", {"password": ADMIN_PASSWORD, "role": "admin"})
    token = login["token"]
    school = req("/school-data", token=token)
    teachers = school.get("teachers") or []
    index = build_teacher_index(teachers)

    all_slots = gen_slots + ar_slots + fr_slots + en_slots
    resolved, unmatched, teacher_updates = resolve_slots(all_slots, index)

    # Resolve English module teachers
    module_teachers = []
    for row in en_roles:
        t, sc = match_teacher(row["teacherName"], index)
        module_teachers.append(
            {
                **row,
                "teacherId": t["id"] if t else "",
                "matchScore": round(sc, 3),
            }
        )
        if t:
            tu = teacher_updates[t["id"]]
            tu["modules"].add("English")
            tu["classIds"].add(row["classId"])
            tu["names"].add(row["teacherName"])

    # Also treat Arabic/French unique (class,teacher) as module teachers principal
    seen_mod = set()
    for s in resolved:
        if s["role"] in ("arabic", "french") and s.get("teacherId"):
            key = (s["classId"], s["module"], "principal")
            if key in seen_mod:
                continue
            seen_mod.add(key)
            module_teachers.append(
                {
                    "classId": s["classId"],
                    "module": s["module"],
                    "role": "principal",
                    "teacherId": s["teacherId"],
                    "teacherName": s["teacherName"],
                }
            )

    tu_list = [
        {
            "teacherId": tid,
            "modules": sorted(v["modules"]),
            "classIds": sorted(v["classIds"]),
            "matchedNames": sorted(v["names"]),
        }
        for tid, v in teacher_updates.items()
    ]

    unmatched_sorted = sorted(unmatched.items(), key=lambda x: -x[1])
    print(f"  unmatched teacher name variants: {len(unmatched_sorted)}")
    for name, n in unmatched_sorted[:25]:
        print(f"    [{n}] {name}")

    payload = {
        "schoolYear": SCHOOL_YEAR,
        "slots": [
            {
                "classId": s["classId"],
                "teacherId": s.get("teacherId") or None,
                "teacherName": s["teacherName"],
                "module": s.get("module") or "",
                "dayOfWeek": s["dayOfWeek"],
                "shift": s["shift"],
                "role": s["role"],
            }
            for s in resolved
        ],
        "moduleTeachers": module_teachers,
        "classShifts": class_shifts,
        "teacherUpdates": tu_list,
    }

    report = {
        "stats": {
            "slots": len(payload["slots"]),
            "matched_slots": sum(1 for s in resolved if s.get("teacherId")),
            "unmatched_slots": sum(1 for s in resolved if not s.get("teacherId")),
            "moduleTeachers": len(module_teachers),
            "teacherUpdates": len(tu_list),
            "classShifts": len(class_shifts),
            "applied": False,
        },
        "unmatchedNames": [{"name": n, "count": c} for n, c in unmatched_sorted],
        "teacherUpdates": tu_list,
    }

    if APPLY:
        print("Importing via API…")
        result = req("/timetable/import", payload, token=token, method="POST")
        print(" ", result)
        report["stats"]["applied"] = True
        report["apiResult"] = result
        # refresh local school data (teacher class links)
        school2 = req("/school-data", token=token)
        (ROOT / "data" / "school_data.json").write_text(
            json.dumps(school2, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (ROOT / "js" / "school-data.js").write_text(
            "window.SCHOOL_DATA = " + json.dumps(school2, ensure_ascii=False) + ";\n",
            encoding="utf-8",
        )

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Report: {REPORT}")
    if not APPLY:
        print("Dry-run only. Re-run with --apply after deploying schema/API.")


if __name__ == "__main__":
    main()
