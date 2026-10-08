#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Re-scan all student photo zip packs:
  - extract every image
  - match by class folder + Arabic/Latin name
  - upload missing photos
  - replace only when a class-scoped match is uniquely stronger (fix wrong assigns)

Usage:
  .venv/bin/python scripts/reprocess_all_photo_zips.py
  .venv/bin/python scripts/reprocess_all_photo_zips.py --dry-run
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import re
import shutil
import ssl
import unicodedata
import urllib.error
import urllib.request
import zipfile
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

API = "https://quality-education-algerie.duckdns.org/api"
ROOT = Path("/Users/yahyaabderrahmanemahdi/Desktop/bbc-school-admin")
WORK = ROOT / "data" / "_photo_reprocess_all"
REPORT = ROOT / "reports" / "photo_reprocess_all_zips.json"
ADMIN_PASSWORD = "AdminBBC2026"

ZIPS = [
    Path("/Users/yahyaabderrahmanemahdi/Downloads/1M7.zip"),
    Path("/Users/yahyaabderrahmanemahdi/Downloads/1P1 1P2 1P3.zip"),
    Path("/Users/yahyaabderrahmanemahdi/Downloads/1P4.zip"),
    Path("/Users/yahyaabderrahmanemahdi/Downloads/2P1.zip"),
    Path("/Users/yahyaabderrahmanemahdi/Downloads/2P2.zip"),
    Path("/Users/yahyaabderrahmanemahdi/Downloads/2P3.zip"),
    Path("/Users/yahyaabderrahmanemahdi/Downloads/2P4.zip"),
    Path("/Users/yahyaabderrahmanemahdi/Downloads/2P9 2P10 2P11 2P12 3P1.zip"),
    # Atlas.zip skipped — design assets, not student photos
    Path("/Users/yahyaabderrahmanemahdi/Downloads/BBC.assets 3 4 5 6.zip"),
    Path("/Users/yahyaabderrahmanemahdi/Downloads/BBC.assets.zip"),
    Path("/Users/yahyaabderrahmanemahdi/Downloads/zip.zip"),
    Path("/Users/yahyaabderrahmanemahdi/Downloads/photos 1P6 to 1P10.zip"),
    Path("/Users/yahyaabderrahmanemahdi/Downloads/quota2.zip"),
    Path("/Users/yahyaabderrahmanemahdi/Downloads/quota3.zip"),
    Path("/Users/yahyaabderrahmanemahdi/Downloads/quota4.zip"),
]

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_BYTES = 4 * 1024 * 1024
# Class-scoped matches can be a bit looser; school-wide flat packs must be stricter.
MIN_CLASS = 0.38
MIN_FLAT = 0.70
MIN_REPLACE = 0.92  # only replace existing photo if uniquely this strong
# Unique-in-class near miss (spelling variants) when no second candidate
MIN_CLASS_UNIQUE = 0.38
CTX = ssl.create_default_context()


