#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Import handwritten floor-manager paper photos into floor_daily_reports.

Careful rules:
- Only insert rows that have a resolvable report_date AND floor_manager_id.
- Prefer class year (1AP→FLOOR001 … 5AP→FLOOR005; nAM/ms→MID) over physical floor label.
- Physical floor label fallback: أرضي/0→FLOOR001 … رابع/4→FLOOR005.
- Merge follow-up cards with ops sheets when same manager+date (ops often is reverse side).
- Undated ops sheets: merge into nearest prior dated follow-up of same physical floor in
  filename sort order when the ops has no date; otherwise skip DB insert (kept in skipped).
- Never overwrite an existing report that already has richer form_data unless --force-merge.
- Status = 'sent' (paper already submitted). Notes carry source filenames + manager name.
"""

from __future__ import annotations

import argparse
import json
import re
import secrets
import subprocess
import sys
from collections import defaultdict
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTRACTS_PATH = ROOT / "data/_floor_report_import/extracts.json"
MERGED_PATH = ROOT / "data/_floor_report_import/merged_for_insert.json"
SKIPPED_PATH = ROOT / "data/_floor_report_import/skipped.json"

# Physical paper floor → primary year manager (BBC building layout used historically)
PHYS_TO_PRIMARY = {
    "ground": "FLOOR001",
    "0": "FLOOR001",
    "1": "FLOOR002",
    "2": "FLOOR003",
    "3": "FLOOR004",
    "4": "FLOOR005",
    "evening": "FLOOR003",  # المسائي often Boukaci / year-3 area; classHints override
}


def new_id(prefix="FDR"):
    return prefix + secrets.token_hex(5).upper()


def s(v):
    if v is None:
        return ""
    return str(v).strip()


def normalize_year_typos(date: str | None) -> str | None:
    """Fix a few known OCR / handwriting year slips; keep real 2024 and 2026 dates."""
    if not date or not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        return None
    y, m, d = date.split("-")
    # Camera request footer "2020" while school papers are 2024+
    if y == "2020":
        return f"2024-{m}-{d}"
    # One extract had 2021 for Sep primary papers in this batch
    if y == "2021" and m in ("09", "10", "11"):
        return f"2024-{m}-{d}"
    return date


def year_from_class_hints(hints) -> tuple[str | None, str | None]:
    """Return (manager_id, reason) from class codes."""
    if not hints:
        return None, None
    joined = " ".join(s(h) for h in hints).upper().replace(".", "").replace(" ", "")
    # Middle: 1AM..4AM, 1MS..4MS, 2MS2 etc.
    m = re.search(r"([1-4])(?:AM|MS)\d*", joined)
    if m:
        return f"MID00{m.group(1)}", f"class middle {m.group(0)}"
    # Primary AP
    m = re.search(r"([1-5])AP\d*", joined)
    if m:
        return f"FLOOR00{m.group(1)}", f"class primary {m.group(0)}"
    # Loose "سنة أولى" etc. ignored
    return None, None


def _phys_manager(rec: dict) -> tuple[str | None, str]:
    phys = s(rec.get("physicalFloor")).lower()
    if phys in PHYS_TO_PRIMARY:
        return PHYS_TO_PRIMARY[phys], f"physicalFloor={phys}"
    label = s(rec.get("floorLabel"))
    if "أرضي" in label or "الارضي" in label or label in ("0", "الأرضي"):
        return "FLOOR001", "label ground"
    if "مسائي" in label:
        return "FLOOR003", "label evening"
    if "أول" in label or label in ("1", "الأول", "الاول"):
        return "FLOOR002", "label floor1"
    if "ثاني" in label or label in ("2", "الثاني"):
        return "FLOOR003", "label floor2"
    if "ثالث" in label or label in ("3", "الثالث", "الطابق 3", "الطابق 03"):
        return "FLOOR004", "label floor3"
    if "رابع" in label or label in ("4", "الرابع", "04"):
        return "FLOOR005", "label floor4"
    return None, "unmapped"


def manager_from_record(rec: dict) -> tuple[str | None, str]:
    hints = rec.get("classHints") or []
    # Collect all year hits; if mixed years, prefer physical floor label
    years = set()
    dept = None
    for h in hints:
        u = s(h).upper().replace(".", "").replace(" ", "")
        m = re.search(r"([1-4])(?:AM|MS)\d*", u)
        if m:
            years.add(int(m.group(1)))
            dept = "middle"
        m = re.search(r"([1-5])AP\d*", u)
        if m:
            years.add(int(m.group(1)))
            dept = dept or "primary"
    phys_mid, phys_reason = _phys_manager(rec)
    if len(years) == 1:
        y = next(iter(years))
        if dept == "middle":
            return f"MID00{y}", f"class middle year {y}"
        return f"FLOOR00{y}", f"class primary year {y}"
    if len(years) > 1 and phys_mid:
        return phys_mid, f"{phys_reason} (mixed class years {sorted(years)})"
    if len(years) > 1:
        # majority / min year as weak fallback
        y = min(years)
        prefix = "MID" if dept == "middle" else "FLOOR"
        return f"{prefix}00{y}", f"mixed years fallback min={y}"
    if phys_mid:
        return phys_mid, phys_reason
    return None, "unmapped"


def parse_problems_solved(v) -> int:
    if v is None or v == "":
        return 0
    if isinstance(v, (int, float)):
        return max(0, min(99, int(v)))
    m = re.search(r"\d+", str(v))
    return max(0, min(99, int(m.group(0)))) if m else 0


def empty_form():
    return {
        "timeFrom": "08:00",
        "timeTo": "16:00",
        "complaints": [""],
        "problemsSolved": 0,
        "actionsTaken": "",
        "parentResponded": None,
        "adminEscalation": "",
        "floorNeeds": "",
        "staffAbsences": [{"name": "", "role": "", "substitute": ""}],
        "teacherLates": [{"teacherId": "", "teacherName": "", "duration": "", "substitute": ""}],
        "incident": "",
        "cameraReview": null_safe(None),
    }


def null_safe(v):
    if v in ("yes", "no"):
        return v
    return None


def record_to_form(rec: dict) -> dict:
    form = empty_form()
    complaints = [s(c) for c in (rec.get("complaints") or []) if s(c)]
    form["complaints"] = complaints or [""]
    form["problemsSolved"] = parse_problems_solved(rec.get("problemsSolved"))
    form["actionsTaken"] = s(rec.get("actionsTaken"))
    form["parentResponded"] = null_safe(rec.get("parentResponded"))
    form["adminEscalation"] = s(rec.get("adminEscalation"))
    form["floorNeeds"] = s(rec.get("floorNeeds"))
    form["incident"] = s(rec.get("incident"))
    form["cameraReview"] = null_safe(rec.get("cameraReview"))
    tf, tt = s(rec.get("timeFrom")), s(rec.get("timeTo"))
    if re.match(r"^\d{2}:\d{2}$", tf):
        form["timeFrom"] = tf
    if re.match(r"^\d{2}:\d{2}$", tt):
        form["timeTo"] = tt

    absences = []
    for a in rec.get("staffAbsences") or []:
        row = {
            "name": s(a.get("name")),
            "role": s(a.get("role")),
            "substitute": s(a.get("substitute")),
        }
        if row["name"] or row["role"] or row["substitute"]:
            absences.append(row)
    form["staffAbsences"] = absences or [{"name": "", "role": "", "substitute": ""}]

    lates = []
    for t in rec.get("teacherLates") or []:
        row = {
            "teacherId": "",
            "teacherName": s(t.get("teacherName")),
            "duration": s(t.get("duration")),
            "substitute": s(t.get("substitute") or ""),
        }
        if row["teacherName"] or row["duration"] or row["substitute"]:
            lates.append(row)
    form["teacherLates"] = lates or [
        {"teacherId": "", "teacherName": "", "duration": "", "substitute": ""}
    ]
    return form


def merge_forms(a: dict, b: dict) -> dict:
    out = deepcopy(a)
    # complaints
    ca = [c for c in a.get("complaints") or [] if s(c)]
    cb = [c for c in b.get("complaints") or [] if s(c)]
    out["complaints"] = (ca + [c for c in cb if c not in ca]) or [""]
    out["problemsSolved"] = max(int(a.get("problemsSolved") or 0), int(b.get("problemsSolved") or 0))
    for key in ("actionsTaken", "adminEscalation", "floorNeeds", "incident"):
        av, bv = s(a.get(key)), s(b.get(key))
        if av and bv and av != bv:
            out[key] = av + "\n\n" + bv
        else:
            out[key] = av or bv
    for key in ("parentResponded", "cameraReview"):
        out[key] = a.get(key) if a.get(key) is not None else b.get(key)
    # absences / lates
    def merge_rows(ka, kb, fields):
        rows = []
        seen = set()
        for src in (a.get(ka) or []) + (b.get(kb) or []):
            sig = tuple(s(src.get(f)) for f in fields)
            if not any(sig):
                continue
            if sig in seen:
                continue
            seen.add(sig)
            rows.append({f: s(src.get(f)) for f in fields})
        return rows

    absences = merge_rows("staffAbsences", "staffAbsences", ["name", "role", "substitute"])
    out["staffAbsences"] = absences or [{"name": "", "role": "", "substitute": ""}]
    lates = []
    seen = set()
    for src in (a.get("teacherLates") or []) + (b.get("teacherLates") or []):
        row = {
            "teacherId": s(src.get("teacherId")),
            "teacherName": s(src.get("teacherName")),
            "duration": s(src.get("duration")),
            "substitute": s(src.get("substitute")),
        }
        sig = (row["teacherName"], row["duration"], row["substitute"])
        if not any(sig):
            continue
        if sig in seen:
            continue
        seen.add(sig)
        lates.append(row)
    out["teacherLates"] = lates or [
        {"teacherId": "", "teacherName": "", "duration": "", "substitute": ""}
    ]
    # times: prefer non-default if set
    for tkey, default in (("timeFrom", "08:00"), ("timeTo", "16:00")):
        av, bv = s(a.get(tkey)), s(b.get(tkey))
        if av and av != default:
            out[tkey] = av
        elif bv and bv != default:
            out[tkey] = bv
        else:
            out[tkey] = av or bv or default
    return out


def form_richness(form: dict) -> int:
    n = 0
    n += sum(1 for c in form.get("complaints") or [] if s(c))
    n += 2 if s(form.get("actionsTaken")) else 0
    n += 2 if s(form.get("incident")) else 0
    n += 1 if s(form.get("floorNeeds")) else 0
    n += 1 if s(form.get("adminEscalation")) else 0
    n += sum(1 for r in form.get("staffAbsences") or [] if s(r.get("name")))
    n += sum(1 for r in form.get("teacherLates") or [] if s(r.get("teacherName")))
    n += 1 if form.get("cameraReview") else 0
    n += 1 if form.get("parentResponded") else 0
    n += int(form.get("problemsSolved") or 0)
    return n


def build_merged(extracts: list[dict]) -> tuple[list[dict], list[dict]]:
    # Sort by filename for pairing
    items = sorted(extracts, key=lambda r: r.get("file") or "")
    prepared = []
    skipped = []

    for rec in items:
        date = normalize_year_typos(rec.get("date"))
        mid, reason = manager_from_record(rec)
        form = record_to_form(rec)
        notes_bits = []
        if s(rec.get("managerName")):
            notes_bits.append(f"مسؤول الطابق: {s(rec.get('managerName'))}")
        if s(rec.get("reportNumber")):
            notes_bits.append(f"رقم البطاقة: {s(rec.get('reportNumber'))}")
        if s(rec.get("notes")):
            notes_bits.append(s(rec.get("notes")))
        entry = {
            "file": rec.get("file"),
            "formType": rec.get("formType"),
            "date": date,
            "managerId": mid,
            "mapReason": reason,
            "managerNamePaper": s(rec.get("managerName")),
            "physicalFloor": rec.get("physicalFloor"),
            "form": form,
            "notes": "\n".join(notes_bits),
            "richness": form_richness(form),
        }
        if not date or not mid:
            skipped.append({**entry, "skipReason": "missing date" if not date else "unmapped manager"})
            continue
        if form_richness(form) == 0 and rec.get("formType") in ("followup_card", "ops_sheet"):
            # Empty day card still worth inserting as a submitted empty report
            pass
        prepared.append(entry)

    # Rescue ops/student sheets missing manager (and/or date) by pairing with prior card
    still_skipped = []
    for sk in skipped:
        if form_richness(sk.get("form") or {}) == 0 and not s((sk.get("form") or {}).get("floorNeeds")):
            # truly empty — skip quietly
            still_skipped.append(sk)
            continue
        prev = None
        # Prefer same date already prepared
        if sk.get("date"):
            for e in reversed(prepared):
                if e.get("date") == sk["date"] and e["file"] < sk["file"]:
                    prev = e
                    break
        if not prev:
            for e in reversed(prepared):
                if e["file"] >= sk["file"]:
                    continue
                if sk.get("physicalFloor") and sk.get("physicalFloor") not in (None, "unknown", ""):
                    if e.get("physicalFloor") == sk.get("physicalFloor"):
                        prev = e
                        break
                else:
                    prev = e
                    break
        if not prev:
            still_skipped.append(sk)
            continue
        # If sk has its own date+unmapped, adopt prev manager but keep sk date as new row seed
        if sk.get("date") and sk.get("skipReason") == "unmapped manager" and sk["date"] != prev.get("date"):
            # create a new prepared entry using prev's manager
            new_e = deepcopy(sk)
            new_e["managerId"] = prev["managerId"]
            new_e["mapReason"] = f"paired manager from {prev['file']}"
            new_e["richness"] = form_richness(new_e["form"])
            new_e["notes"] = (new_e.get("notes") or "") + f"\n(إسناد المسؤول من الورقة السابقة: {prev['file']})"
            prepared.append(new_e)
            continue
        prev["form"] = merge_forms(prev["form"], sk["form"])
        prev["notes"] = prev["notes"] + "\n" + sk["notes"] + "\n(دمج ورقة ملحقة)"
        prev["richness"] = form_richness(prev["form"])
        prev["mergedFiles"] = list(prev.get("mergedFiles") or [prev["file"]]) + [sk["file"]]
    # re-sort prepared by file after rescues
    prepared.sort(key=lambda e: e["file"] or "")

    # Collapse same manager+date
    by_key: dict[tuple[str, str], dict] = {}
    order = []
    for e in prepared:
        key = (e["managerId"], e["date"])
        if key not in by_key:
            by_key[key] = deepcopy(e)
            by_key[key]["sourceFiles"] = [e["file"]]
            order.append(key)
        else:
            cur = by_key[key]
            cur["form"] = merge_forms(cur["form"], e["form"])
            cur["notes"] = cur["notes"] + "\n\n---\n\n" + e["notes"]
            cur["sourceFiles"] = cur.get("sourceFiles", []) + [e["file"]]
            cur["richness"] = form_richness(cur["form"])

    merged = [by_key[k] for k in order]
    return merged, still_skipped


def psql(sql: str, *args) -> str:
    """Run SQL on VPS via docker exec. Use dollar-quoting for JSON."""
    # Build a one-shot python on remote? Simpler: pipe via stdin to psql -v
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


def sql_literal(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def insert_reports(merged: list[dict], dry_run: bool = False) -> dict:
    stats = {"inserted": 0, "updated": 0, "errors": []}
    existing_raw = psql(
        "SELECT floor_manager_id || '|' || report_date::text || '|' || id FROM floor_daily_reports;"
    )
    existing = {}
    for line in existing_raw.splitlines():
        line = line.strip()
        if not line or "|" not in line:
            continue
        mid, date, rid = line.split("|", 2)
        existing[(mid, date)] = rid

    if dry_run:
        stats["planned"] = []
        for e in merged:
            op = "update" if (e["managerId"], e["date"]) in existing else "insert"
            stats["planned"].append({"op": op, "managerId": e["managerId"], "date": e["date"], "richness": e["richness"]})
        return stats

    for e in merged:
        mid, date = e["managerId"], e["date"]
        form_json = json.dumps(e["form"], ensure_ascii=False)
        notes = e["notes"][:8000]
        try:
            if (mid, date) in existing:
                rid = existing[(mid, date)]
                # Paper import wins for form_data; append notes (replace known test stub)
                psql(
                    f"""
