#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import middle-school special notes from ملاحظة تلاميذ المتوسط.xlsx into students.notes."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

try:
    import openpyxl
except ImportError as e:
    raise SystemExit("pip install openpyxl") from e

ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "data" / "_middle_notes_import_report.json"
CLASS_SHEET_RE = re.compile(r"^([1-4])م([1-9])\s*$")

ALEF = re.compile(r"[أإآٱ]")
YEH = re.compile(r"[ىي]")
TEH_MARBUTA = re.compile(r"ة")
TATWEEL = re.compile(r"ـ")
DIACRITICS = re.compile(r"[\u064B-\u065F\u0670]")
NON_LETTER = re.compile(r"[^\w\u0600-\u06FF]+", re.UNICODE)


def normalize_name(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", str(s).strip())
    s = DIACRITICS.sub("", s)
    s = TATWEEL.sub("", s)
    s = ALEF.sub("ا", s)
    s = YEH.sub("ي", s)
    s = TEH_MARBUTA.sub("ه", s)
    s = s.replace("ؤ", "و").replace("ئ", "ي")
    s = s.replace("عبدال", "عبد ال").replace("بنال", "بن ال")
    s = NON_LETTER.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip().lower()


def fmt_dob(v) -> str:
    if v is None or v == "" or v == "/":
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r"^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{y:04d}-{mo:02d}-{d:02d}"
    return s


def sql_literal(s: str) -> str:
    return "'" + str(s).replace("'", "''") + "'"


def psql(sql: str) -> str:
    cmd = [
        "ssh",
        "root@72.62.42.122",
        "docker",
        "exec",
        "-i",
        "bbc-school-db-1",
        "psql",
        "-U",
        "bbc",
        "-d",
        "bbc_school",
        "-v",
        "ON_ERROR_STOP=1",
        "-t",
        "-A",
    ]
    p = subprocess.run(cmd, input=sql.encode("utf-8"), capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.decode("utf-8", errors="replace") or p.stdout.decode())
    return p.stdout.decode("utf-8", errors="replace")


def load_db_students() -> list[dict]:
    # Use JSON to avoid fragile delimiter escaping through SSH.
    raw = psql(
        """
SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text
FROM (
  SELECT s.id, c.code AS class_code, s.last_name, s.first_name, s.full_name,
         COALESCE(s.date_of_birth,'') AS dob, COALESCE(s.notes,'') AS notes
  FROM students s
  JOIN classes c ON c.id = s.class_id
  WHERE s.department_id = 'middle'
  ORDER BY c.code, s.number NULLS LAST, s.last_name, s.first_name
) t;
"""
    ).strip()
    rows = json.loads(raw or "[]")
    out = []
    for r in rows:
        last = r.get("last_name") or ""
        first = r.get("first_name") or ""
        full = r.get("full_name") or ""
        out.append(
            {
                "id": r["id"],
                "classCode": str(r.get("class_code") or "").strip().upper(),
                "lastName": last,
                "firstName": first,
                "fullName": full,
                "dob": str(r.get("dob") or "")[:10],
                "notes": r.get("notes") or "",
                "normFull": normalize_name(full or f"{last} {first}"),
                "normLast": normalize_name(last),
                "normFirst": normalize_name(first),
            }
        )
    return out


def parse_excel(path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(path, data_only=True)
    rows = []
    for sheet_name in wb.sheetnames:
        m = CLASS_SHEET_RE.match(sheet_name.strip())
        if not m:
            continue
        class_code = f"{m.group(1)}M{m.group(2)}"
        ws = wb[sheet_name]
        header_row = None
        headers = []
        for i, row in enumerate(ws.iter_rows(values_only=True), 1):
            vals = [("" if c is None else str(c).strip()) for c in row]
            if any("ملاحظة" in v for v in vals) and any("لقب" in v for v in vals):
                header_row = i
                headers = vals
                break
        if not header_row:
            continue

        def col(pred):
            for i, h in enumerate(headers):
                if pred(h):
                    return i
            return None

        i_last = col(lambda h: "لقب" in h)
        i_first = col(lambda h: h.replace(" ", "") in ("الاسم", "اسم") or h.strip() == "الاسم")
        i_dob = col(lambda h: "ميلاد" in h)
        i_note = col(lambda h: "ملاحظة" in h)
        i_num = col(lambda h: h.strip().startswith("رقم"))

        for row in ws.iter_rows(min_row=header_row + 1, values_only=True):
            last = row[i_last] if i_last is not None else None
            first = row[i_first] if i_first is not None else None
            if last is None and first is None:
                continue
            last_s = str(last or "").strip()
            first_s = str(first or "").strip()
            if not last_s and not first_s:
                continue
            # skip footer / totals
            if last_s in ("المجموع", "مجموع") or first_s in ("المجموع",):
                continue
            # Sheet footers sometimes list subjects (ل,فرنسية / علوم …)
            joined = f"{last_s} {first_s}"
            if re.search(r"ل\s*,|فرنسية|انجليزية|عربية|رياضيات|علوم|فيزيائية|طبيعية|إسلامية|تاريخ", joined):
                continue
            num = row[i_num] if i_num is not None else None
            if num is not None and not isinstance(num, (int, float)):
                ns = str(num).strip()
                if ns and not re.match(r"^\d+$", ns):
                    continue
            note = row[i_note] if i_note is not None else None
            note_s = str(note).strip() if note is not None else ""
            dob = fmt_dob(row[i_dob] if i_dob is not None else None)
            rows.append(
                {
                    "classCode": class_code,
                    "lastName": last_s,
                    "firstName": first_s,
                    "dob": dob,
                    "note": note_s,
                    "normFull": normalize_name(f"{last_s} {first_s}"),
                    "normLast": normalize_name(last_s),
                    "normFirst": normalize_name(first_s),
                    "sheet": sheet_name,
                }
            )
    return rows


def match_one(ex: dict, pool: list[dict]) -> tuple[dict | None, str]:
    same_class = [s for s in pool if s["classCode"] == ex["classCode"]]
    if not same_class:
        return None, "no_class"

    # exact full name
    hits = [s for s in same_class if s["normFull"] == ex["normFull"] and ex["normFull"]]
    if len(hits) == 1:
        return hits[0], "exact_full"
    if len(hits) > 1 and ex["dob"]:
        dob_hits = [s for s in hits if s["dob"] == ex["dob"]]
        if len(dob_hits) == 1:
            return dob_hits[0], "exact_full_dob"

    # last + first
    hits = [
        s
        for s in same_class
        if s["normLast"] == ex["normLast"] and s["normFirst"] == ex["normFirst"] and ex["normLast"]
    ]
    if len(hits) == 1:
        return hits[0], "last_first"
    if len(hits) > 1 and ex["dob"]:
        dob_hits = [s for s in hits if s["dob"] == ex["dob"]]
        if len(dob_hits) == 1:
            return dob_hits[0], "last_first_dob"

    # last name unique in class + first starts with
    hits = [s for s in same_class if s["normLast"] == ex["normLast"] and ex["normLast"]]
    if len(hits) == 1 and ex["normFirst"] and hits[0]["normFirst"].startswith(ex["normFirst"][:3]):
        return hits[0], "last_unique_prefix"
    if len(hits) > 1 and ex["normFirst"]:
        pref = [s for s in hits if s["normFirst"].startswith(ex["normFirst"][:4]) or ex["normFirst"].startswith(s["normFirst"][:4])]
        if len(pref) == 1:
            return pref[0], "last_prefix"
        if ex["dob"]:
            dob_hits = [s for s in hits if s["dob"] == ex["dob"]]
            if len(dob_hits) == 1:
                return dob_hits[0], "last_dob"

    # token containment
    ex_toks = set(ex["normFull"].split())
    if len(ex_toks) >= 2:
        scored = []
        for s in same_class:
            st = set(s["normFull"].split())
            if not st:
                continue
            inter = len(ex_toks & st)
            if inter >= 2 and (ex["normLast"] in st or s["normLast"] in ex_toks):
                scored.append((inter, s))
        scored.sort(key=lambda x: -x[0])
        if scored and (len(scored) == 1 or scored[0][0] > scored[1][0]):
            return scored[0][1], "tokens"

    return None, "unmatched"


def match_cross_class(ex: dict, pool: list[dict]) -> tuple[dict | None, str]:
    """Fallback when Excel class label differs from roster (same school year shuffle)."""
    if not ex["normFull"]:
        return None, "unmatched"
    hits = [s for s in pool if s["normFull"] == ex["normFull"]]
    if len(hits) == 1:
        return hits[0], "cross_exact_full"
    hits = [
        s
        for s in pool
        if s["normLast"] == ex["normLast"] and s["normFirst"] == ex["normFirst"] and ex["normLast"]
    ]
    if len(hits) == 1:
        return hits[0], "cross_last_first"
    # normalize hamza variants already done; try first-name soft match with same last
    hits = [s for s in pool if s["normLast"] == ex["normLast"] and ex["normLast"]]
    if len(hits) == 1:
        return hits[0], "cross_last_unique"
    if len(hits) > 1 and ex["normFirst"]:
        pref = [
            s
            for s in hits
            if s["normFirst"].startswith(ex["normFirst"][:3])
            or ex["normFirst"].startswith(s["normFirst"][:3])
        ]
        if len(pref) == 1:
            return pref[0], "cross_last_prefix"
    return None, "unmatched"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--xlsx",
        type=Path,
        default=Path("/Users/yahyaabderrahmanemahdi/Downloads/ملاحظة تلاميذ المتوسط.xlsx"),
    )
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--skip-ordinary", action="store_true", help="Skip notes that only say عادي/عادية")
    args = ap.parse_args()

    if not args.xlsx.exists():
        raise SystemExit(f"File not found: {args.xlsx}")

    excel_rows = parse_excel(args.xlsx)
    students = load_db_students()
    print(f"excel rows={len(excel_rows)} db middle students={len(students)}")

    used_ids: set[str] = set()
    matched = []
    unmatched = []
    skipped_empty = 0
    skipped_ordinary = 0

    for ex in excel_rows:
        note = ex["note"]
        if not note:
            skipped_empty += 1
            continue
        if args.skip_ordinary and re.fullmatch(r"تلميذ[ة]?\s+عاد[ية]?", note.strip()):
            skipped_ordinary += 1
            continue
        available = [s for s in students if s["id"] not in used_ids]
        hit, how = match_one(ex, available)
        if not hit:
            hit, how = match_cross_class(ex, available)
        if not hit:
            # retry allowing already-used (duplicate excel rows) — keep first note
            hit, how = match_one(ex, students)
            if hit and hit["id"] in used_ids:
                how = how + "_reuse"
        if not hit:
            unmatched.append(ex)
            continue
        if hit["id"] in used_ids and how.endswith("_reuse"):
            # Prefer non-empty / longer note already stored in matched list
            for prev in matched:
                if prev["studentId"] == hit["id"]:
                    if len(ex["note"]) > len(prev["note"]):
                        prev["note"] = ex["note"]
                        prev["match"] = how
                    break
            continue
        used_ids.add(hit["id"])
        matched.append(
            {
                **ex,
                "studentId": hit["id"],
                "match": how,
                "dbName": hit["fullName"],
                "dbClass": hit["classCode"],
            }
        )

    print(
        f"matched={len(matched)} unmatched={len(unmatched)} "
        f"empty_note={skipped_empty} ordinary_skipped={skipped_ordinary}"
    )
    by_how = {}
    for m in matched:
        by_how[m["match"]] = by_how.get(m["match"], 0) + 1
    print("match methods:", by_how)
    if unmatched[:15]:
        print("unmatched sample:")
        for u in unmatched[:15]:
            print(f"  {u['classCode']} {u['lastName']} {u['firstName']} | {u['note'][:50]}")

    report = {
        "matched": matched,
        "unmatched": unmatched,
        "stats": {
            "excel": len(excel_rows),
            "matched": len(matched),
            "unmatched": len(unmatched),
            "empty": skipped_empty,
            "ordinarySkipped": skipped_ordinary,
            "methods": by_how,
        },
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", REPORT_PATH)

    if args.dry_run:
        print("DRY RUN — no DB writes")
        return

    # Apply updates in batches
    batch = []
    updated = 0
    for m in matched:
        note = m["note"][:4000]
        batch.append(
            f"UPDATE students SET notes = {sql_literal(note)} WHERE id = {sql_literal(m['studentId'])};"
        )
        if len(batch) >= 40:
            psql("BEGIN;\n" + "\n".join(batch) + "\nCOMMIT;")
            updated += len(batch)
            print(f"  updated {updated}/{len(matched)}")
            batch = []
    if batch:
        psql("BEGIN;\n" + "\n".join(batch) + "\nCOMMIT;")
        updated += len(batch)

    count = psql(
        "SELECT COUNT(*) FROM students WHERE department_id='middle' AND BTRIM(COALESCE(notes,'')) <> '';"
    ).strip()
    print(f"DONE updates={updated} middle_students_with_notes={count}")


if __name__ == "__main__":
    main()
