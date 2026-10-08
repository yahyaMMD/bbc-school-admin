#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Match student photos by Arabic filename within class folders and upload."""
import json, re, unicodedata, base64, urllib.request, urllib.error, io, sys
from pathlib import Path
from difflib import SequenceMatcher

API = "http://72.62.42.122/api"
ROOT = Path("/Users/yahyaabderrahmanemahdi/Downloads/zip")
MIN_SCORE = 0.35
MAX_BYTES = 4 * 1024 * 1024

CLASSES = [
    "2M1", "2M2", "2M3", "2M4", "2M5",
    "3M1", "3M2", "3M3", "3M4", "3M5",
    "4M1", "4M2", "4M3", "4M4",
]


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
        with urllib.request.urlopen(r, timeout=180) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {e.code}: {err}") from e


def norm(s):
    s = str(s or "")
    s = "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    )
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
    }.items():
        s = s.replace(a, b)
    s = re.sub(r"[^\w\u0600-\u06FF]+", " ", s, flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).strip()


def tokens(s):
    return [t for t in norm(s).split() if t]


def to_jpeg_data_url(path: Path) -> str:
    raw = path.read_bytes()
    mime = "image/jpeg"
    lower = path.suffix.lower()
    if lower == ".png":
        mime = "image/png"
    elif lower == ".webp":
        mime = "image/webp"
    elif lower in (".gif",):
        mime = "image/gif"

    if len(raw) <= MAX_BYTES and lower in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"

    # Compress oversized images with Pillow if available
    try:
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
            # also shrink dimensions
            w, h = img.size
            img = img.resize((max(1, w * 4 // 5), max(1, h * 4 // 5)), Image.LANCZOS)
        raise RuntimeError(f"still too large after compress: {path}")
    except ImportError:
        raise RuntimeError(f"file too large ({len(raw)} bytes) and Pillow missing: {path}")


def score(photo, stu):
    if photo["class"] != stu["class"]:
        return -1
    a, b = set(photo["toks"]), set(stu["toks"])
    if not a or not b:
        return 0
    j = len(a & b) / len(a | b)
    hit = sum(1 for t in photo["toks"] if t in stu["norm"]) / len(photo["toks"])
    seq = SequenceMatcher(None, photo["norm"], stu["norm"]).ratio()
    bonus = 0.15 if photo["toks"][0] == stu["toks"][0] else 0
    return 0.45 * j + 0.25 * hit + 0.15 * seq + bonus


def main():
    login = req("/auth/login", {"password": "AdminBBC2026"})
    token = login["token"]
    print("logged in as", login["role"])

    classes = req("/classes", token=token)
    by_code = {}
    for c in classes:
        code = (c.get("code") or "").strip().upper().replace(" ", "")
        # normalize 2م1 style isn't needed; live codes are 2M1
        if code in CLASSES:
            by_code[code] = c

    missing_folders = [c for c in CLASSES if c not in by_code]
    if missing_folders:
        print("WARN missing class codes in API:", missing_folders)

    students = []
    for code, c in by_code.items():
        for s in c.get("students") or []:
            full = f"{s.get('lastName', '')} {s.get('firstName', '')}".strip()
            if not full:
                full = (s.get("fullName") or "").strip()
            students.append(
                {
                    "id": s["id"],
                    "class": code,
                    "full": full,
                    "norm": norm(full),
                    "toks": tokens(full),
                    "hasPhoto": bool((s.get("photo") or "").strip()),
                }
            )
    print(f"students in target classes: {len(students)}")

    photos = []
    for code in CLASSES:
        folder = ROOT / code
        if not folder.is_dir():
            print("WARN missing folder", folder)
            continue
        for p in sorted(folder.iterdir()):
            if not p.is_file():
                continue
            if p.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
                continue
            stem = p.stem.strip()
            if stem.upper().replace(" ", "") == code:
                continue  # class group photo
            photos.append(
                {
                    "path": str(p),
                    "class": code,
                    "name": stem,
                    "norm": norm(stem),
                    "toks": tokens(stem),
                }
            )
    print(f"photo files: {len(photos)}")

    pairs = []
    for ph in photos:
        best = None
        best_sc = -1
        for st in students:
            sc = score(ph, st)
            if sc > best_sc:
                best_sc = sc
                best = st
        pairs.append((ph, best, best_sc))
    pairs.sort(key=lambda x: -x[2])

    used = set()
    assigned = []
    for ph, st, sc in pairs:
        if st and st["id"] not in used and sc >= MIN_SCORE:
            used.add(st["id"])
            assigned.append((ph, st, sc))

    print(f"matched pairs: {len(assigned)} (min score {MIN_SCORE})")

    ok = 0
    fail = []
    for i, (ph, st, sc) in enumerate(assigned, 1):
        try:
            data_url = to_jpeg_data_url(Path(ph["path"]))
            res = req(
                "/uploads/photo",
                {"entity": "students", "id": st["id"], "dataUrl": data_url},
                token=token,
            )
            print(
                f"OK [{i}/{len(assigned)}] {st['class']} {st['full']} <- {ph['name']} "
                f"(score {sc:.2f}) {res.get('url')}"
            )
            ok += 1
        except Exception as e:
            fail.append((st["id"], st["full"], str(e)))
            print(f"FAIL {st['class']} {st['full']}: {e}")

    unmatched_photos = [ph for ph, st, sc in pairs if not (st and st["id"] in used and sc >= MIN_SCORE)]
    # recompute unmatched photos properly
    used_paths = {ph["path"] for ph, _, _ in assigned}
    unmatched_photos = [ph for ph in photos if ph["path"] not in used_paths]
    unmatched_students = [st for st in students if st["id"] not in used]

    print(f"\nDONE ok={ok} fail={len(fail)}")
    print(f"unmatched photos: {len(unmatched_photos)}")
    for ph in unmatched_photos:
        # find best score for report
        best = max((score(ph, st), st) for st in students if st["class"] == ph["class"]) if any(
            st["class"] == ph["class"] for st in students
        ) else (-1, None)
        sc, st = best
        hint = f" best={st['full']}@{sc:.2f}" if st else ""
        print(f"  PHOTO NO MATCH: {ph['class']} {ph['name']}{hint}")

    print(f"unmatched students: {len(unmatched_students)}")
    for st in unmatched_students:
        print(f"  STUDENT NO PHOTO: {st['class']} {st['full']} {st['id']}")

    if fail:
        print("FAILURES:")
        for row in fail:
            print(" ", row)

    report = {
        "ok": ok,
        "fail": len(fail),
        "matched": len(assigned),
        "unmatched_photos": len(unmatched_photos),
        "unmatched_students": len(unmatched_students),
    }
    Path("/Users/yahyaabderrahmanemahdi/Desktop/bbc-school-admin/reports").mkdir(
        parents=True, exist_ok=True
    )
    Path(
        "/Users/yahyaabderrahmanemahdi/Desktop/bbc-school-admin/reports/photo_upload_2m4m.json"
    ).write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
