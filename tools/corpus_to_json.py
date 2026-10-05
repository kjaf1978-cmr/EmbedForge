"""Export the VAPP-06 corpus YAML to JSON so stdlib-only tools (spikes/c) can read it."""
import json, pathlib, yaml
root = pathlib.Path(__file__).resolve().parent.parent / "docs" / "phase0"
doc = yaml.safe_load((root / "j_vapp06_corpus.yaml").read_text(encoding="utf-8"))
(root / "j_vapp06_corpus.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False, default=str), encoding="utf-8")
print(f"wrote {len(doc['entries'])} entries")
