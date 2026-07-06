"""Fetch media listed in media/manifest.json; optionally extract video frames with ffmpeg.

Runs inside GitHub Actions (runners have unrestricted egress + ffmpeg preinstalled).
Each manifest item: {"url": str, "out": str, "frames": {"dir", "fps"?, "width"?, "quality"?}?, "discard"?: bool}
"""
import json
import pathlib
import subprocess
import urllib.request

manifest = json.load(open("media/manifest.json"))

for item in manifest["items"]:
    out = pathlib.Path(item["out"])
    out.parent.mkdir(parents=True, exist_ok=True)
    print(f"fetching {item['url']} -> {out}", flush=True)
    req = urllib.request.Request(item["url"], headers={"User-Agent": "media-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(out, "wb") as f:
        f.write(r.read())

    frames = item.get("frames")
    if frames:
        fdir = pathlib.Path(frames["dir"])
        fdir.mkdir(parents=True, exist_ok=True)
        vf_parts = []
        if frames.get("fps"):
            vf_parts.append(f"fps={frames['fps']}")
        vf_parts.append(f"scale={frames.get('width', 1536)}:-2")
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(out),
                "-vf", ",".join(vf_parts),
                "-q:v", str(frames.get("quality", 4)),
                str(fdir / "frame_%04d.jpg"),
            ],
            check=True,
        )
        count = len(list(fdir.glob("frame_*.jpg")))
        (fdir / "index.json").write_text(json.dumps({"count": count}))
        print(f"extracted {count} frames -> {fdir}")

    if item.get("webm"):
        wout = pathlib.Path(item["webm"])
        wout.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(out), "-c:v", "libvpx-vp9", "-crf", "34",
             "-b:v", "0", "-row-mt", "1", "-an", str(wout)],
            check=True,
        )

    for sidx, stime in enumerate(item.get("stills", [])):
        sdir = pathlib.Path("media/stills")
        sdir.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(stime), "-i", str(out), "-frames:v", "1",
             "-q:v", "3", str(sdir / f"{out.stem}_{sidx}.jpg")],
            check=True,
        )

    if item.get("discard"):
        out.unlink()

print("done")
