"""
Train XGBoost severity model on synthetic waste data.
Run once:  python train_severity.py
Output:    checkpoints/severity_model.json
"""
import numpy as np
import xgboost as xgb
import os

np.random.seed(42)

HAZARDOUS = {4, 7}       # e_waste=4, hazardous_waste=7
HIGH_RISK = {3, 6}       # construction_debris=3, drain_blockage=6
VOL_WEIGHT = [1, 2, 3, 4]

def rule_label(wtype, vol, loc_sens, freq, age):
    score = 0.0
    if wtype in HAZARDOUS:   score += 35
    elif wtype in HIGH_RISK: score += 25
    else:                    score += 10
    score += VOL_WEIGHT[vol] * 5
    score += min(freq * 3, 15)
    score += min(age / 24 * 10, 10)
    score += loc_sens * 15
    if score >= 70: return 3
    if score >= 50: return 2
    if score >= 30: return 1
    return 0

N = 8000
X, y = [], []
for _ in range(N):
    wtype = np.random.randint(0, 9)
    vol   = np.random.randint(0, 4)
    loc   = np.random.uniform(0, 1)
    freq  = np.random.randint(1, 20)
    age   = np.random.uniform(0, 72)
    noise = np.random.normal(0, 3)
    label = rule_label(wtype, vol, loc, freq, age)
    X.append([wtype, vol, loc, freq, age])
    y.append(max(0, min(3, label + (1 if noise > 5 else -1 if noise < -5 else 0))))

X, y = np.array(X, dtype=np.float32), np.array(y, dtype=np.int32)
clf = xgb.XGBClassifier(n_estimators=120, max_depth=5, learning_rate=0.15,
                         objective="multi:softprob", num_class=4, eval_metric="mlogloss")
clf.fit(X, y)

out = os.path.join(os.path.dirname(__file__), "checkpoints", "severity_model.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
clf.save_model(out)
print(f"Saved to {out}  |  classes: {clf.classes_}  |  train acc: {clf.score(X, y):.2%}")
