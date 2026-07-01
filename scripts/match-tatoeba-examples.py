import ahocorasick
import bz2
import json
import os
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORPUS = Path(os.environ.get("TATOEBA_ENG_CORPUS", Path(os.environ["TEMP"]) / "eng_sentences.tsv.bz2"))
ENRICHMENT = ROOT / "data" / "vocabulary-enrichment.json"
SEED = ROOT / "vocabulary-data.js"
GENERIC_PREFIXES = ("In her notes, she chose", "During the discussion, she used")


def load_seed():
    source = SEED.read_text(encoding="utf-8")
    payload = source.split("const VOCABULARY_SEED = ", 1)[1].split(";\n\nconst VOCABULARY_META", 1)[0]
    return json.loads(payload)


def answer_term(term):
    value = term.strip()
    match = re.match(r"^\([^)]*\)\s*(.+)$", value)
    if match:
        value = match.group(1)
    value = re.sub(r"\s*\([^)]*(?:no |noun|adj|verb|adverb)[^)]*\)\s*$", "", value, flags=re.I).strip()
    return re.split(r"\s+/\s+|/|::", value)[0].strip()


def clean_variant(value):
    value = value.lower().replace("’", "'").replace("‘", "'")
    value = re.sub(r"\((?:something|someone|somebody|sth|sb)[^)]*\)", "", value, flags=re.I)
    value = re.sub(r"\b(?:something|someone|somebody|sth|sb|one's|your)\b", "", value, flags=re.I)
    value = re.sub(r"[^a-z0-9' -]", " ", value)
    return re.sub(r"\s+", " ", value).strip(" -")


def variants(term):
    base = clean_variant(answer_term(term))
    output = {base}
    if " " not in base and len(base) >= 4:
        if base.endswith("e"):
            output.add(base[:-1] + "ing")
            output.add(base + "d")
        else:
            output.add(base + "ing")
            output.add(base + "ed")
        output.add(base + "s")
        output.add(base + "es")
        if base.endswith("y"):
            output.add(base[:-1] + "ies")
    irregular = {"catch": "caught", "throw": "threw", "swell": "swollen", "get": "got", "go": "went", "take": "took", "make": "made"}
    if base in irregular:
        output.add(irregular[base])
    return {item for item in output if len(item) >= 3}


def boundary_ok(text, start, end):
    left = start == 0 or not text[start - 1].isalnum()
    right = end == len(text) or not text[end].isalnum()
    return left and right


def sentence_score(sentence):
    words = sentence.split()
    score = 100 - abs(len(words) - 14) * 3
    if sentence[0].isupper():
        score += 8
    if sentence.endswith((".", "!", "?")):
        score += 8
    if any(marker in sentence.lower() for marker in ("http", "@", " tatoeba", "tom said that tom")):
        score -= 100
    return score


def main():
    seed = {item["id"]: item for item in load_seed()}
    enrichment = json.loads(ENRICHMENT.read_text(encoding="utf-8"))
    quality_mode = "--quality" in os.sys.argv

    def needs_example(entry_id, value):
        example = value.get("example", "").strip()
        if example.startswith(GENERIC_PREFIXES):
            return True
        if not quality_mode or "My Vocabulary List" in seed[entry_id].get("sources", []):
            return False
        return len(example.split()) < 7 or not example.endswith((".", "!", "?", "\"", "”", "’"))

    targets = {
        entry_id: {**seed[entry_id], "term": value.get("term") or seed[entry_id]["term"]}
        for entry_id, value in enrichment.items()
        if needs_example(entry_id, value)
    }

    variant_to_ids = defaultdict(list)
    for entry_id, entry in targets.items():
        for variant in variants(entry["term"]):
            variant_to_ids[variant].append(entry_id)

    automaton = ahocorasick.Automaton()
    for variant, ids in variant_to_ids.items():
        automaton.add_word(variant, (variant, ids))
    automaton.make_automaton()

    candidates = defaultdict(list)
    with bz2.open(CORPUS, "rt", encoding="utf-8") as corpus:
        for line_number, line in enumerate(corpus, 1):
            try:
                _, _, sentence = line.rstrip("\n").split("\t", 2)
            except ValueError:
                continue
            minimum_words = 8 if quality_mode else 5
            if not minimum_words <= len(sentence.split()) <= 28:
                continue
            lowered = sentence.lower().replace("’", "'").replace("‘", "'")
            seen_ids = set()
            for end_index, (variant, ids) in automaton.iter(lowered):
                start_index = end_index - len(variant) + 1
                if not boundary_ok(lowered, start_index, end_index + 1):
                    continue
                for entry_id in ids:
                    if entry_id in seen_ids or len(candidates[entry_id]) >= 10:
                        continue
                    seen_ids.add(entry_id)
                    candidates[entry_id].append((sentence_score(sentence), sentence))
            if line_number % 500000 == 0:
                print(f"Scanned {line_number:,} sentences; matched {len(candidates):,}/{len(targets):,} entries", flush=True)

    used = {
        value.get("example", "")
        for entry_id, value in enrichment.items()
        if entry_id not in targets and value.get("example")
    }
    matched = 0
    for entry_id in sorted(targets, key=lambda item: len(candidates[item])):
        options = sorted(candidates[entry_id], reverse=True)
        chosen = next((sentence for _, sentence in options if sentence not in used), None)
        if not chosen:
            continue
        enrichment[entry_id]["example"] = chosen
        enrichment[entry_id]["exampleSource"] = "tatoeba"
        used.add(chosen)
        matched += 1

    ENRICHMENT.write_text(json.dumps(enrichment, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"targets": len(targets), "matched": matched, "remaining": len(targets) - matched, "uniqueSentences": len(used)}, indent=2))


if __name__ == "__main__":
    main()
