#!/usr/bin/env python3
"""
VHM Data Collection Pipeline
Collects music performance data from MusicBrainz API and Wikidata SPARQL
for the Visual History of Music project.
"""

import json
import time
import uuid
import os
import sys
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
import urllib.request
import urllib.parse
import urllib.error

# ─── Configuration ────────────────────────────────────────────────────────────
BASE_DIR = Path("/home/user/workspace/vhm-data")
OUTPUT_FILE = BASE_DIR / "performances.json"
INTERMEDIATE_FILE = BASE_DIR / "intermediate_results.json"
SEED_FILE = BASE_DIR / "seed_artists.json"
LOG_FILE = BASE_DIR / "collect_data.log"

MB_BASE = "https://musicbrainz.org/ws/2"
WD_SPARQL = "https://query.wikidata.org/sparql"
USER_AGENT = "VHM-DataCollector/1.0 (igwana@gmail.com)"
MB_DELAY = 1.1   # seconds between MusicBrainz requests
WD_DELAY = 1.5   # seconds between Wikidata requests

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("vhm")

# ─── HTTP helpers ─────────────────────────────────────────────────────────────
_last_mb_request = 0.0
_last_wd_request = 0.0

def _get(url: str, delay: float, extra_headers: dict = None) -> dict | None:
    """Generic rate-limited GET returning parsed JSON (or None on error)."""
    global _last_mb_request, _last_wd_request
    now = time.time()
    if delay == MB_DELAY:
        wait = delay - (now - _last_mb_request)
    else:
        wait = delay - (now - _last_wd_request)
    if wait > 0:
        time.sleep(wait)

    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if extra_headers:
        headers.update(extra_headers)

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
        if delay == MB_DELAY:
            _last_mb_request = time.time()
        else:
            _last_wd_request = time.time()
        return json.loads(raw)
    except urllib.error.HTTPError as e:
        if e.code == 503:
            log.warning(f"503 from {url[:80]}… — backing off 10s")
            time.sleep(10)
        elif e.code == 429:
            log.warning(f"429 from {url[:80]}… — backing off 30s")
            time.sleep(30)
        else:
            log.warning(f"HTTP {e.code} for {url[:80]}")
        return None
    except Exception as e:
        log.warning(f"Request error for {url[:80]}: {e}")
        return None

def mb_get(path: str, params: dict) -> dict | None:
    params["fmt"] = "json"
    qs = urllib.parse.urlencode(params)
    url = f"{MB_BASE}/{path}?{qs}"
    return _get(url, MB_DELAY)

def wd_sparql(query: str) -> dict | None:
    params = {"query": query, "format": "json"}
    qs = urllib.parse.urlencode(params)
    url = f"{WD_SPARQL}?{qs}"
    return _get(url, WD_DELAY, {"Accept": "application/sparql-results+json"})

# ─── MusicBrainz functions ────────────────────────────────────────────────────
def search_artist(name: str) -> dict | None:
    """Search MusicBrainz for an artist by name; return best match."""
    result = mb_get("artist", {"query": f'artist:"{name}"', "limit": 5})
    if not result or "artists" not in result or not result["artists"]:
        # fallback: looser search
        result = mb_get("artist", {"query": name, "limit": 5})
    if not result or "artists" not in result:
        return None
    artists = result["artists"]
    if not artists:
        return None
    # Prefer exact or high-score match
    for a in artists:
        if a.get("name", "").lower() == name.lower():
            return a
    return artists[0]

def get_artist_details(mbid: str) -> dict | None:
    """Get artist details including relationships."""
    return mb_get(f"artist/{mbid}", {
        "inc": "artist-rels+tags+ratings+url-rels",
        "limit": 100,
    })

def get_artist_recordings(mbid: str, limit: int = 15) -> list:
    """Get top recordings for an artist."""
    result = mb_get("recording", {
        "query": f"arid:{mbid}",
        "limit": limit,
    })
    if not result or "recordings" not in result:
        return []
    return result["recordings"]

def parse_year(date_str: str | None) -> int | None:
    if not date_str:
        return None
    m = re.match(r"(\d{4})", date_str)
    return int(m.group(1)) if m else None

