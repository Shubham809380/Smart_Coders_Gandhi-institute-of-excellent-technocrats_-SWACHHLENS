"""Smoke test for the new BCE multi-label training path (no full epoch)."""
import sys
sys.path.insert(0, "training")

import torch
from torch.utils.data import DataLoader, ConcatDataset

from train_classifier import (seed_everything, load_manifest, load_nonwaste_records,
                              PileMixDataset, MultiLabelDataset, NonWasteDataset,
                              make_model, DEVICE)

seed_everything()
classes, c2i, by_split, w = load_manifest()
nw_train, nw_val = load_nonwaste_records()
print(f"negatives: {len(nw_train)} train / {len(nw_val)} val")
assert all(r["split"] == "train" for r in nw_train)
assert not (set(r["path"] for r in nw_train) & set(r["path"] for r in nw_val)), "leak!"

base_tr = PileMixDataset(by_split["train"][:48], c2i, 192, pile_prob=0.5)
n_out = len(classes) + 1
ds = ConcatDataset([MultiLabelDataset(base_tr, len(classes)),
                    NonWasteDataset(nw_train[:24], 192, len(classes))])
dl = DataLoader(ds, batch_size=12, shuffle=True)
x, y = next(iter(dl))
print("batch:", tuple(x.shape), tuple(y.shape))
assert y.shape == (12, n_out)
nw_rows = y[:, -1].sum().item()          # non_waste slot fires only on negatives
print("non_waste actives in batch:", nw_rows)

seq, fd = make_model("efficientnet_b0", n_out)
model = torch.nn.Sequential(seq, torch.nn.Sequential(
    torch.nn.Dropout(0.2), torch.nn.Linear(fd, n_out))).to(DEVICE)
out = model(x.to(DEVICE)[:4])
assert out.shape == (4, n_out), out.shape
crit = torch.nn.BCEWithLogitsLoss(pos_weight=torch.ones(n_out).to(DEVICE))
loss = crit(out, y.to(DEVICE)[:4])
loss.backward()
print(f"forward/backward OK, loss={float(loss):.4f}")

# pos_weight computation path (same formula as fine_tune)
counts = torch.zeros(n_out); total = 0
for _, yy in DataLoader(ds, batch_size=64, shuffle=False):
    counts += (yy > 0.1).sum(0).float(); total += yy.shape[0]
pw = ((total - counts) / counts.clamp(min=1)).sqrt().clamp(0.5, 5.0)
print("pos_weight sample:", [round(v, 2) for v in pw.tolist()])
print("SMOKE OK")
