"""Temporary forensic helper: rank candidate commits against the approved APK.

The APK is only read (never executed, modified or re-signed). The JavaScript
bundle is Hermes bytecode whose string storage is a contiguous blob, so we
check each source string literal for substring presence (ASCII as latin-1,
non-ASCII as UTF-16LE, which is how Hermes stores them).
"""
import json, os, re, subprocess, sys, zipfile, hashlib
from datetime import datetime, timezone

APK = sys.argv[1]
OUT = sys.argv[2]
EXPECTED = "bde99a4dfcac736c08d4f59b62cf6018e2a7bae2b71f08a8fcf16df3e34d4806"
assert hashlib.sha256(open(APK, "rb").read()).hexdigest() == EXPECTED, "checksum mismatch"

z = zipfile.ZipFile(APK)
blob = z.read("assets/index.android.bundle")
app_config_raw = z.read("assets/app.config").decode("utf-8", "replace")

CLIENT = ("app/", "components/", "hooks/", "lib/", "constants/", "shared/")
EXT = (".ts", ".tsx", ".js", ".jsx")
LIT = re.compile(r'"((?:[^"\\\n]|\\.){6,200})"|\'((?:[^\'\\\n]|\\.){6,200})\'')


def git(*a):
    return subprocess.check_output(["git", *a], text=True)


def present(s):
    try:
        if s.isascii():
            return s.encode("latin-1") in blob
        return s.encode("utf-16-le") in blob
    except Exception:
        return False


blob_cache = {}


def literals_for_blob(sha):
    if sha in blob_cache:
        return blob_cache[sha]
    src = subprocess.check_output(["git", "cat-file", "blob", sha]).decode("utf-8", "replace")
    # strip line comments crudely (comments are not shipped)
    src = re.sub(r"(?m)^\s*//.*$", "", src)
    out = set()
    for m in LIT.finditer(src):
        s = m.group(1) or m.group(2)
        if "\\" in s or "${" in s:
            continue
        if s.startswith(("./", "../", "@/")):
            continue  # import specifiers are not kept as strings
        out.add(s)
    blob_cache[sha] = out
    return out


def commit_literals(c):
    lits = set()
    for line in git("ls-tree", "-r", c).splitlines():
        meta, path = line.split("\t", 1)
        if path.startswith(CLIENT) and path.endswith(EXT) and ".web." not in path:
            lits |= literals_for_blob(meta.split()[2])
    return lits


since = os.environ.get("SINCE", "2026-09-17T00:00:00Z")
until = os.environ.get("UNTIL", "2026-09-26T13:06:00Z")
revs = git("rev-list", "--all", f"--since={since}", f"--until={until}").split()
print("candidates:", len(revs))

per = {c: commit_literals(c) for c in revs}
union = set().union(*per.values())
inter = set.intersection(*per.values())
variable = union - inter
pres = {s: present(s) for s in variable}

rows = []
for c, lits in per.items():
    var = lits & variable
    missing = sorted(s for s in var if not pres[s])
    extra = sorted(s for s in variable - lits if pres[s])
    info = git("log", "-1", "--format=%h|%cI|%s", c).strip().split("|", 2)
    rows.append({"commit": c, "short": info[0], "date": info[1], "subject": info[2],
                 "missing": len(missing), "extra": len(extra), "score": len(missing) + len(extra),
                 "missing_sample": missing[:15], "extra_sample": extra[:15]})
rows.sort(key=lambda r: (r["score"], r["date"]))
for r in rows[:5]:
    r["branches"] = [b.strip() for b in git("branch", "-r", "--contains", r["commit"]).splitlines()][:6]

result = {
    "generated": datetime.now(timezone.utc).isoformat(),
    "window": [since, until],
    "candidates": len(revs),
    "variable_literals": len(variable),
    "app_config": json.loads(app_config_raw) if app_config_raw.strip().startswith("{") else app_config_raw,
    "top": rows[:12],
}
body = json.dumps(result, ensure_ascii=False, indent=1)
if len(body) > 120000:
    for r in result["top"][5:]:
        r.pop("missing_sample", None); r.pop("extra_sample", None)
    body = json.dumps(result, ensure_ascii=False, indent=1)[:120000]
open(OUT, "w").write(body)
print(body[:4000])
