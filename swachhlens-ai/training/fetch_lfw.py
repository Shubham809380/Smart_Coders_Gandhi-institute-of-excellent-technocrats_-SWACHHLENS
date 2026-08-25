from huggingface_hub import hf_hub_download

p = hf_hub_download(repo_id="bitmind/lfw", filename="data/train-00000-of-00001.parquet",
                    repo_type="dataset", local_dir="training/lfw_hf")
print("downloaded ->", p)
