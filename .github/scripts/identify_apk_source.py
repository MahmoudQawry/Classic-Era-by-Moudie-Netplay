"""Temporary forensic helper: rank candidate commits against the approved APK.

The APK is only read (never executed, modified or re-signed). Hermes stores
strings in one contiguous blob (ASCII as latin-1, others as UTF-16LE), so each
source literal is checked for substring presence.
"""
import hashlib, json, os, subprocess, sys, zipfile
from datetime import datetime, timezone

APK, OUT = sys.argv[1], sys.argv[2]
assert hashlib.sha256(open(APK, "rb").read()).hexdigest() == "bde99a4dfcac736c08d4f59b62cf6018e2a7bae2b71f08a8fcf16df3e34d4806"
blob = zipfile.ZipFile(APK).read("assets/index.android.bundle")
CLIENT = ("app/", "components/", "hooks/", "lib/", "constants/", "shared/")
EXT = (".ts", ".tsx", ".js", ".jsx")
git = lambda *a: subprocess.check_output(["git", *a], text=True)

def norm_cfg(c):
    try:
        s = subprocess.check_output(["git", "show", f"{c}:app.config.ts"], text=True, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        return None
    return "\n".join(l for l in s.splitlines() if 'version: "' not in l and "versionCode:" not in l)

ref = norm_cfg("b7181d5")
cands = git("rev-list", "--all", "--since=2026-09-17", "--until=2026-09-26T13:06:00Z").split()
cfg_match = {c: norm_cfg(c) == ref for c in cands}
print("candidates", len(cands))

trees, blobs = {}, set()
for c in cands:
    files = {}
    for line in git("ls-tree", "-r", c).splitlines():
        meta, p = line.split("\t", 1)
        if p.startswith(CLIENT) and p.endswith(EXT) and ".web." not in p and ".test." not in p:
            files[p] = meta.split()[2]
    trees[c] = files
    blobs |= set(files.values())
os.makedirs("/tmp/blobs", exist_ok=True)
for b in blobs:
    with open(f"/tmp/blobs/{b}", "wb") as fh:
        fh.write(subprocess.check_output(["git", "cat-file", "blob", b]))
subprocess.check_call(["node", ".github/scripts/extract_literals.cjs", "/tmp/blobs", "/tmp/lits.json"])
lits = {k: set(v) for k, v in json.load(open("/tmp/lits.json")).items()}

def present(s):
    return (s.encode("latin-1") if s.isascii() else s.encode("utf-16-le")) in blob

per = {c: set().union(*(lits[b] for b in f.values())) for c, f in trees.items()}
union, inter = set().union(*per.values()), set.intersection(*per.values())
variable = union - inter
pres = {s: present(s) for s in variable}
base_missing = sum(1 for s in inter if not present(s))
rows = []
for c, L in per.items():
    miss = sorted(s for s in L & variable if not pres[s])
    extra = sorted(s for s in variable - L if pres[s])
    h, d, subj = git("log", "-1", "--format=%h|%cI|%s", c).strip().split("|", 2)
    rows.append(dict(cfg=cfg_match[c], commit=c, short=h, date=d, subject=subj, missing=len(miss), extra=len(extra),
                     score=len(miss) + len(extra), missing_sample=miss[:25], extra_sample=extra[:25]))
rows.sort(key=lambda r: (r["score"], r["date"]))
for r in rows[:8]:
    r["branches"] = [b.strip() for b in git("branch", "-r", "--contains", r["commit"]).splitlines()][:8]
# per-file: which historical version of each client file best matches the bundle
paths = {}
for f in trees.values():
    for p_, b in f.items():
        paths.setdefault(p_, set()).add(b)
best_top = rows[0]["commit"]
perfile = []
for p_, bs in paths.items():
    bs = list(bs)
    if len(bs) < 2:
        continue
    u = set().union(*(lits[b] for b in bs)); i = set.intersection(*(lits[b] for b in bs)); v = u - i
    sc = []
    for b in bs:
        m = [s_ for s_ in lits[b] & v if not present(s_)]
        e = [s_ for s_ in v - lits[b] if present(s_)]
        sc.append((len(m) + len(e), b, m[:6], e[:6]))
    sc.sort(key=lambda x: x[0])
    top_blob = trees[best_top].get(p_)
    top_score = next((x[0] for x in sc if x[1] == top_blob), None)
    if top_blob is None or top_score != sc[0][0]:
        first = git("log", "--all", "--format=%h %cI %s", "--find-object=" + sc[0][1], "-1").strip()
        perfile.append(dict(path=p_, best=sc[0][0], best_blob=sc[0][1], best_first=first, top_commit_score=top_score,
                            top_missing=next((x[2] for x in sc if x[1] == top_blob), None),
                            top_extra=next((x[3] for x in sc if x[1] == top_blob), None)))
res = dict(perfile=perfile, generated=datetime.now(timezone.utc).isoformat(), candidates=len(cands), variable=len(variable),
           common=len(inter), common_missing=base_missing, top=rows[:30])
body = json.dumps(res, ensure_ascii=False, indent=1)
open(OUT, "w").write(body[:124000])
print(body[:3000])
