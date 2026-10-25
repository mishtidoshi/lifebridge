"""Train LifeBridge's fact-reading models (engine/ml/) and save them in models/.

    python tools/train_models.py              # every pack
    python tools/train_models.py medicaid     # one pack

Run this after changing a pack's questions or phrases. Training uses only sentences made from
each pack's own phrases (engine/ml/training_data.py), takes about a minute, and needs no
internet or AI service. tests/unit/test_ml.py fails if a saved model is out of date.
"""

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from engine.ml.fact_model import MODEL_DIR, PackModels  # noqa: E402
from engine.ml.training_data import examples  # noqa: E402
from engine.pack_loader import load_all_packs  # noqa: E402


def main(only):
    packs = load_all_packs(ROOT / "packs")
    for pack_id, pack in packs.items():
        if only and pack_id not in only:
            continue
        start = time.time()
        models = PackModels.train(pack)
        models.save()
        size = (MODEL_DIR / f"{pack_id}.json").stat().st_size // 1024
        print(f"{pack_id}: {len(models.models)} models from {len(examples(pack))} sentences "
              f"in {time.time() - start:.0f}s ({size} KB)")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