def extract_relationships(details: dict) -> tuple[list, list]:
    """Return (influenced_by_names, influenced_names) from artist-rels."""
    influenced_by = []
    influenced = []
    for rel in details.get("relations", []):
        rel_type = rel.get("type", "").lower()
        artist = rel.get("artist", {})
        target_name = artist.get("name", "")
        if not target_name:
            continue
        direction = rel.get("direction", "")
        # "influenced by" / "influence" relationship
        if "influenced" in rel_type:
            if direction == "backward" or rel_type == "influenced by":
                influenced_by.append(target_name)
            else:
                influenced.append(target_name)
        elif rel_type == "teacher":
            if direction == "backward":
                influenced_by.append(target_name)
        elif rel_type == "member of band":
            pass  # skip band membership
    return influenced_by, influenced

# ─── Wikidata functions ───────────────────────────────────────────────────────
def get_wikidata_by_mbid(mbid: str) -> dict | None:
    """Query Wikidata for artist info using their MusicBrainz ID."""
    query = f"""
SELECT DISTINCT ?item ?itemLabel ?birthDate ?deathDate ?nationality ?nationalityLabel
       ?influenced_byLabel ?influencedLabel ?award ?awardLabel ?description
WHERE {{
  ?item wdt:P434 "{mbid}" .
  OPTIONAL {{ ?item wdt:P569 ?birthDate . }}
  OPTIONAL {{ ?item wdt:P570 ?deathDate . }}
  OPTIONAL {{ ?item wdt:P27 ?nationality . }}
  OPTIONAL {{ ?item wdt:P737 ?influenced_by . }}
  OPTIONAL {{ ?item wdt:P8734 ?influenced . }}
  OPTIONAL {{ ?item wdt:P166 ?award . }}
  OPTIONAL {{ ?item schema:description ?description . FILTER(LANG(?description) = "en") }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en" . }}
}}
LIMIT 30
"""
    return wd_sparql(query)

def get_wikidata_by_name(artist_name: str) -> dict | None:
    """Fallback: query Wikidata by artist name for basic info."""
    safe_name = artist_name.replace('"', '\\"')
    query = f"""
SELECT DISTINCT ?item ?itemLabel ?birthDate ?deathDate ?nationalityLabel
       ?influenced_byLabel ?awardLabel ?description
WHERE {{
  ?item wdt:P31 wd:Q5 ;
        rdfs:label "{safe_name}"@en .
  OPTIONAL {{ ?item wdt:P569 ?birthDate . }}
  OPTIONAL {{ ?item wdt:P570 ?deathDate . }}
  OPTIONAL {{ ?item wdt:P27 ?nationality . }}
  OPTIONAL {{ ?item wdt:P737 ?influenced_by . }}
  OPTIONAL {{ ?item wdt:P166 ?award . }}
  OPTIONAL {{ ?item schema:description ?description . FILTER(LANG(?description) = "en") }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en" . }}
}}
LIMIT 10
"""
    return wd_sparql(query)

def parse_wikidata_results(wd_result: dict | None) -> dict:
    """Parse Wikidata SPARQL results into a clean dict."""
    out = {
        "wikidata_id": None,
        "birth_year": None,
        "death_year": None,
        "nationality": None,
        "influenced_by": [],
        "influenced": [],
        "awards": [],
        "description": None,
    }
    if not wd_result:
        return out
    bindings = wd_result.get("results", {}).get("bindings", [])
    if not bindings:
        return out

    row0 = bindings[0]
    # Wikidata QID
    if "item" in row0:
        item_uri = row0["item"].get("value", "")
        m = re.search(r"(Q\d+)$", item_uri)
        if m:
            out["wikidata_id"] = m.group(1)
    # Birth/death
    if "birthDate" in row0:
        out["birth_year"] = parse_year(row0["birthDate"].get("value"))
    if "deathDate" in row0:
        out["death_year"] = parse_year(row0["deathDate"].get("value"))
    # Nationality — use first row's value
    if "nationalityLabel" in row0:
        out["nationality"] = row0["nationalityLabel"].get("value", None)
    # Description
    for row in bindings:
        if "description" in row and not out["description"]:
            out["description"] = row["description"].get("value", None)

    # Collect all influences and awards across rows
    inf_by_seen, inf_seen, award_seen = set(), set(), set()
    for row in bindings:
        if "influenced_byLabel" in row:
            v = row["influenced_byLabel"].get("value", "")
            if v and v not in inf_by_seen:
                inf_by_seen.add(v)
                out["influenced_by"].append(v)
        if "influencedLabel" in row:
            v = row["influencedLabel"].get("value", "")
            if v and v not in inf_seen:
                inf_seen.add(v)
                out["influenced"].append(v)
        if "awardLabel" in row:
            v = row["awardLabel"].get("value", "")
            if v and v not in award_seen:
                award_seen.add(v)
                out["awards"].append(v)
    return out

