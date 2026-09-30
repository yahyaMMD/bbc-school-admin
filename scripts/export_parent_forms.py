#!/usr/bin/env python3
"""Export all parent-form submissions to a full Excel workbook."""
from __future__ import annotations

import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

API = "https://quality-education-algerie.duckdns.org/api"
OUT = Path(__file__).resolve().parents[1] / "reports" / "parent_form_submissions.xlsx"
ADMIN_PASSWORD = "AdminBBC2026"

# Flattened columns: (header, getter)
COLUMNS = [
    ("#", None),
    ("ID", lambda r: r.get("id")),
    ("Status", lambda r: r.get("status")),
    ("Submitted at", lambda r: r.get("createdAt")),
    ("Form version", lambda r: r.get("formVersion")),
    ("Student last name", lambda r: g(r, "student", "lastName") or r.get("studentLastName")),
    ("Student first name", lambda r: g(r, "student", "firstName") or r.get("studentFirstName")),
    ("Sex", lambda r: g(r, "student", "sex")),
    ("Date of birth", lambda r: g(r, "student", "dateOfBirth") or r.get("dateOfBirth")),
    ("Place of birth", lambda r: g(r, "student", "placeOfBirth")),
    ("Nationality", lambda r: g(r, "student", "nationality")),
    ("Enrollment year", lambda r: g(r, "student", "enrollmentYear") or r.get("enrollmentYear")),
    ("Level", lambda r: g(r, "student", "level") or r.get("studentLevel")),
    ("Repeated year", lambda r: g(r, "student", "repeatedYear") or r.get("repeatedYear")),
    ("Studied abroad", lambda r: g(r, "student", "studiedAbroad") or r.get("studiedAbroad")),
    ("Father name", lambda r: g(r, "father", "name")),
    ("Father profession", lambda r: g(r, "father", "profession")),
    ("Father nationality", lambda r: g(r, "father", "nationality")),
    ("Father phone", lambda r: g(r, "father", "phone") or r.get("phonePrimary")),
    ("Mother name", lambda r: g(r, "mother", "name")),
    ("Mother profession", lambda r: g(r, "mother", "profession")),
    ("Mother nationality", lambda r: g(r, "mother", "nationality")),
    ("Mother phone", lambda r: g(r, "mother", "phone") or r.get("phoneSecondary")),
    ("Phone backup", lambda r: g(r, "contact", "phoneBackup") or r.get("phoneBackup")),
    ("Home address", lambda r: g(r, "contact", "address") or r.get("homeAddress")),
    ("Email", lambda r: g(r, "contact", "email") or r.get("email")),
    ("Parents status", lambda r: g(r, "family", "parentsStatus")),
    ("Custody", lambda r: g(r, "family", "custody")),
    ("Has stepfather", lambda r: g(r, "family", "hasStepFather")),
    ("Has stepmother", lambda r: g(r, "family", "hasStepMother")),
    ("Father deceased", lambda r: g(r, "family", "fatherDeceased")),
    ("Mother deceased", lambda r: g(r, "family", "motherDeceased")),
    ("Siblings count", lambda r: g(r, "family", "siblingsCount")),
    ("Brothers count", lambda r: g(r, "family", "brothersCount")),
    ("Sisters count", lambda r: g(r, "family", "sistersCount")),
    ("Sibling rank", lambda r: g(r, "family", "siblingRank")),
    ("Has half siblings", lambda r: g(r, "family", "hasHalfSiblings")),
    ("Tutor name/role", lambda r: g(r, "family", "tutorNameRole")),
    ("Tutor phone", lambda r: g(r, "family", "tutorPhone")),
    ("Adopted", lambda r: g(r, "family", "adopted")),
    ("Adopted explain", lambda r: g(r, "family", "adoptedExplain")),
    ("Blood type", lambda r: g(r, "medical", "bloodType")),
    ("Disability", lambda r: g(r, "medical", "disability")),
    ("Disability explain", lambda r: g(r, "medical", "disabilityExplain")),
    ("Vaccinations", lambda r: g(r, "medical", "vaccinations")),
    ("Hereditary", lambda r: g(r, "medical", "hereditary")),
    ("Hereditary origin", lambda r: g(r, "medical", "hereditaryOrigin")),
    ("Hereditary explain", lambda r: g(r, "medical", "hereditaryExplain")),
    ("Acute past", lambda r: g(r, "medical", "acutePast")),
    ("Organic current", lambda r: g(r, "medical", "organicCurrent")),
    ("Allergy", lambda r: g(r, "medical", "allergy")),
    ("Glasses", lambda r: g(r, "medical", "glasses")),
    ("Behavior", lambda r: g(r, "medical", "behavior")),
    ("Learning difficulty", lambda r: g(r, "medical", "learningDifficulty")),
    ("Treatment", lambda r: g(r, "medical", "treatment")),
    ("Psychologist", lambda r: g(r, "medical", "psychologist")),
    ("Incident", lambda r: g(r, "medical", "incident")),
    ("Medical other", lambda r: g(r, "medical", "other")),
    ("Departure mode", lambda r: g(r, "consents", "departureMode")),
    ("Companion role", lambda r: g(r, "consents", "companionRole")),
    ("Companion name", lambda r: g(r, "consents", "companionName")),
    ("Companion phone", lambda r: g(r, "consents", "companionPhone")),
    ("Driver name", lambda r: g(r, "consents", "driverName")),
    ("Driver phone", lambda r: g(r, "consents", "driverPhone")),
    ("Has companion ID", lambda r: "yes" if r.get("hasCompanionId") else "no"),
    ("Companion ID filename", lambda r: g(r, "consents", "companionIdName") or r.get("companionIdName")),
    ("Outings consent", lambda r: g(r, "consents", "outings")),
    ("Sports consent", lambda r: g(r, "consents", "sports")),
    ("Photo/media consent", lambda r: g(r, "consents", "photoMedia") or r.get("photoMedia")),
]