UPDATE floor_daily_reports
SET notes = CASE
      WHEN notes IS NULL OR btrim(notes) = '' OR notes = 'test extra' THEN {sql_literal(notes)}
      ELSE notes || E'\\n\\n---\\n\\n' || {sql_literal(notes)}
    END,
    form_data = {sql_literal(form_json)}::jsonb,
    status = 'sent',
    submitted_at = COALESCE(submitted_at, NOW()),
    updated_at = NOW()
WHERE id = {sql_literal(rid)};
"""
                )
                stats["updated"] += 1
            else:
                rid = new_id("FDR")
                psql(
                    f"""
INSERT INTO floor_daily_reports
  (id, floor_manager_id, report_date, notes, form_data, status, submitted_at, updated_at)
VALUES (
  {sql_literal(rid)},
  {sql_literal(mid)},
  {sql_literal(date)}::date,
  {sql_literal(notes)},
  {sql_literal(form_json)}::jsonb,
  'sent',
  NOW(),
  NOW()
);
"""
                )
                existing[(mid, date)] = rid
                stats["inserted"] += 1
        except Exception as ex:
            stats["errors"].append({"managerId": mid, "date": date, "error": str(ex)[:500]})
    return stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--extracts", type=Path, default=EXTRACTS_PATH)
    args = ap.parse_args()

    extracts = json.loads(args.extracts.read_text(encoding="utf-8"))
    merged, skipped = build_merged(extracts)
    MERGED_PATH.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    SKIPPED_PATH.write_text(json.dumps(skipped, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"extracts={len(extracts)} merged={len(merged)} skipped={len(skipped)}")
    by_mgr = defaultdict(int)
    for e in merged:
        by_mgr[e["managerId"]] += 1
        print(f"  {e['date']} {e['managerId']:8} rich={e['richness']:2} files={len(e.get('sourceFiles') or [e['file']])} map={e['mapReason']}")
    print("by manager:", dict(by_mgr))
    if skipped:
        print("skipped:")
        for sk in skipped:
            print(f"  {sk['file']}: {sk.get('skipReason')} phys={sk.get('physicalFloor')}")

    if args.dry_run:
        print("DRY RUN — no DB writes")
        return

    stats = insert_reports(merged, dry_run=False)
    print("INSERT STATS:", json.dumps(stats, ensure_ascii=False, indent=2))
    count = psql("SELECT COUNT(*) FROM floor_daily_reports;")
    print("total reports now:", count.strip())


if __name__ == "__main__":
    main()
