#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Import Préscolaire students, teachers, and timetable from Word docs into the live API.

  .venv/bin/python scripts/import_preschool_docx.py
  .venv/bin/python scripts/import_preschool_docx.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import re
import ssl
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

API = "https://quality-education-algerie.duckdns.org/api"
ADMIN_PASSWORD = "AdminBBC2026"
DOWNLOADS = Path("/Users/yahyaabderrahmanemahdi/Downloads")
STUDENTS_DOC = DOWNLOADS / "التحضيري.docx"
TEACHERS_DOC = DOWNLOADS / "قائمة الاساتذة.docx"
TIMETABLE_DOC = DOWNLOADS / "جدول التوقيت التحضيري.docx"

CTX = ssl.create_default_context()
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

CLASS_IDS = {
    "GSA": "CL-GSA",
    "GSB": "CL-GSB",
    "GSC": "CL-GSC",
    "GSD": "CL-GSD",
    "GSE": "CL-GSE",
    "GSF": "CL-GSF",
}

DAY_MAP = {
    "الأحد": "sun",
    "الاحد": "sun",
    "الإثنين": "mon",
    "الاثنين": "mon",
    "الثلاثاء": "tue",
    "الأربعاء": "wed",
    "الاربعاء": "wed",
    "الخميس": "thu",
}