def req(path, data=None, token=None, method=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        method = method or "POST"
    else:
        method = method or "GET"
    r = urllib.request.Request(API + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=180, context=CTX) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {e.code}: {err}") from e


def norm(s: str) -> str:
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
    # strip invisible / RTL marks often present in zip names
    s = re.sub(r"[\u200e\u200f\u202a-\u202e\u2066-\u2069]", "", s)
    s = re.sub(r"[^\w\u0600-\u06FF]+", " ", s, flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).strip().lower()


def tokens(s: str) -> list[str]:
    return [t for t in norm(s).split() if t and len(t) > 1]


def compact(s: str) -> str:
    """Space-insensitive identity: بوعبد الله == بوعبدالله."""
    return re.sub(r"\s+", "", norm(s))


# Common Arabic letter confusions (handwriting / family spelling / OCR)
_CONFUSABLE_PAIRS = {
    frozenset(("ج", "خ")),  # نجاري / نخاري
    frozenset(("ج", "ه")),  # ناجي / ناهي
    frozenset(("ق", "ف")),  # شرقي / شرفي
    frozenset(("ك", "ق")),
    frozenset(("ذ", "ز")),
    frozenset(("ض", "ظ")),
    frozenset(("ث", "ت")),
}

# Map spelling variants to one canonical token (after norm, ة→ه already applied)
_NAME_CANON = {
    "ادام": "ادم",
    "لينه": "لينا",
    "الرحمن": "الرحمان",
}


def canon_tokens(s: str) -> list[str]:
    return [_NAME_CANON.get(t, t) for t in norm(s).split()]


def fold_letters(s: str) -> str:
    """Collapse ج/خ (safe global fold). ه is handled via confusable edit-distance."""
    out = compact(" ".join(canon_tokens(s)))
    out = out.replace("خ", "ج")
    out = out.replace("ف", "ق")  # شرفي→شرقي direction unified to ق
    return out


def confusable_equal(a: str, b: str) -> bool:
    """True when compact forms differ only by allowed Arabic letter swaps."""
    ca = compact(" ".join(canon_tokens(a)))
    cb = compact(" ".join(canon_tokens(b)))
    if ca == cb:
        return True
    # unify safe global folds first
    ca2, cb2 = ca.replace("خ", "ج").replace("ف", "ق"), cb.replace("خ", "ج").replace("ف", "ق")
    if ca2 == cb2:
        return True
    if len(ca2) != len(cb2):
        return False
    diffs = [(x, y) for x, y in zip(ca2, cb2) if x != y]
    if not diffs or len(diffs) > 2:
        return False
    return all(frozenset(pair) in _CONFUSABLE_PAIRS for pair in diffs)


def same_person(a: str, b: str) -> tuple[bool, str]:
    """Intelligence-first identity — not raw SequenceMatcher score."""
    if not a or not b:
        return False, ""
    if compact(a) == compact(b):
        return True, "spacing"
    if compact(" ".join(canon_tokens(a))) == compact(" ".join(canon_tokens(b))):
        return True, "name-variant"
    if fold_letters(a) == fold_letters(b):
        return True, "letter-variant"
    if confusable_equal(a, b):
        return True, "letter-variant"
    return False, ""


def normalize_class_code(raw: str) -> str | None:
    s = (raw or "").strip().upper().replace(" ", "").replace("_", "")
    s = s.replace("APA", "AP").replace("P0", "P")
    # 1P1 / 1P01 / 2P9 / 3P1
    m = re.fullmatch(r"([1-5])P(\d{1,2})", s)
    if m:
        return f"{m.group(1)}P{int(m.group(2)):02d}"
    # 1M7 / 2M3 / 4M1
    m = re.fullmatch(r"([1-4])M(\d{1,2})", s)
    if m:
        return f"{m.group(1)}M{int(m.group(2))}"
    return None


def detect_class_from_path(rel: Path) -> str | None:
    """Walk path parts for a class code folder."""
    for part in rel.parts[:-1]:
        code = normalize_class_code(part)
        if code:
            return code
    # sometimes filename starts with class
    stem = rel.stem.strip()
    code = normalize_class_code(stem)
    if code:
        return code
    return None


def is_group_photo(stem: str, class_code: str | None) -> bool:
    n = normalize_class_code(stem.replace(" ", ""))
    if class_code and n == class_code:
        return True
    if n and re.fullmatch(r"[1-5]P\d{2}|[1-4]M\d+", n or ""):
        # bare class label image
        return True
    return False


def to_jpeg_data_url(path: Path) -> str:
    raw = path.read_bytes()
    lower = path.suffix.lower()
    mime = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(lower, "image/jpeg")

    if len(raw) <= MAX_BYTES and lower in IMG_EXT:
        return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"

    from PIL import Image

    img = Image.open(path)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")
    quality = 85
    while quality >= 40:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        data = buf.getvalue()
        if len(data) <= MAX_BYTES:
            return f"data:image/jpeg;base64,{base64.b64encode(data).decode('ascii')}"
        quality -= 10
        w, h = img.size
        img = img.resize((max(1, w * 4 // 5), max(1, h * 4 // 5)), Image.LANCZOS)
    raise RuntimeError(f"still too large after compress: {path}")


def score_pair(photo_toks, photo_norm, stu_toks, stu_norm, photo_raw: str = "", stu_raw: str = "") -> float:
    # Intelligence first: spacing / letter / spelling variants are the same person
    if photo_raw and stu_raw:
        same, reason = same_person(photo_raw, stu_raw)
        if same:
            return {"spacing": 1.0, "letter-variant": 0.99, "name-variant": 0.98}.get(reason, 0.98)

    a, b = set(photo_toks), set(stu_toks)
    if not a or not b:
        # still allow compact equality when tokens were split differently
        if photo_raw and stu_raw and compact(photo_raw) == compact(stu_raw):
            return 1.0
        return 0.0
    j = len(a & b) / len(a | b)
    hit = sum(1 for t in photo_toks if t in stu_norm) / len(photo_toks)
    seq = SequenceMatcher(None, photo_norm, stu_norm).ratio()
    # compact-seq catches بوعبدالله vs بوعبد الله better than spaced seq
    cseq = SequenceMatcher(None, compact(photo_raw or photo_norm), compact(stu_raw or stu_norm)).ratio()
    seq = max(seq, cseq)
    bonus = 0.12 if photo_toks and stu_toks and photo_toks[0] == stu_toks[0] else 0.0
    # require at least one meaningful shared token OR very strong compact match
    if len(a & b) == 0 and cseq < 0.92:
        return 0.0
    return 0.48 * j + 0.27 * hit + 0.13 * seq + bonus


def extract_all(work: Path) -> list[dict]:
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True, exist_ok=True)
    photos = []
    seen_hash = set()

    for zpath in ZIPS:
        if not zpath.exists():
            print("MISSING ZIP", zpath)
            continue
        dest = work / zpath.stem.replace(" ", "_")
        dest.mkdir(parents=True, exist_ok=True)
        print(f"Extracting {zpath.name} …")
        with zipfile.ZipFile(zpath) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                name = info.filename
                if "__MACOSX" in name or Path(name).name.startswith("."):
                    continue
                rel = Path(name)
                if rel.suffix.lower() not in IMG_EXT:
                    continue
                # flatten zip slip
                out = dest / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(info) as src, open(out, "wb") as dst:
                    shutil.copyfileobj(src, dst)

                digest = hashlib.sha1(out.read_bytes()).hexdigest()
                if digest in seen_hash:
                    continue
                seen_hash.add(digest)

                class_code = detect_class_from_path(Path(zpath.stem) / rel)
                # Prefer folder class inside archive over zip name
                class_code = detect_class_from_path(rel) or class_code
                stem = rel.stem.strip()
                # strip leading weird chars
                stem = stem.lstrip("\u200f\u200e‏‎").strip()
                if is_group_photo(stem, class_code):
                    continue
                photos.append(
                    {
                        "path": str(out),
                        "zip": zpath.name,
                        "rel": str(rel),
                        "stem": stem,
                        "class": class_code,  # may be None for flat packs
                        "norm": norm(stem),
                        "toks": tokens(stem),
                        "sha1": digest,
                        "scoped": bool(class_code),
                    }
                )
    print(f"Unique student photo files: {len(photos)}")
    return photos


def load_students(token: str) -> list[dict]:
    school = req("/school-data", token=token)
    students = []
    for dept in ("primary", "middle"):
        for lv in school[dept]["levels"]:
            for c in lv["classes"]:
                code = (c.get("code") or "").strip().upper()
                for s in c.get("students") or []:
                    full = (s.get("fullName") or "").strip()
                    if not full:
                        full = f"{s.get('lastName', '')} {s.get('firstName', '')}".strip()
                    latin = (s.get("fullNameLatin") or "").strip()
                    n_ar = norm(full)
                    n_lat = norm(latin)
                    toks = tokens(full) or tokens(latin)
                    students.append(
                        {
                            "id": s["id"],
                            "class": code,
                            "full": full,
                            "latin": latin,
                            "norm": n_ar or n_lat,
                            "toks": toks,
                            "hasPhoto": bool((s.get("photo") or "").strip()),
                            "photo": (s.get("photo") or "").strip(),
                            "department": "Primary" if dept == "primary" else "Middle",
                        }
                    )
    return students


def best_matches(photo: dict, students: list[dict], class_only: bool):
    cands = []
    for st in students:
        if class_only:
            if not photo["class"] or st["class"] != photo["class"]:
                continue
        sc = score_pair(
            photo["toks"],
            photo["norm"],
            st["toks"],
            st["norm"],
            photo_raw=photo.get("stem") or "",
            stu_raw=st.get("full") or "",
        )
        if sc <= 0:
            continue
        cands.append((sc, st))
    cands.sort(key=lambda x: -x[0])
    return cands


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--replace",
        action="store_true",
        help="Also re-upload strong class-scoped matches onto students who already have a photo",
    )
    args = ap.parse_args()
    # Default: fill missing only. Use --replace to refresh existing photos from class packs.
    do_replace = bool(args.replace)

    login = req("/auth/login", {"password": ADMIN_PASSWORD})
    token = login["token"]
    print("Logged in as", login.get("role"))

    students = load_students(token)
    by_id = {s["id"]: s for s in students}
    print(
        f"Roster: {len(students)} students · missing photos: {sum(1 for s in students if not s['hasPhoto'])}"
    )

    photos = extract_all(WORK)

    # Prefer class-scoped photos over flat duplicates of same person name
    photos.sort(key=lambda p: (0 if p["scoped"] else 1, p["zip"], p["rel"]))

    assignments = []  # photo -> student
    used_students = set()
    used_photos = set()
    ambiguous = []
    orphans = []

    def pick_best(cands, *, prefer_missing: bool):
        """Rank candidates; break ties toward students still missing a photo."""
        ranked = []
        for sc, st in cands:
            if st["id"] in used_students:
                continue
            adj = sc
            if prefer_missing and not st["hasPhoto"]:
                adj += 0.15
            ranked.append((adj, sc, st))
        ranked.sort(key=lambda x: (-x[0], x[2]["hasPhoto"], x[2]["id"]))
        return ranked

    # Pass 1: class-scoped
    class_orphans = []
    for ph in [p for p in photos if p["scoped"]]:
        cands = best_matches(ph, students, class_only=True)
        if not cands:
            class_orphans.append(ph)
            continue
        ranked = pick_best(cands, prefer_missing=True)
        if not ranked:
            continue
        adj, best_sc, best = ranked[0]
        second = ranked[1][1] if len(ranked) > 1 else 0.0
        unique = second <= 0
        accept = False
        if best_sc >= 0.55 and (unique or best_sc - second >= 0.04):
            accept = True
        elif unique and best_sc >= MIN_CLASS_UNIQUE:
            accept = True
        elif best_sc >= MIN_CLASS and best_sc - second >= 0.08:
            accept = True
        if not accept:
            ambiguous.append(
                {
                    "photo": ph["stem"],
                    "class": ph["class"],
                    "zip": ph["zip"],
                    "best": best["full"],
                    "bestScore": round(best_sc, 3),
                    "secondScore": round(second, 3),
                }
            )
            continue
        used_students.add(best["id"])
        used_photos.add(ph["path"])
        assignments.append((ph, best, best_sc, "class"))

    # Pass 1b: class-folder photos with no one in that class — try school-wide carefully
    for ph in class_orphans:
        cands = best_matches(ph, students, class_only=False)
        ranked = pick_best(cands, prefer_missing=True)
        if not ranked:
            orphans.append({**ph, "reason": "no_class_or_global_candidate"})
            continue
        adj, best_sc, best = ranked[0]
        second = ranked[1][1] if len(ranked) > 1 else 0.0
        # Require strong + clear winner; prefer missing-photo student
        if best_sc < 0.82 or (second > 0 and best_sc - second < 0.1 and not (not best["hasPhoto"] and ranked[1][2]["hasPhoto"])):
            # still allow exact-ish name on missing student
            if not (best_sc >= 0.9 and not best["hasPhoto"] and (second < best_sc or ranked[1][2]["hasPhoto"])):
                orphans.append({**ph, "reason": "class_folder_name_not_on_roster"})
                continue
        used_students.add(best["id"])
        used_photos.add(ph["path"])
        assignments.append((ph, best, best_sc, "class-rescue"))

    # Pass 2: flat packs — only to students still free, school-wide, strict
    for ph in [p for p in photos if not p["scoped"] and p["path"] not in used_photos]:
        cands = best_matches(ph, students, class_only=False)
        if not cands:
            orphans.append({**ph, "reason": "no_global_candidate"})
            continue
        ranked = pick_best(cands, prefer_missing=True)
        if not ranked:
            continue
        adj, best_sc, best = ranked[0]
        second = ranked[1][1] if len(ranked) > 1 else 0.0
        # Exact / near-exact name: allow even if another duplicate already has a photo
        exactish = best_sc >= 0.95
        if exactish and not best["hasPhoto"]:
            pass  # accept
        elif best_sc < MIN_FLAT:
            ambiguous.append(
                {
                    "photo": ph["stem"],
                    "class": ph["class"] or "(flat)",
                    "zip": ph["zip"],
                    "best": f"{best['full']} ({best['class']})",
                    "bestScore": round(best_sc, 3),
                    "secondScore": round(second, 3),
                }
            )
            continue
        elif second >= best_sc - 0.001 and best["hasPhoto"]:
            # tied with another student — only OK if we picked the missing one
            ambiguous.append(
                {
                    "photo": ph["stem"],
                    "class": ph["class"] or "(flat)",
                    "zip": ph["zip"],
                    "best": f"{best['full']} ({best['class']})",
                    "bestScore": round(best_sc, 3),
                    "secondScore": round(second, 3),
                    "note": "tied_names",
                }
            )
            continue
        elif second >= MIN_FLAT - 0.05 and best_sc - second < 0.08 and not exactish:
            ambiguous.append(
                {
                    "photo": ph["stem"],
                    "class": ph["class"] or "(flat)",
                    "zip": ph["zip"],
                    "best": f"{best['full']} ({best['class']})",
                    "bestScore": round(best_sc, 3),
                    "secondScore": round(second, 3),
                }
            )
            continue
        used_students.add(best["id"])
        used_photos.add(ph["path"])
        assignments.append((ph, best, best_sc, "flat"))

    # Decide upload vs skip vs replace
    to_upload = []
    skipped_have = []
    replace_list = []
    for ph, st, sc, kind in assignments:
        fresh = by_id[st["id"]]
        if not fresh["hasPhoto"]:
            to_upload.append((ph, st, sc, kind, "missing"))
        elif (
            do_replace
            and kind == "class"
            and sc >= MIN_REPLACE
            # only refresh when this photo is uniquely the class pack for them
        ):
            # avoid mass re-upload: replace only if score extremely high AND
            # another no-photo student did not want this photo
            replace_list.append((ph, st, sc, kind, "replace"))
        else:
            skipped_have.append(
                {
                    "student": st["full"],
                    "class": st["class"],
                    "photo": ph["stem"],
                    "score": round(sc, 3),
                    "kind": kind,
                }
            )

    upload_queue = to_upload + replace_list
    print(
        f"Matched {len(assignments)} · upload missing {len(to_upload)} · "
        f"replace {len(replace_list)} · skip-have {len(skipped_have)} · "
        f"ambiguous {len(ambiguous)} · orphans {len(orphans)}"
    )

    ok = []
    fail = []
    if args.dry_run:
        print("DRY RUN — no uploads")
    else:
        for i, (ph, st, sc, kind, action) in enumerate(upload_queue, 1):
            try:
                data_url = to_jpeg_data_url(Path(ph["path"]))
                res = req(
                    "/uploads/photo",
                    {"entity": "students", "id": st["id"], "dataUrl": data_url},
                    token=token,
                )
                row = {
                    "studentId": st["id"],
                    "student": st["full"],
                    "class": st["class"],
                    "photo": ph["stem"],
                    "zip": ph["zip"],
                    "score": round(sc, 3),
                    "kind": kind,
                    "action": action,
                    "url": res.get("url") or res.get("photo"),
                }
                ok.append(row)
                print(
                    f"OK [{i}/{len(upload_queue)}] {action} {st['class']} {st['full']} <- {ph['stem']} ({sc:.2f})"
                )
            except Exception as e:
                fail.append(
                    {
                        "studentId": st["id"],
                        "student": st["full"],
                        "class": st["class"],
                        "photo": ph["stem"],
                        "error": str(e)[:300],
                    }
                )
                print(f"FAIL {st['class']} {st['full']}: {e}")

    # Refresh missing count
    students2 = load_students(token)
    still_missing = [
        {
            "id": s["id"],
            "class": s["class"],
            "name": s["full"],
            "latin": s["latin"],
            "department": s["department"],
        }
        for s in students2
        if not s["hasPhoto"]
    ]
    missing_by_class = defaultdict(int)
    for s in still_missing:
        missing_by_class[s["class"]] += 1

    report = {
        "api": API,
        "zips": [str(z) for z in ZIPS],
        "skipped_zip": ["Atlas.zip (not student photos)"],
        "photos_unique": len(photos),
        "matched": len(assignments),
        "uploaded_ok": len(ok),
        "upload_fail": len(fail),
        "uploaded_missing": sum(1 for r in ok if r["action"] == "missing"),
        "replaced": sum(1 for r in ok if r["action"] == "replace"),
        "skipped_already_had_photo": len(skipped_have),
        "ambiguous": len(ambiguous),
        "orphans": len(orphans),
        "still_missing_photos": len(still_missing),
        "missing_by_class": dict(sorted(missing_by_class.items(), key=lambda kv: (-kv[1], kv[0]))),
        "ok_rows": ok,
        "fail_rows": fail,
        "ambiguous_rows": ambiguous[:200],
        "orphan_rows": [
            {"stem": o["stem"], "zip": o["zip"], "class": o.get("class"), "reason": o.get("reason")}
            for o in orphans[:200]
        ],
        "still_missing_rows": still_missing,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\nREPORT", REPORT)
    print(
        f"DONE uploaded={len(ok)} fail={len(fail)} still_missing={len(still_missing)}"
    )


if __name__ == "__main__":
    main()