# ─── Significance score ───────────────────────────────────────────────────────
def compute_significance(seed_sig: float, wd_data: dict, mb_rels_count: int) -> float:
    """Blend seed significance with enrichment signals."""
    score = seed_sig
    # Boost for Wikidata influences
    inf_count = len(wd_data.get("influenced_by", [])) + len(wd_data.get("influenced", []))
    score += min(0.05, inf_count * 0.005)
    # Boost for awards
    award_count = len(wd_data.get("awards", []))
    score += min(0.05, award_count * 0.004)
    # Boost for MB relationship richness
    score += min(0.03, mb_rels_count * 0.002)
    return round(min(1.0, score), 4)

# ─── Decade helper ────────────────────────────────────────────────────────────
def decade_for(year: int | None, seed_decade: str) -> str:
    if year and year >= 1920:
        return f"{(year // 10) * 10}s"
    return seed_decade

# ─── Intermediate state ───────────────────────────────────────────────────────
def load_intermediate() -> dict:
    if INTERMEDIATE_FILE.exists():
        try:
            with open(INTERMEDIATE_FILE) as f:
                data = json.load(f)
            log.info(f"Resuming from intermediate: {len(data.get('performances', []))} performances, "
                     f"{len(data.get('artists', []))} artists processed")
            return data
        except Exception as e:
            log.warning(f"Could not load intermediate: {e}")
    return {"performances": [], "artists": [], "processed_names": []}

def save_intermediate(state: dict):
    with open(INTERMEDIATE_FILE, "w") as f:
        json.dump(state, f)

