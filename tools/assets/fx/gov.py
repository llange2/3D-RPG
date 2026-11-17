"""Submit image jobs to the Governor one at a time, poll them and download the results.

Usage: python -I gov.py <jobs.json> <out_dir>
jobs.json: [{"name": "...", "prompt": "...", "negative": "...", "model": "...", "resolution": "...", ...}, ...]
The token comes from the environment variable GOV_TOKEN, the address from GOV_URL.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

URL = os.environ.get("GOV_URL", "http://sam:8080").rstrip("/")
TOKEN = os.environ["GOV_TOKEN"]


def call(method, path, fields=None):
    data = urllib.parse.urlencode(fields).encode() if fields is not None else None
    req = urllib.request.Request(URL + path, data=data, method=method, headers={"Authorization": "Bearer " + TOKEN})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read(), r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        return e.code, e.read(), ""


def run(job, out_dir):
    name = job.pop("name")
    target = os.path.join(out_dir, name + ".png")
    if os.path.exists(target):
        print(name, "exists, skipped", flush=True)
        return True
    status, body, _ = call("POST", "/app/image_generator/generate", job)
    if status not in (200, 202):
        print(name, "REFUSED", status, body[:400], flush=True)
        return False
    info = json.loads(body)
    job_id = info["job_id"]
    t0 = time.time()
    while True:
        time.sleep(2)
        status, body, _ = call("GET", "/api/jobs/%d" % job_id)
        st = json.loads(body)
        if st.get("finished"):
            break
        if time.time() - t0 > 900:
            call("POST", "/api/jobs/%d/cancel" % job_id, {})
            print(name, "TIMEOUT", flush=True)
            return False
    if st.get("state") != "done":
        print(name, "FAILED", st.get("state"), st.get("error"), flush=True)
        return False
    f = st["files"][0]
    status, data, ctype = call("GET", f["download_url"])
    with open(target, "wb") as fh:
        fh.write(data)
    print(name, "ok", "%.0fs" % (time.time() - t0), len(data), "bytes", ctype, flush=True)
    return True


if __name__ == "__main__":
    jobs = json.load(open(sys.argv[1], encoding="utf-8"))
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    for j in jobs:
        run(dict(j), out)
