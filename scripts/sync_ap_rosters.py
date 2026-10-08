#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sync primary 1AP–5AP Excel rosters into the live website.

- Excel is source of truth for who is in each class and Arabic spelling
- Preserves existing last/first roles when tokens match (avoids swap bugs)
- Updates class / number / gender; inserts students only in Excel
"""
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

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".pydeps"))
sys.path.insert(0, str(ROOT / "scripts"))

from openpyxl import load_workbook  # noqa: E402
from bilingual_names import latin_parts_from_ar  # noqa: E402

API = "https://quality-education-algerie.duckdns.org/api"
ADMIN_PASSWORD = "AdminBBC2026"
APPLY = "--apply" in sys.argv
DELETE_EXTRA = "--delete-extra" in sys.argv or "--apply" in sys.argv
DOWNLOADS = Path("/Users/yahyaabderrahmanemahdi/Downloads")
REPORT = ROOT / "reports" / "ap_roster_sync_report.json"

# Final official primary lists (Oct 2026)
EXCEL_FILES = {
    1: DOWNLOADS / "1ap 2.xlsx",
    2: DOWNLOADS / "2ap 3.xlsx",
    3: DOWNLOADS / "3ap 2.xlsx",
    4: DOWNLOADS / "4ap 2.xlsx",
    5: DOWNLOADS / "5ap 2.xlsx",
}

PARTICLES = {
    "بن",
    "ابن",
    "بنت",
    "ال",
    "عبد",
    "بو",
    "ايت",
    "آيت",
    "أيت",
    "حاج",
    "ولد",
    "سيدي",
    "ابو",
    "أبو",
}


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
    s = s.replace("عبدال", "عبد ال").replace("بنال", "بن ال")
    s = re.sub(r"[^\w\u0600-\u06FF]+", " ", s, flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).strip().lower()


def toks(s: str) -> list[str]:
    return [t for t in norm(s).split() if t]


def sig(tok_list: list[str]) -> list[str]:
    return [t for t in tok_list if t not in PARTICLES and len(t) > 1]


def gender_map(g) -> str:
    g = str(g or "").strip()
    if "أنث" in g or "انث" in g:
        return "Female"
    if "ذكر" in g:
        return "Male"
    return ""


def class_id_for(year: int, class_num: int) -> str:
    return f"P-Y{year}-C{class_num:02d}"


def site_code_for(year: int, class_num: int) -> str:
    return f"{year}P{class_num:02d}"


def split_combined(full: str) -> tuple[str, str]:
    parts = full.split()
    if len(parts) < 2:
        return full, ""
    if parts[0] == "عبد" and len(parts) >= 3:
        return " ".join(parts[:2]), " ".join(parts[2:])
    if parts[0] in PARTICLES and len(parts) >= 3:
        return " ".join(parts[:2]), " ".join(parts[2:])
    if parts[0] == "مسعود" and len(parts) >= 4 and parts[1] == "سعد" and parts[2] == "الله":
        return "مسعود سعد الله", " ".join(parts[3:])
    if parts[0] == "حب" and len(parts) >= 3:
        return " ".join(parts[:2]), " ".join(parts[2:])
    return parts[0], " ".join(parts[1:])


def expand_fused_raw(site_last: str, site_first: str, excel_raw: str) -> str:
    """If excel mashed tokens together (كشكاراليان), re-split using site roles."""
    raw = str(excel_raw).strip()
    parts = raw.split()
    if len(parts) != 1:
        return raw
    compact = norm(parts[0]).replace(" ", "")
    site_compact = (norm(site_last) + norm(site_first)).replace(" ", "")
    if not site_last or not site_first:
        return raw
    if compact == site_compact or SequenceMatcher(None, compact, site_compact).ratio() >= 0.9:
        cut = len(norm(site_last).replace(" ", ""))
        acc = 0
        cut_i = len(parts[0])
        for i, ch in enumerate(parts[0]):
            cn = norm(ch)
            if cn.strip():
                acc += len(cn.strip())
            if acc >= cut:
                cut_i = i + 1
                break
        left, right = parts[0][:cut_i], parts[0][cut_i:]
        if left and right:
            return f"{left} {right}".strip()
    return raw


def remap_lf(site_last: str, site_first: str, excel_raw: str) -> tuple[str, str, str]:
    """Keep site last/first roles; pull corrected spellings from excel raw tokens."""
    raw = expand_fused_raw(site_last, site_first, str(excel_raw).strip())
    raw_parts = [p for p in raw.split() if p.strip()]
    if not raw_parts:
        return site_last, site_first, f"{site_last} {site_first}".strip()

    # Normalize fused particle families: بوخالفي ↔ بو خالفي
    site_last_n = site_last
    if raw_parts and norm(site_last).startswith("بو") and norm(site_last) != "بو":
        if raw_parts[0] == "بو" and len(raw_parts) >= 2:
            fused = "بو" + raw_parts[1]
            if SequenceMatcher(None, norm(site_last), norm(fused)).ratio() >= 0.85:
                site_last_n = f"بو {raw_parts[1]}"
    if (
        site_last
        and norm(site_last).startswith("بو")
        and " " not in site_last.strip()
        and raw_parts
        and raw_parts[0] == "بو"
    ):
        # force site last to split form matching excel
        pass

    used = set()

    def best_excel_for(token: str) -> tuple[int, float]:
        tn = norm(token)
        best_i, best_sc = -1, 0.0
        for i, rp in enumerate(raw_parts):
            if i in used:
                continue
            rn = norm(rp)
            sc = SequenceMatcher(None, tn, rn).ratio()
            # compact match for بوX vs بو X already handled; also X vs بوX
            if tn.startswith("بو") and rn == tn[2:]:
                sc = max(sc, 0.9)
            if rn.startswith("بو") and tn == rn[2:]:
                sc = max(sc, 0.9)
            if sc > best_sc:
                best_i, best_sc = i, sc
        return best_i, best_sc

    def take_for(phrase: str) -> str:
        pt = [p for p in phrase.split() if p]
        if not pt:
            return ""
        out = []
        for p in pt:
            best_i, best_sc = best_excel_for(p)
            if best_i >= 0 and best_sc >= 0.68:
                used.add(best_i)
                out.append(raw_parts[best_i])
            else:
                out.append(p)
        return " ".join(out)

    site_set = set(sig(toks(site_last_n)) + sig(toks(site_first)))
    excel_set = set(sig(toks(raw)))
    if site_set and excel_set and len(site_set & excel_set) >= min(2, len(excel_set)):
        # Prefer excel particle-split family when site had fused بو*
        last_phrase = site_last_n
        if raw_parts[0] == "بو" and norm(site_last).startswith("بو") and " " not in site_last.strip():
            last_phrase = f"بو {raw_parts[1]}" if len(raw_parts) > 1 else site_last
        last = take_for(last_phrase)
        # If last was fused بوخالفي and excel is بو خالفي, take both tokens into last
        if (
            raw_parts[0] == "بو"
            and len(raw_parts) > 1
            and norm(site_last).replace(" ", "") == norm("بو" + raw_parts[1])
        ):
            used.add(0)
            used.add(1)
            last = f"بو {raw_parts[1]}"
        first = take_for(site_first)
        leftovers = [raw_parts[i] for i in range(len(raw_parts)) if i not in used]
        first_parts = [p for p in first.split() if p]
        excel_norm_set = {norm(x) for x in raw_parts}
        still = list(leftovers)
        for fi, fp in enumerate(first_parts):
            if not still:
                break
            if norm(fp) not in excel_norm_set:
                first_parts[fi] = still.pop(0)
        rest = []
        for lo in still:
            ln = norm(lo)
            replaced = False
            for fi, fp in enumerate(first_parts):
                if SequenceMatcher(None, ln, norm(fp)).ratio() >= 0.55:
                    first_parts[fi] = lo
                    replaced = True
                    break
            if not replaced:
                last_parts = [p for p in last.split() if p]
                for li, lp in enumerate(last_parts):
                    if SequenceMatcher(None, ln, norm(lp)).ratio() >= 0.55:
                        last_parts[li] = lo
                        last = " ".join(last_parts)
                        replaced = True
                        break
            if not replaced:
                rest.append(lo)
        if rest:
            # Insert remaining leftovers in Excel order among first-name tokens
            last_norms = {norm(x) for x in last.split()}
            excel_first_order = [p for p in raw_parts if norm(p) not in last_norms]
            # Prefer excel order for first name when leftovers exist
            if excel_first_order:
                first = " ".join(excel_first_order).strip()
            else:
                first = " ".join(first_parts + rest).strip()
        else:
            first = " ".join(first_parts).strip()
        full = f"{last} {first}".strip()
        return last, first, full

    last, first = split_combined(raw)
    return last, first, f"{last} {first}".strip()

def parse_excel() -> list[dict]:
    out = []
    for year in range(1, 6):
        fpath = EXCEL_FILES[year]
        if not fpath.exists():
            raise FileNotFoundError(f"Missing final roster: {fpath}")
        wb = load_workbook(fpath, data_only=True)
        for sn in wb.sheetnames:
            if "رئيس" in sn:
                continue
            m = re.search(r"(\d)\s*ap\s*(\d+)", sn, re.I)
            if not m:
                continue
            class_num = int(m.group(2))
            ws = wb[sn]
            header_row = None
            for r in range(1, 15):
                vals = [str(ws.cell(r, c).value or "") for c in range(1, 8)]
                if any("لقب" in v for v in vals):
                    header_row = r
                    break
            if not header_row:
                continue
            for r in range(header_row + 1, ws.max_row + 1):
                num = ws.cell(r, 1).value
                last = ws.cell(r, 2).value
                first = ws.cell(r, 3).value
                dob = ws.cell(r, 4).value
                gender = ws.cell(r, 5).value
                notes = ws.cell(r, 6).value
                if last is None and first is None:
                    continue
                if isinstance(num, str) and not str(num).strip().isdigit():
                    continue
                last_s = str(last or "").strip()
                first_s = str(first or "").strip()
                if first_s:
                    raw = f"{last_s} {first_s}".strip()
                else:
                    raw = last_s
                if not raw:
                    continue
                try:
                    number = int(num)
                except Exception:
                    number = None
                # provisional split for matching / inserts
                if first_s:
                    pl, pf = last_s, first_s
                else:
                    pl, pf = split_combined(raw)
                out.append(
                    {
                        "year": year,
                        "classNum": class_num,
                        "classId": class_id_for(year, class_num),
                        "classCode": site_code_for(year, class_num),
                        "number": number,
                        "rawFull": raw,
                        "lastName": pl.strip(),
                        "firstName": pf.strip(),
                        "fullName": f"{pl} {pf}".strip(),
                        "gender": gender_map(gender),
                        "dateOfBirth": str(dob).strip() if dob else "",
                        "notes": str(notes or "").strip(),
                        "sourceFile": fpath.name,
                    }
                )
    return out


def score(ex: dict, st: dict) -> tuple[float, str]:
    en, sn_ = norm(ex["rawFull"]), norm(st["fullName"])
    if not en or not sn_:
        return 0, "empty"
    if en == sn_:
        return 1.0, "exact"
    es, ss = set(sig(toks(ex["rawFull"]))), set(sig(toks(st["fullName"])))
    if es and es == ss:
        return 0.97, "sig-equal"
    if es and ss and (es <= ss or ss <= es) and len(es & ss) >= 2:
        return 0.92, "sig-subset"
    if es and ss and len(es & ss) >= 2:
        j = len(es & ss) / len(es | ss)
        if j >= 0.75:
            return 0.85 + 0.1 * j, "sig-jaccard"
        long_shared = [t for t in (es & ss) if len(t) >= 3]
        if len(long_shared) >= 2:
            return 0.82, "two-long"
    fuzzy = SequenceMatcher(None, en, sn_).ratio()
    if fuzzy >= 0.92 and es and ss and len(es & ss) >= 1:
        return fuzzy, "fuzzy-high"
    if fuzzy >= 0.88 and es and ss and len([t for t in (es & ss) if len(t) >= 4]) >= 1:
        return fuzzy * 0.95, "fuzzy-fam"
    return 0, "none"


# High-confidence manual recoveries for leftover spelling/spacing cases
MANUAL_LEFTOVERS = [
    # (excel_norm_contains, site_norm_contains, min_ratio)
]


def build_plan(excel: list[dict], site: list[dict]):
    by_year = defaultdict(list)
    for s in site:
        by_year[s["year"]].append(s)

    candidates = []
    for i, ex in enumerate(excel):
        for st in by_year[ex["year"]]:
            sc, method = score(ex, st)
            if sc >= 0.82:
                if st["classId"] == ex["classId"]:
                    sc += 0.005
                candidates.append((sc, method, i, st["id"]))
    candidates.sort(reverse=True)

    used_ex, used_st, pairs = set(), set(), []
    for sc, method, i, sid in candidates:
        if i in used_ex or sid in used_st:
            continue
        used_ex.add(i)
        used_st.add(sid)
        pairs.append((excel[i], next(s for s in site if s["id"] == sid), sc, method))

    # Recover a few obvious leftovers (same year, high fuzzy)
    inserts_idx = [i for i in range(len(excel)) if i not in used_ex]
    left = [s for s in site if s["id"] not in used_st]
    for i in list(inserts_idx):
        ex = excel[i]
        best, best_sc = None, 0.0
        for st in left:
            if st["id"] in used_st or st["year"] != ex["year"]:
                continue
            sc = SequenceMatcher(None, norm(ex["rawFull"]), norm(st["fullName"])).ratio()
            # compact compare (drop spaces)
            sc2 = SequenceMatcher(
                None, norm(ex["rawFull"]).replace(" ", ""), norm(st["fullName"]).replace(" ", "")
            ).ratio()
            sc = max(sc, sc2)
            if sc > best_sc:
                best, best_sc = st, sc
        # only very safe recoveries
        if best and best_sc >= 0.84:
            used_ex.add(i)
            used_st.add(best["id"])
            pairs.append((ex, best, best_sc, "recover"))
            left = [s for s in left if s["id"] != best["id"]]

    updates, inserts = [], []
    for ex, st, sc, method in pairs:
        # Excel columns are authoritative for spelling.
        # When first-name column is filled, use last/first as written.
        # When the full name is mashed into the last column, use particle-aware split.
        if (ex.get("firstName") or "").strip():
            last = (ex.get("lastName") or "").strip()
            first = (ex.get("firstName") or "").strip()
            full = f"{last} {first}".strip()
        else:
            raw = ex["rawFull"]
            # Excel sometimes mashes tokens (كشكاراليان) — expand using site roles
            if " " not in raw.strip():
                raw = expand_fused_raw(
                    st.get("lastName") or "", st.get("firstName") or "", raw
                )
            last, first = split_combined(raw)
            full = f"{last} {first}".strip()
            # If site already had a clean multi-token last name that matches excel
            # tokens, keep that role split (avoids بن/جلول breakage only when needed)
            site_last = (st.get("lastName") or "").strip()
            site_first = (st.get("firstName") or "").strip()
            if site_last and site_first:
                rem_l, rem_f, rem_full = remap_lf(site_last, site_first, ex["rawFull"])
                # Prefer remap only when it preserves particle surnames (بن X, عبد X, بو X)
                if (
                    rem_l
                    and rem_f
                    and norm(rem_full).replace(" ", "") == norm(ex["rawFull"]).replace(" ", "")
                    and (len(rem_l.split()) >= 2 or rem_l == last)
                ):
                    last, first, full = rem_l, rem_f, rem_full
            # Never replace a spaced site name with a fused excel blob
            if " " not in full and " " in (st.get("fullName") or ""):
                if norm(full).replace(" ", "") == norm(st["fullName"]).replace(" ", ""):
                    last = site_last or last
                    first = site_first or first
                    full = f"{last} {first}".strip() if last and first else st["fullName"]

        name_changed = (
            full != (st.get("fullName") or "")
            or last != (st.get("lastName") or "")
            or first != (st.get("firstName") or "")
        )
        class_changed = ex["classId"] != st["classId"]
        gender_changed = bool(ex["gender"]) and ex["gender"] != (st.get("gender") or "")
        number_changed = ex["number"] is not None and ex["number"] != st.get("number")

        if name_changed:
            fl, ll, ful, _ = latin_parts_from_ar(first, last, full)
        else:
            fl = st.get("firstNameLatin") or ""
            ll = st.get("lastNameLatin") or ""
            ful = st.get("fullNameLatin") or ""
            if not ful:
                fl, ll, ful, _ = latin_parts_from_ar(first, last, full)

        if name_changed or class_changed or gender_changed or number_changed:
            updates.append(
                {
                    "studentId": st["id"],
                    "fromName": st["fullName"],
                    "fullName": full,
                    "lastName": last,
                    "firstName": first,
                    "firstNameLatin": fl,
                    "lastNameLatin": ll,
                    "fullNameLatin": ful,
                    "searchName": f"{full} {ful} {first} {fl} {last} {ll}".strip(),
                    "fromClass": st["classId"],
                    "classId": ex["classId"],
                    "departmentId": "primary",
                    "number": ex["number"] if ex["number"] is not None else st.get("number"),
                    "gender": ex["gender"] or st.get("gender") or "",
                    "dateOfBirth": st.get("dateOfBirth") or ex.get("dateOfBirth") or "",
                    "nameChanged": name_changed,
                    "classChanged": class_changed,
                    "score": round(float(sc), 3),
                    "method": method,
                    "excelRaw": ex["rawFull"],
                }
            )

    for i, ex in enumerate(excel):
        if i in used_ex:
            continue
        last, first = ex["lastName"], ex["firstName"]
        full = ex["fullName"]
        fl, ll, ful, _ = latin_parts_from_ar(first, last, full)
        inserts.append(
            {
                **ex,
                "firstNameLatin": fl,
                "lastNameLatin": ll,
                "fullNameLatin": ful,
                "departmentId": "primary",
                "searchName": f"{full} {ful} {first} {fl} {last} {ll}".strip(),
            }
        )

    site_left = [s for s in site if s["id"] not in used_st]
    return pairs, updates, inserts, site_left


def main():
    print("Parsing Excel…")
    excel = parse_excel()
    print(f"  excel students: {len(excel)} {dict(Counter(e['year'] for e in excel))}")

    print("Fetching live school-data…")
    login = req("/auth/login", {"password": ADMIN_PASSWORD, "role": "admin"})
    token = login["token"]
    school = req("/school-data", token=token)
    site = []
    for lev in school["primary"]["levels"]:
        for cls in lev["classes"]:
            for s in cls["students"]:
                site.append({**s, "year": lev["id"], "classCode": cls.get("code"), "classId": cls["id"]})
    print(f"  live primary: {len(site)}")

    pairs, updates, inserts, site_left = build_plan(excel, site)
    name_updates = [u for u in updates if u["nameChanged"]]
    class_moves = [u for u in updates if u["classChanged"]]

    print(
        f"pairs={len(pairs)} updates={len(updates)} "
        f"name_corrections={len(name_updates)} class_moves={len(class_moves)} "
        f"inserts={len(inserts)} site_unmatched={len(site_left)}"
    )
    print("\nName corrections:")
    for u in name_updates:
        print(
            f"  [{u['score']}/{u['method']}] {u['fromClass']}→{u['classId']} "
            f"{u['fromName']!r} → {u['fullName']!r}"
        )
    print(f"\nInserts ({len(inserts)}):")
    for ex in inserts:
        print(f"  Y{ex['year']} {ex['classCode']} #{ex['number']} {ex['fullName']!r}")
    print(f"\nLeft on site (not in Excel): {len(site_left)}")
    for s in site_left:
        print(f"  Y{s['year']} {s['classCode']} {s['fullName']} ({s['id']})")

    # Parent-form confirmation for name corrections
    print("\nConfirming name corrections against parent forms…")
    try:
        pf = req("/parent-form", token=token)
        subs = pf.get("submissions") or []
    except Exception as e:
        subs = []
        print(f"  (parent-form fetch failed: {e})")

    def pf_ar_full(sub):
        fd = sub.get("formData") or {}
        st = fd.get("student") or {}
        ln = str(st.get("lastName") or "").strip()
        fn = str(st.get("firstName") or "").strip()
        return f"{ln} {fn}".strip()

    parent_confirm = []
    for u in name_updates:
        hits = []
        for sub in subs:
            ar = pf_ar_full(sub)
            if not ar:
                continue
            if norm(ar) == norm(u["fullName"]) or norm(ar) == norm(u["fromName"]) or norm(ar) == norm(u["excelRaw"]):
                hits.append({"formId": sub.get("id"), "parentName": ar, "linkedStudentId": sub.get("studentId") or ""})
            elif u["studentId"] and sub.get("studentId") == u["studentId"]:
                hits.append({"formId": sub.get("id"), "parentName": ar, "linkedStudentId": sub.get("studentId") or "", "via": "linked"})
        parent_confirm.append(
            {
                "studentId": u["studentId"],
                "from": u["fromName"],
                "to": u["fullName"],
                "excel": u["excelRaw"],
                "parentHits": hits[:5],
                "confirmed": bool(hits),
            }
        )
        mark = "OK" if hits else "?"
        ph = repr(hits[0]["parentName"]) if hits else "—"
        print(f"  [{mark}] {u['fromName']!r} → {u['fullName']!r}  parent={ph}")

    report = {
        "stats": {
            "excel": len(excel),
            "live": len(site),
            "pairs": len(pairs),
            "updates": len(updates),
            "name_corrections": len(name_updates),
            "class_moves": len(class_moves),
            "inserts": len(inserts),
            "site_unmatched": len(site_left),
            "applied": False,
            "deleted_extra": 0,
        },
        "name_corrections": name_updates,
        "parent_confirmations": parent_confirm,
        "updates": updates,
        "inserts": inserts,
        "site_unmatched": [
            {"id": s["id"], "year": s["year"], "class": s["classCode"], "fullName": s["fullName"]}
            for s in site_left
        ],
    }

    if APPLY:
        print("\nApplying to live API…")
        ok_u = ok_i = err = skip_i = ok_d = 0
        # Build existing keys to make inserts idempotent (avoid proxy retry doubles)
        existing_keys = set()
        for lev in school["primary"]["levels"]:
            for cls in lev["classes"]:
                for s in cls["students"]:
                    existing_keys.add((norm(s.get("fullName") or ""), cls["id"], s.get("number")))
        for u in updates:
            body = {
                "firstName": u["firstName"],
                "lastName": u["lastName"],
                "fullName": u["fullName"],
                "firstNameLatin": u["firstNameLatin"],
                "lastNameLatin": u["lastNameLatin"],
                "fullNameLatin": u["fullNameLatin"],
                "searchName": u["searchName"],
                "classId": u["classId"],
                "departmentId": "primary",
                "number": u["number"],
                "gender": u["gender"],
            }
            try:
                req(f"/students/{u['studentId']}", body, token=token, method="PUT")
                ok_u += 1
            except Exception as e:
                err += 1
                print(f"  UPDATE FAIL {u['studentId']} {u['fromName']}: {e}")
        for ex in inserts:
            key = (norm(ex["fullName"]), ex["classId"], ex["number"])
            if key in existing_keys:
                skip_i += 1
                continue
            body = {
                "firstName": ex["firstName"],
                "lastName": ex["lastName"],
                "fullName": ex["fullName"],
                "firstNameLatin": ex["firstNameLatin"],
                "lastNameLatin": ex["lastNameLatin"],
                "fullNameLatin": ex["fullNameLatin"],
                "searchName": ex["searchName"],
                "classId": ex["classId"],
                "departmentId": "primary",
                "number": ex["number"] or 0,
                "gender": ex["gender"],
                "dateOfBirth": ex.get("dateOfBirth") or "",
                "notes": ex.get("notes") or "",
            }
            try:
                created = req("/students", body, token=token, method="POST")
                ok_i += 1
                existing_keys.add(key)
                if isinstance(created, dict) and created.get("id"):
                    existing_keys.add((norm(created.get("fullName") or ex["fullName"]), ex["classId"], ex["number"]))
            except Exception as e:
                err += 1
                print(f"  INSERT FAIL {ex['fullName']}: {e}")

        deleted_rows = []
        if DELETE_EXTRA and site_left:
            print(f"\nDeleting {len(site_left)} students not on final Excel list (duplicates / removed)…")
            for s in site_left:
                try:
                    req(f"/students/{s['id']}", token=token, method="DELETE")
                    ok_d += 1
                    deleted_rows.append(
                        {"id": s["id"], "class": s["classCode"], "fullName": s["fullName"]}
                    )
                    print(f"  DEL {s['classCode']} {s['fullName']}")
                except Exception as e:
                    err += 1
                    print(f"  DEL FAIL {s['id']} {s['fullName']}: {e}")

        print(f"Applied updates={ok_u} inserts={ok_i} deleted={ok_d} skipped_inserts={skip_i} errors={err}")
        report["stats"]["applied"] = True
        report["stats"]["applied_updates"] = ok_u
        report["stats"]["applied_inserts"] = ok_i
        report["stats"]["deleted_extra"] = ok_d
        report["stats"]["skipped_inserts"] = skip_i
        report["stats"]["errors"] = err
        report["deleted"] = deleted_rows

        # Refresh local school_data.json + js from live
        print("Refreshing local school_data from live…")
        school2 = req("/school-data", token=token)
        data_path = ROOT / "data" / "school_data.json"
        data_path.write_text(json.dumps(school2, ensure_ascii=False, indent=2), encoding="utf-8")
        js_path = ROOT / "js" / "school-data.js"
        js_path.write_text(
            "window.SCHOOL_DATA = " + json.dumps(school2, ensure_ascii=False) + ";\n",
            encoding="utf-8",
        )
        print(f"  wrote {data_path} and {js_path}")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nReport: {REPORT}")
    if not APPLY:
        print("Dry-run only. Re-run with --apply to write to the live site.")


if __name__ == "__main__":
    main()