# ─── Main pipeline ────────────────────────────────────────────────────────────
def main():
    log.info("=== VHM Data Collection Pipeline starting ===")
    start_time = time.time()

    # Load seed artists
    with open(SEED_FILE) as f:
        seed_data = json.load(f)
    seed_artists = seed_data["artists"]
    # De-duplicate by name
    seen_names = {}
    unique_seeds = []
    for s in seed_artists:
        nm = s["name"].lower()
        if nm not in seen_names:
            seen_names[nm] = True
            unique_seeds.append(s)
    log.info(f"Loaded {len(unique_seeds)} unique seed artists")

    # Load intermediate state
    state = load_intermediate()
    performances = state["performances"]
    artists_out = state["artists"]
    processed_names = set(n.lower() for n in state["processed_names"])

    # Index already-added performances by recording MBID to avoid dupes
    existing_perf_ids = set(p.get("source_id", p.get("id")) for p in performances)

    genres_set = set()
    decades_set = set()

    for perf in performances:
        genres_set.add(perf.get("genre", ""))
        decades_set.add(perf.get("decade", ""))

    for idx, seed in enumerate(unique_seeds):
        artist_name = seed["name"]
        if artist_name.lower() in processed_names:
            log.info(f"  [{idx+1}/{len(unique_seeds)}] SKIP (already done): {artist_name}")
            continue

        log.info(f"  [{idx+1}/{len(unique_seeds)}] Processing: {artist_name} ({seed['genre']})")

        # ── MusicBrainz: search artist ────────────────────────────────────────
        mb_artist = search_artist(artist_name)
        if not mb_artist:
            log.warning(f"    No MB result for: {artist_name}")
            # Still add minimal artist entry from seed data
            artist_entry = {
                "mbid": None,
                "name": artist_name,
                "birth_year": None,
                "death_year": None,
                "genres": [seed["genre"]],
                "subgenre": seed.get("subgenre"),
                "nationality": seed.get("nationality"),
                "influenced_by": [],
                "influenced": [],
                "awards": [],
                "wikidata_id": None,
                "significance": seed["significance"],
            }
            artists_out.append(artist_entry)
            processed_names.add(artist_name.lower())
            save_intermediate({
                "performances": performances,
                "artists": artists_out,
                "processed_names": list(processed_names),
            })
            continue

        mbid = mb_artist.get("id")
        mb_name = mb_artist.get("name", artist_name)
        mb_tags = [t["name"] for t in mb_artist.get("tags", [])]
        life_span = mb_artist.get("life-span", {})
        mb_birth_year = parse_year(life_span.get("begin"))
        mb_death_year = parse_year(life_span.get("end"))
        mb_country = mb_artist.get("country", seed.get("nationality"))

        # ── MusicBrainz: artist details (relationships) ───────────────────────
        mb_details = None
        mb_inf_by, mb_inf = [], []
        mb_rels_count = 0
        if mbid:
            mb_details = get_artist_details(mbid)
            if mb_details:
                mb_inf_by, mb_inf = extract_relationships(mb_details)
                mb_rels_count = len(mb_details.get("relations", []))

        # ── Wikidata enrichment ───────────────────────────────────────────────
        wd_data = {"wikidata_id": None, "birth_year": None, "death_year": None,
                   "nationality": None, "influenced_by": [], "influenced": [],
                   "awards": [], "description": None}
        if mbid:
            wd_raw = get_wikidata_by_mbid(mbid)
            wd_data = parse_wikidata_results(wd_raw)

        # If Wikidata returned nothing via MBID, try by name
        if not wd_data["wikidata_id"]:
            wd_raw2 = get_wikidata_by_name(artist_name)
            wd_data2 = parse_wikidata_results(wd_raw2)
            if wd_data2["wikidata_id"]:
                wd_data = wd_data2

        # Merge influence chains (prefer Wikidata, supplement from MB)
        inf_by_merged = wd_data["influenced_by"] or mb_inf_by
        inf_merged = wd_data["influenced"] or mb_inf

        # Nationality: prefer Wikidata, fall back to MB country, then seed
        nationality = wd_data.get("nationality") or mb_country or seed.get("nationality")
        birth_year = wd_data.get("birth_year") or mb_birth_year
        death_year = wd_data.get("death_year") or mb_death_year

        # ── Significance score ────────────────────────────────────────────────
        sig = compute_significance(seed["significance"], wd_data, mb_rels_count)

        # ── Artist entry ──────────────────────────────────────────────────────
        artist_entry = {
            "mbid": mbid,
            "name": mb_name,
            "birth_year": birth_year,
            "death_year": death_year,
            "genres": [seed["genre"]],
            "subgenre": seed.get("subgenre"),
            "nationality": nationality,
            "influenced_by": inf_by_merged[:10],
            "influenced": inf_merged[:10],
            "awards": wd_data["awards"][:10],
            "wikidata_id": wd_data.get("wikidata_id"),
            "significance": sig,
            "tags": mb_tags[:15],
        }
        artists_out.append(artist_entry)

        # ── MusicBrainz: recordings ───────────────────────────────────────────
        recordings = []
        if mbid:
            recordings = get_artist_recordings(mbid, limit=12)

        if recordings:
            for rec in recordings:
                rec_id = rec.get("id", "")
                if rec_id in existing_perf_ids:
                    continue

                rec_title = rec.get("title", "")
                if not rec_title:
                    continue

                # Parse first release year
                first_release = rec.get("first-release-date") or rec.get("date", "")
                rec_year = parse_year(first_release)
                # Fallback: use seed decade midpoint
                if not rec_year:
                    decade_str = seed.get("decade", "1960s")
                    try:
                        rec_year = int(decade_str.replace("s", "")) + 5
                    except Exception:
                        rec_year = 1965

                rec_decade = decade_for(rec_year, seed.get("decade", "1960s"))
                genres_set.add(seed["genre"])
                decades_set.add(rec_decade)

                # Tags from recording
                rec_tags = [t["name"] for t in rec.get("tags", [])][:10]
                if not rec_tags:
                    rec_tags = mb_tags[:5]

                perf = {
                    "id": str(uuid.uuid4()),
                    "source_id": rec_id,
                    "title": rec_title,
                    "artist": mb_name,
                    "artist_mbid": mbid,
                    "year": rec_year,
                    "decade": rec_decade,
                    "genre": seed["genre"],
                    "subgenre": seed.get("subgenre", ""),
                    "description": wd_data.get("description") or seed.get("known_for", ""),
                    "youtube_search_query": f"{mb_name} - {rec_title} live performance",
                    "influence_chain": inf_by_merged[:5],
                    "influenced": inf_merged[:5],
                    "awards": wd_data["awards"][:5],
                    "nationality": nationality,
                    "tags": rec_tags,
                    "significance_score": sig,
                    "wikidata_id": wd_data.get("wikidata_id"),
                }
                performances.append(perf)
                existing_perf_ids.add(rec_id)
        else:
            # No recordings found — add a stub entry from seed data
            rec_decade_str = seed.get("decade", "1960s")
            try:
                rec_year = int(rec_decade_str.replace("s", "")) + 5
            except Exception:
                rec_year = 1965
            rec_decade = rec_decade_str
            genres_set.add(seed["genre"])
            decades_set.add(rec_decade)

            # Create a stub performance from known_for info
            known_for = seed.get("known_for", "")
            if known_for:
                stub_titles = [t.strip() for t in known_for.split(",")][:3]
                for stub_title in stub_titles:
                    if not stub_title:
                        continue
                    perf = {
                        "id": str(uuid.uuid4()),
                        "source_id": f"stub-{mbid or artist_name.lower().replace(' ', '-')}-{stub_title[:20]}",
                        "title": stub_title,
                        "artist": mb_name,
                        "artist_mbid": mbid,
                        "year": rec_year,
                        "decade": rec_decade,
                        "genre": seed["genre"],
                        "subgenre": seed.get("subgenre", ""),
                        "description": wd_data.get("description") or f"Iconic {seed['genre']} recording by {artist_name}",
                        "youtube_search_query": f"{mb_name} - {stub_title} live performance",
                        "influence_chain": inf_by_merged[:5],
                        "influenced": inf_merged[:5],
                        "awards": wd_data["awards"][:5],
                        "nationality": nationality,
                        "tags": mb_tags[:5] or [seed["genre"].lower(), seed.get("subgenre", "").lower()],
                        "significance_score": sig,
                        "wikidata_id": wd_data.get("wikidata_id"),
                    }
                    performances.append(perf)

        processed_names.add(artist_name.lower())
        log.info(f"    → {len(recordings)} recordings, WD: {wd_data.get('wikidata_id')}, "
                 f"influences: {len(inf_by_merged)}, awards: {len(wd_data['awards'])}")

        # Save intermediate every 5 artists
        if (idx + 1) % 5 == 0:
            save_intermediate({
                "performances": performances,
                "artists": artists_out,
                "processed_names": list(processed_names),
            })
            log.info(f"  Checkpoint: {len(performances)} performances so far")

    # ── Build influence graph ────────────────────────────────────────────────
    log.info("Building influence graph...")
    artist_name_to_mbid = {a["name"].lower(): a["mbid"] for a in artists_out if a.get("mbid")}

    graph_nodes = []
    graph_edges = []
    edge_set = set()
    node_set = set()

    for artist in artists_out:
        if artist["mbid"] and artist["mbid"] not in node_set:
            graph_nodes.append({
                "id": artist["mbid"],
                "name": artist["name"],
                "genre": artist["genres"][0] if artist["genres"] else "",
                "birth_year": artist.get("birth_year"),
            })
            node_set.add(artist["mbid"])

    for artist in artists_out:
        src = artist.get("mbid")
        if not src:
            continue
        for inf_name in artist.get("influenced_by", []):
            tgt = artist_name_to_mbid.get(inf_name.lower())
            if tgt and (src, tgt) not in edge_set:
                graph_edges.append({"source": src, "target": tgt, "type": "influenced_by"})
                edge_set.add((src, tgt))
        for inf_name in artist.get("influenced", []):
            tgt = artist_name_to_mbid.get(inf_name.lower())
            if tgt and (src, tgt) not in edge_set:
                graph_edges.append({"source": src, "target": tgt, "type": "influenced"})
                edge_set.add((src, tgt))

    # ── Assemble final output ─────────────────────────────────────────────────
    elapsed = round(time.time() - start_time, 1)
    now_iso = datetime.now(timezone.utc).isoformat()

    # Sort performances by year
    performances.sort(key=lambda p: (p.get("year") or 0))

    # Clean up internal source_id field (not part of spec)
    for p in performances:
        p.pop("source_id", None)

    out = {
        "meta": {
            "count": len(performances),
            "artist_count": len(artists_out),
            "genres": sorted(g for g in genres_set if g),
            "decades": sorted(d for d in decades_set if d),
            "generated_at": now_iso,
            "elapsed_seconds": elapsed,
            "pipeline": "VHM-DataCollector/1.0",
            "sources": ["MusicBrainz API", "Wikidata SPARQL"],
        },
        "performances": performances,
        "artists": artists_out,
        "influence_graph": {
            "nodes": graph_nodes,
            "edges": graph_edges,
        },
    }

    with open(OUTPUT_FILE, "w") as f:
        json.dump(out, f, indent=2)

    # Also save final intermediate (for resumability)
    save_intermediate({
        "performances": performances,
        "artists": artists_out,
        "processed_names": list(processed_names),
    })

    log.info("=" * 60)
    log.info(f"DONE in {elapsed}s")
    log.info(f"  Performances: {len(performances)}")
    log.info(f"  Artists:      {len(artists_out)}")
    log.info(f"  Graph nodes:  {len(graph_nodes)}")
    log.info(f"  Graph edges:  {len(graph_edges)}")
    log.info(f"  Output:       {OUTPUT_FILE}")
    log.info("=" * 60)

if __name__ == "__main__":
    main()