def req(path, data=None, token=None, method=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None
    if data is not None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        method = method or "POST"
    else:
        method = method or "GET"
    r = urllib.request.Request(API + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=120, context=CTX) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {e.code}: {err}") from e


def docx_paras(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    paras = []
    for p in root.iter(f"{W}p"):
        texts = [t.text or "" for t in p.iter(f"{W}t")]
        line = "".join(texts).strip()
        if line:
            paras.append(line)
    return paras


def normalize_gs(label: str) -> str | None:
    s = re.sub(r"\s+", "", label.upper())
    m = re.match(r"GS([A-F])", s)
    if m:
        return f"GS{m.group(1)}"
    return None


def parse_students(paras: list[str]) -> dict[str, list[dict]]:
    """Return {GSA: [{fullName, dob}, ...], ...}"""
    by_class: dict[str, list[dict]] = {k: [] for k in CLASS_IDS}
    cur = None
    i = 0
    while i < len(paras):
        line = paras[i]
        gs = normalize_gs(line)
        if gs:
            cur = gs
            i += 1
            continue
        if line.startswith("قائمة") or line in ("تاريخ الميلاد", "الاسم و اللقب", "الرقم") or line.startswith("اللغة"):
            i += 1
            continue
        if not cur:
            i += 1
            continue
        # Pattern often: DOB then name (or name then DOB). Skip pure numbers (roster #).
        if re.fullmatch(r"\d{1,3}", line):
            i += 1
            continue
        dob_like = bool(
            re.search(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", line)
            or re.search(r"\d{1,2}\s+\S+\s+\d{4}", line)
        )
        if dob_like:
            dob = line
            name = ""
            if i + 1 < len(paras) and not normalize_gs(paras[i + 1]) and not paras[i + 1].startswith("قائمة"):
                nxt = paras[i + 1]
                if not re.fullmatch(r"\d{1,3}", nxt) and not (
                    re.search(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", nxt)
                ):
                    name = nxt
                    i += 2
                else:
                    i += 1
            else:
                i += 1
            if name:
                by_class[cur].append({"fullName": name, "dob": dob})
            continue
        # Name without preceding date on same iteration — peek next for date
        if i + 1 < len(paras):
            nxt = paras[i + 1]
            if re.search(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", nxt) or re.search(
                r"\d{1,2}\s+\S+\s+\d{4}", nxt
            ):
                by_class[cur].append({"fullName": line, "dob": nxt})
                i += 2
                continue
        # Orphan name (e.g. ناجي أسماء without DOB in extract)
        if any("\u0600" <= c <= "\u06FF" for c in line) and len(line) > 2:
            by_class[cur].append({"fullName": line, "dob": ""})
        i += 1
    return by_class


def parse_teachers(paras: list[str]) -> list[dict]:
    # Skip header tokens
    skip = {"رقم الهاتف", "الصفة", "الاسم و اللقب", "الرقم", "قائمة الأساتذة", "قائمة الاساتذة"}
    rows = [p for p in paras if p not in skip]
    teachers = []
    # Often interleaved: phone, role, name OR name, phone, role depending on column order
    # From earlier extract: phone, role, name repeating after headers... actually:
    # ['رقم الهاتف','الصفة','الاسم'] then ['الرقم', phone, role] then [name, phone, role]...
    # Clean approach: find lines that look like phones and pair with nearby Arabic name + role
    i = 0
    while i < len(rows):
        chunk = rows[i : i + 3]
        if len(chunk) < 2:
            break
        phone = ""
        role = ""
        name = ""
        for part in chunk:
            if re.search(r"\d{2}[.\s]?\d", part) and sum(c.isdigit() for c in part) >= 8:
                phone = part
            elif "أستاذ" in part or "استاذ" in part:
                role = part
            elif any("\u0600" <= c <= "\u06FF" for c in part):
                name = part
        if name and (phone or role):
            modules = []
            depts = ["preschool"]
            if "انجليز" in role or "إنجليز" in role:
                modules = ["English"]
            elif "عرب" in role:
                modules = ["Arabic"]
            teachers.append(
                {
                    "fullName": name,
                    "phone": phone.replace(" ", "").replace("..", "."),
                    "role": role,
                    "modules": modules,
                    "departments": depts,
                }
            )
            i += 3
        else:
            i += 1
    # Dedup by name
    seen = set()
    out = []
    for t in teachers:
        key = t["fullName"]
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
    return out


def split_name(full: str) -> tuple[str, str]:
    parts = full.split()
    if len(parts) <= 1:
        return full, ""
    return parts[-1], " ".join(parts[:-1])  # last as lastName? Arabic often family first
    # Better: keep fullName; first/last split loosely
    # Use: firstName = first token, lastName = rest


def split_name_ar(full: str) -> tuple[str, str]:
    parts = [p for p in full.split() if p]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--api", default=None)
    args = ap.parse_args()
    api = args.api or API

    students_by = parse_students(docx_paras(STUDENTS_DOC))
    teachers = parse_teachers(docx_paras(TEACHERS_DOC))
    print("Students by class:")
    for k, v in students_by.items():
        print(f"  {k}: {len(v)}")
    print(f"Teachers: {len(teachers)}")
    for t in teachers:
        print(f"  - {t['fullName']} | {t['role']} | {t['phone']}")

    if args.dry_run:
        print("DRY RUN — no writes")
        return

    def call(path, data=None, token=None, method=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        body = None
        if data is not None:
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            method = method or "POST"
        else:
            method = method or "GET"
        r = urllib.request.Request(api + path, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(r, timeout=120, context=CTX) as res:
                return json.loads(res.read().decode())
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", "replace")
            raise RuntimeError(f"HTTP {e.code}: {err}") from e

    login = call("/auth/login", {"password": ADMIN_PASSWORD})
    token = login["token"]
    print("Logged in as", login.get("role"))

    school = call("/school-data", token=token)
    preschool = school.get("preschool") or {}
    class_by_code = {}
    for lvl in preschool.get("levels") or []:
        for c in lvl.get("classes") or []:
            class_by_code[(c.get("code") or "").upper()] = c

    created = 0
    for code, rows in students_by.items():
        cls = class_by_code.get(code)
        if not cls:
            print("MISSING CLASS", code, "— available:", list(class_by_code))
            continue
        existing_names = {
            (s.get("fullName") or "").strip() for s in (cls.get("students") or [])
        }
        for n, row in enumerate(rows, 1):
            full = row["fullName"].strip()
            if full in existing_names:
                continue
            first, last = split_name_ar(full)
            payload = {
                "classId": cls["id"],
                "departmentId": "preschool",
                "number": n,
                "firstName": first,
                "lastName": last,
                "fullName": full,
                "dateOfBirth": row.get("dob") or "",
                "searchName": full,
            }
            try:
                call("/students", payload, token=token)
                created += 1
                print(f"  + {code} {full}")
            except Exception as e:
                print(f"  FAIL {code} {full}: {e}")

    t_created = 0
    existing_teachers = {(t.get("firstName") or "") + "|" + (t.get("lastName") or "") for t in school.get("teachers") or []}
    for t in teachers:
        first, last = split_name_ar(t["fullName"])
        key = f"{first}|{last}"
        if key in existing_teachers:
            continue
        payload = {
            "firstName": first,
            "lastName": last,
            "nameLatin": "",
            "phone": t["phone"],
            "modules": t["modules"],
            "departments": ["preschool"],
            "classIds": [],
            "wilaya": "",
            "commune": "",
        }
        try:
            call("/teachers", payload, token=token)
            t_created += 1
            print(f"  + teacher {t['fullName']}")
        except Exception as e:
            print(f"  FAIL teacher {t['fullName']}: {e}")

    print(f"Done students_created={created} teachers_created={t_created}")


if __name__ == "__main__":
    main()
