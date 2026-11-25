"""Submit Image Reference jobs (reference photo + prompt) to the Governor one at a time, poll them and download the results.

Usage: python -I gov_ref.py <jobs.json> <out_dir>
jobs.json: [{"name": "...", "reference": "path/to/ref.png", "prompt": "...", "negative": "...", "resolution": "square-1024", "seed": "7"}, ...]
Paths in "reference" are relative to the current directory. The result is saved as <out_dir>/<name>.png (existing files are skipped).
The token comes from the environment variable GOV_TOKEN, the address from GOV_URL; neither belongs in the repository.
Sibling of gov.py (text to image); this one needs multipart/form-data because of the reference file.
"""
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

URL = os.environ.get("GOV_URL", "http://sam:8080").rstrip("/")
TOKEN = os.environ["GOV_TOKEN"]


def multipart(fields, files):
    boundary = uuid.uuid4().hex
    parts = []
    for key, value in fields.items():
        parts.append(('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n' % (boundary, key)).encode() + str(value).encode("utf-8") + b"\r\n")
    for key, path in files.items():
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        head = '--%s\r\nContent-Disposition: form-data; name="%s"; filename="%s"\r\nContent-Type: %s\r\n\r\n' % (boundary, key, os.path.basename(path), ctype)
        with open(path, "rb") as fh:
            parts.append(head.encode() + fh.read() + b"\r\n")
    parts.append(("--%s--\r\n" % boundary).encode())
    return b"".join(parts), "multipart/form-data; boundary=" + boundary


def call(method, path, body=None, ctype=None):
    headers = {"Authorization": "Bearer " + TOKEN}
    if ctype:
        headers["Content-Type"] = ctype
    req = urllib.request.Request(URL + path, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.read(), r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        return e.code, e.read(), ""


def run(job, out_dir):
    name = job.pop("name")
    reference = job.pop("reference")
    target = os.path.join(out_dir, name + ".png")
    if os.path.exists(target):
        print(name, "exists, skipped", flush=True)
        return True
    body, ctype = multipart(job, {"reference_image": reference})
    status, answer, _ = call("POST", "/app/image_reference/generate", body, ctype)
    if status not in (200, 202):
        print(name, "REFUSED", status, answer[:400], flush=True)
        return False
    job_id = json.loads(answer)["job_id"]
    t0 = time.time()
    while True:
        time.sleep(2)
        status, answer, _ = call("GET", "/api/jobs/%d" % job_id)
        st = json.loads(answer)
        if st.get("finished"):
            break
        if time.time() - t0 > 900:
            call("POST", "/api/jobs/%d/cancel" % job_id, b"", "application/x-www-form-urlencoded")
            print(name, "TIMEOUT", flush=True)
            return False
    if st.get("state") != "done":
        print(name, "FAILED", st.get("state"), st.get("error"), flush=True)
        return False
    status, data, ctype = call("GET", st["files"][0]["download_url"])
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