def g(row, section, key):
    fd = row.get("formData") or {}
    return (fd.get(section) or {}).get(key) or ""


def req(path, data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    method = "POST" if body is not None else "GET"
    request = urllib.request.Request(API + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=180) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {e.code}: {err}") from e


def main():
    login = req("/auth/login", {"password": ADMIN_PASSWORD, "role": "admin"})
    token = login["token"]
    data = req("/parent-form", token=token)
    rows = data.get("submissions") or []
    print(f"fetched {len(rows)} submissions")

    wb = Workbook()
    ws = wb.active
    ws.title = "Parent forms"

    headers = [c[0] for c in COLUMNS]
    ws.append(headers)

    header_fill = PatternFill("solid", fgColor="0B1F3A")
    header_font = Font(bold=True, color="FFFFFF")
    thin = Border(
        left=Side(style="thin", color="DDDDDD"),
        right=Side(style="thin", color="DDDDDD"),
        top=Side(style="thin", color="DDDDDD"),
        bottom=Side(style="thin", color="DDDDDD"),
    )
    for col, _ in enumerate(headers, 1):
        cell = ws.cell(1, col)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    for i, row in enumerate(rows, 1):
        values = []
        for header, getter in COLUMNS:
            if getter is None:
                values.append(i)
            else:
                v = getter(row)
                if v is None:
                    v = ""
                values.append(v)
        ws.append(values)

    # widths
    for i, header in enumerate(headers, 1):
        width = 14
        if "name" in header.lower() or "address" in header.lower():
            width = 22
        if "explain" in header.lower() or "other" in header.lower() or "allergy" in header.lower():
            width = 28
        if header in ("#", "Sex", "Status"):
            width = 10
        if header == "ID":
            width = 18
        ws.column_dimensions[get_column_letter(i)].width = width

    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, max_col=len(headers)):
        for cell in row:
            cell.border = thin
            cell.alignment = Alignment(vertical="top", wrap_text=True)

    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ws.max_row}"
    ws.freeze_panes = "A2"
    ws.row_dimensions[1].height = 32

    # Summary sheet
    summary = wb.create_sheet("Summary", 0)
    summary["A1"] = "Parent form submissions export"
    summary["A1"].font = Font(bold=True, size=14)
    summary["A3"] = "Total submissions"
    summary["B3"] = len(rows)
    from collections import Counter

    by_status = Counter((r.get("status") or "new") for r in rows)
    by_year = Counter(
        (g(r, "student", "enrollmentYear") or r.get("enrollmentYear") or "(empty)") for r in rows
    )
    with_id = sum(1 for r in rows if r.get("hasCompanionId"))
    summary["A4"] = "With companion/driver ID"
    summary["B4"] = with_id
    summary["A6"] = "By status"
    summary["A6"].font = Font(bold=True)
    row_i = 7
    for k, v in sorted(by_status.items()):
        summary[f"A{row_i}"] = k
        summary[f"B{row_i}"] = v
        row_i += 1
    row_i += 1
    summary[f"A{row_i}"] = "By enrollment year"
    summary[f"A{row_i}"].font = Font(bold=True)
    row_i += 1
    for k, v in sorted(by_year.items(), reverse=True):
        summary[f"A{row_i}"] = k
        summary[f"B{row_i}"] = v
        row_i += 1
    summary.column_dimensions["A"].width = 28
    summary.column_dimensions["B"].width = 12

    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    print("wrote", OUT)


if __name__ == "__main__":
    try:
        # Prefer live API after limit bump; if still capped, warn
        main()
    except Exception as e:
        print("FAILED:", e, file=sys.stderr)
        sys.exit(1)
