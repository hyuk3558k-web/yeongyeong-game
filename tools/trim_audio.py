"""발음 파일 앞뒤의 무음을 잘라 용량을 줄인다. 사용법: python tools/trim_audio.py app/audio"""
import array, sys, wave
from pathlib import Path

THRESHOLD = 500        # 16비트 진폭 기준 무음
PAD_SEC = 0.06         # 소리 앞뒤로 남길 여유

for path in sorted(Path(sys.argv[1]).glob("*.wav")):
    with wave.open(str(path), "rb") as w:
        params = w.getparams()
        samples = array.array("h", w.readframes(w.getnframes()))
    loud = [i for i, s in enumerate(samples) if abs(s) > THRESHOLD]
    if not loud:
        continue
    pad = int(params.framerate * PAD_SEC)
    start, end = max(0, loud[0] - pad), min(len(samples), loud[-1] + pad)
    if start == 0 and end == len(samples):
        continue
    with wave.open(str(path), "wb") as w:
        w.setparams(params)
        w.writeframes(samples[start:end].tobytes())
print("trimmed")
