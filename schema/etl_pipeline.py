#!/usr/bin/env python3
"""
Visual History of Music (VHM) — ETL Pipeline
============================================
Reads from /home/user/workspace/vhm-data/performances.json,
normalizes and deduplicates the data, and loads it into PostgreSQL.

Usage:
    python etl_pipeline.py [--db-url <postgres_dsn>] [--data-file <path>] [--dry-run]

Dependencies:
    pip install psycopg2-binary python-slugify tqdm

Environment variables (alternative to --db-url):
    VHM_DB_URL=postgresql://user:pass@localhost:5432/vhm
"""

import argparse
import json
import logging
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

try:
    import psycopg2
    import psycopg2.extras
    from psycopg2.extras import execute_values
except ImportError:
    sys.exit("psycopg2-binary is required: pip install psycopg2-binary")

try:
    from slugify import slugify
except ImportError:
    def slugify(text: str) -> str:
        """Minimal fallback slug generator."""
        text = text.lower().strip()
        text = re.sub(r"[^\w\s-]", "", text)
        text = re.sub(r"[\s_-]+", "-", text)
        text = re.sub(r"^-+|-+$", "", text)
        return text

try:
    from tqdm import tqdm
except ImportError:
    def tqdm(iterable, **kwargs):
        return iterable

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DEFAULT_DATA_FILE = "/home/user/workspace/vhm-data/performances.json"
DEFAULT_DB_URL    = os.environ.get("VHM_DB_URL", "postgresql://postgres:postgres@localhost:5432/vhm")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("vhm_etl")

# ---------------------------------------------------------------------------
# Genre colour map — source of truth for seed data matching
# ---------------------------------------------------------------------------
GENRE_COLOR_MAP: dict[str, str] = {
    "blues":        "#4a90d9",
    "jazz":         "#d4a843",
    "country":      "#c17a3a",
    "rock":         "#d94452",
    "soul":         "#3ab5a5",
    "soul/r&b":     "#3ab5a5",
    "r&b":          "#3ab5a5",
    "rnb":          "#3ab5a5",
    "electronic":   "#5dd477",
    "hip-hop":      "#9b59b6",
    "hip hop":      "#9b59b6",
    "rap":          "#9b59b6",
    "pop":          "#e87ecf",
    "punk":         "#e8a62e",
    "metal":        "#8c8c8c",
}

# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def decade_label(year: int) -> str:
    """Return the decade label for a given year. E.g. 1967 → '1960s'."""
    return f"{(year // 10) * 10}s"


def normalize_genre_name(raw: str) -> str:
    """Canonical genre name for matching the genres table."""
    raw = raw.strip()
    mapping = {
        "soul": "Soul/R&B",
        "r&b": "Soul/R&B",
        "rnb": "Soul/R&B",
        "rhythm and blues": "Soul/R&B",
        "hip hop": "Hip-Hop",
        "rap": "Hip-Hop",
        "electronic music": "Electronic",
        "edm": "Electronic",
        "country music": "Country",
    }
    return mapping.get(raw.lower(), raw.title())


def clean_youtube_id(raw: Optional[str]) -> Optional[str]:
    """Extract an 11-char video ID from a full URL or return as-is."""
    if not raw:
        return None
    raw = raw.strip()
    # Full URL patterns
    for pattern in [
        r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})",
    ]:
        m = re.search(pattern, raw)
        if m:
            return m.group(1)
    # Already a bare 11-char ID
    if re.match(r"^[A-Za-z0-9_-]{11}$", raw):
        return raw
    return None


def safe_int(val: Any) -> Optional[int]:
    """Convert to int, returning None on failure."""
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def safe_float(val: Any, default: float = 0.0) -> float:
    """Convert to float, returning default on failure."""
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

class VHMDatabase:
    """Thin wrapper around a psycopg2 connection for VHM ETL operations."""

    def __init__(self, dsn: str, dry_run: bool = False):
        self.dry_run = dry_run
        if not dry_run:
            self.conn = psycopg2.connect(dsn)
            self.conn.autocommit = False
            self.cur = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        self._genre_cache:   dict[str, int] = {}
        self._decade_cache:  dict[str, int] = {}
        self._artist_cache:  dict[str, int] = {}

    def commit(self):
        if not self.dry_run:
            self.conn.commit()

    def rollback(self):
        if not self.dry_run:
            self.conn.rollback()

    def close(self):
        if not self.dry_run:
            self.cur.close()
            self.conn.close()

    def execute(self, sql: str, params=None):
        if self.dry_run:
            log.debug("[DRY RUN] %s | params=%s", sql[:120], params)
            return None
        self.cur.execute(sql, params)
        return self.cur

    def fetchone(self):
        if self.dry_run:
            return None
        return self.cur.fetchone()

    def fetchall(self):
        if self.dry_run:
            return []
        return self.cur.fetchall()

    # ---- Look-up helpers ----

    def get_or_create_genre(self, name: str) -> Optional[int]:
        """Return genre.id, creating a minimal row if needed."""
        canonical = normalize_genre_name(name)
        slug_key = slugify(canonical)
        if slug_key in self._genre_cache:
            return self._genre_cache[slug_key]

        self.execute(
            "SELECT id FROM genres WHERE slug = %s", (slug_key,)
        )
        row = self.fetchone()
        if row:
            gid = row["id"]
        else:
            color = GENRE_COLOR_MAP.get(canonical.lower(), "#888888")
            self.execute(
                """
                INSERT INTO genres (name, slug, color, description)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
                RETURNING id
                """,
                (canonical, slug_key, color, f"Auto-created genre: {canonical}"),
            )
            row = self.fetchone()
            gid = row["id"] if row else None
            if gid:
                log.info("  Created genre: %s (id=%s)", canonical, gid)

        if gid:
            self._genre_cache[slug_key] = gid
        return gid

    def get_or_create_decade(self, year: int) -> Optional[int]:
        """Return decades.id for the decade containing year."""
        label = decade_label(year)
        if label in self._decade_cache:
            return self._decade_cache[label]

        self.execute("SELECT id FROM decades WHERE decade_label = %s", (label,))
        row = self.fetchone()
        if row:
            did = row["id"]
        else:
            start = (year // 10) * 10
            self.execute(
                """
                INSERT INTO decades (decade_label, start_year, end_year)
                VALUES (%s, %s, %s)
                ON CONFLICT (decade_label) DO NOTHING
                RETURNING id
                """,
                (label, start, start + 9),
            )
            row = self.fetchone()
            if not row:
                # Row existed but was not returned — fetch it
                self.execute(
                    "SELECT id FROM decades WHERE decade_label = %s", (label,)
                )
                row = self.fetchone()
            did = row["id"] if row else None
            log.info("  Created decade: %s (id=%s)", label, did)

        if did:
            self._decade_cache[label] = did
        return did

    def get_or_create_artist(self, record: dict) -> Optional[int]:
        """
        Upsert an artist by name (case-insensitive). Returns artist.id.
        If multiple name spellings exist, the first encountered wins.
        """
        name = record.get("artist", "").strip()
        if not name:
            return None

        slug_key = slugify(name)
        if slug_key in self._artist_cache:
            return self._artist_cache[slug_key]

        self.execute("SELECT id FROM artists WHERE slug = %s", (slug_key,))
        row = self.fetchone()
        if row:
            aid = row["id"]
        else:
            birth_year = safe_int(record.get("birth_year"))
            death_year = safe_int(record.get("death_year"))
            self.execute(
                """
                INSERT INTO artists
                    (name, slug, birth_year, death_year, nationality,
                     bio, significance_score)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (slug) DO NOTHING
                RETURNING id
                """,
                (
                    name,
                    slug_key,
                    birth_year,
                    death_year,
                    record.get("nationality"),
                    record.get("bio"),
                    safe_float(record.get("significance_score"), 50.0),
                ),
            )
            row = self.fetchone()
            if not row:
                self.execute("SELECT id FROM artists WHERE slug = %s", (slug_key,))
                row = self.fetchone()
            aid = row["id"] if row else None
            if aid:
                log.info("  Created artist: %s (id=%s)", name, aid)

        if aid:
            self._artist_cache[slug_key] = aid
        return aid


# ---------------------------------------------------------------------------
# ETL stages
# ---------------------------------------------------------------------------

def load_json(path: str) -> list[dict]:
    """Load and parse the performances JSON file."""
    p = Path(path)
    if not p.exists():
        log.error("Data file not found: %s", path)
        log.info(
            "Expected format: a JSON array of performance objects.\n"
            "See README.md for the full schema."
        )
        return []

    with p.open(encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict):
        # Support { "performances": [...] } envelope
        data = data.get("performances") or data.get("data") or list(data.values())[0]

    if not isinstance(data, list):
        log.error("Expected a JSON array, got %s", type(data).__name__)
        return []

    log.info("Loaded %d records from %s", len(data), path)
    return data


def validate_record(record: dict, idx: int) -> bool:
    """Basic validation — log and skip invalid rows."""
    if not record.get("title"):
        log.warning("Record %d missing 'title' — skipped", idx)
        return False
    if not record.get("artist"):
        log.warning("Record %d ('%s') missing 'artist' — skipped", idx, record.get("title"))
        return False
    year = safe_int(record.get("year"))
    if year is None or not (1900 <= year <= 2100):
        log.warning(
            "Record %d ('%s') has invalid year '%s' — skipped",
            idx, record.get("title"), record.get("year"),
        )
        return False
    return True


def deduplicate(records: list[dict]) -> list[dict]:
    """
    Remove duplicate records by (normalised title + artist + year).
    Keeps the record with the higher significance_score on collision.
    """
    seen: dict[tuple, dict] = {}
    for rec in records:
        key = (
            slugify(str(rec.get("title", ""))),
            slugify(str(rec.get("artist", ""))),
            safe_int(rec.get("year")),
        )
        if key in seen:
            existing_sig = safe_float(seen[key].get("significance_score"), 0)
            new_sig      = safe_float(rec.get("significance_score"), 0)
            if new_sig > existing_sig:
                seen[key] = rec
        else:
            seen[key] = rec

    unique = list(seen.values())
    log.info("After deduplication: %d records (removed %d)", len(unique), len(records) - len(unique))
    return unique


def infer_significance(record: dict) -> float:
    """
    Assign a significance score (0–100) when the source data lacks one.
    Heuristics:
      - Explicit score in data wins
      - Awards mentioned → bonus
      - Later decades slightly discounted (recency bias in source data)
    """
    raw = safe_float(record.get("significance_score"), -1)
    if raw >= 0:
        return min(100.0, raw)

    score = 50.0
    year = safe_int(record.get("year")) or 1970

    # Bonus for documented awards
    if record.get("awards"):
        score += 10

    # Mild recency adjustment: older = slightly more significance in historical data
    decade_bonus = max(0, (2000 - year) / 100)
    score += decade_bonus

    # Tags-based bonus
    high_value_tags = {"classic", "legendary", "groundbreaking", "iconic", "influential"}
    tags = {t.lower() for t in (record.get("tags") or [])}
    score += len(tags & high_value_tags) * 5

    return round(min(100.0, score), 2)


def upsert_performances(db: VHMDatabase, records: list[dict]) -> tuple[int, int]:
    """
    Insert-or-update performances and all related rows.
    Returns (inserted_count, skipped_count).
    """
    inserted = 0
    skipped  = 0

    for idx, rec in enumerate(tqdm(records, desc="Loading performances")):
        if not validate_record(rec, idx):
            skipped += 1
            continue

        try:
            year     = safe_int(rec["year"])
            sig      = infer_significance(rec)
            genre_id = db.get_or_create_genre(rec["genre"]) if rec.get("genre") else None
            sub_id   = db.get_or_create_genre(rec["subgenre"]) if rec.get("subgenre") else None
            decade_id = db.get_or_create_decade(year) if year else None
            artist_id = db.get_or_create_artist(rec)

            if not artist_id:
                log.warning("Could not resolve artist for record %d — skipped", idx)
                skipped += 1
                continue

            # Associate artist → primary genre
            if genre_id and artist_id:
                db.execute(
                    """
                    INSERT INTO artist_genres (artist_id, genre_id, is_primary)
                    VALUES (%s, %s, TRUE)
                    ON CONFLICT (artist_id, genre_id) DO NOTHING
                    """,
                    (artist_id, genre_id),
                )

            # Tags: list or comma-separated string
            raw_tags = rec.get("tags") or []
            if isinstance(raw_tags, str):
                raw_tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
            tags_array = raw_tags if raw_tags else None

            yt_id = clean_youtube_id(rec.get("youtube_video_id") or rec.get("video_id"))

            db.execute(
                """
                INSERT INTO performances
                    (title, artist_id, year, decade_id, genre_id, subgenre_id,
                     description, youtube_video_id, youtube_search_query,
                     tags, significance_score, is_album, is_live, duration_seconds)
                VALUES
                    (%s, %s, %s, %s, %s, %s,
                     %s, %s, %s,
                     %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (
                    rec["title"].strip(),
                    artist_id,
                    year,
                    decade_id,
                    genre_id,
                    sub_id,
                    rec.get("description"),
                    yt_id,
                    rec.get("youtube_search_query"),
                    tags_array,
                    sig,
                    bool(rec.get("is_album", False)),
                    bool(rec.get("is_live", False)),
                    safe_int(rec.get("duration_seconds")),
                ),
            )

            # Load awards if embedded in record
            for award in (rec.get("awards") or []):
                if not isinstance(award, dict):
                    continue
                award_year = safe_int(award.get("year") or year)
                if award_year:
                    db.execute(
                        """
                        INSERT INTO awards (artist_id, award_name, category, year, is_win)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT DO NOTHING
                        """,
                        (
                            artist_id,
                            award.get("name", "Unknown Award"),
                            award.get("category"),
                            award_year,
                            bool(award.get("is_win", True)),
                        ),
                    )

            # Load influence relationships if embedded
            for inf in (rec.get("influences") or []):
                if not isinstance(inf, dict):
                    continue
                target_name = inf.get("artist")
                if not target_name:
                    continue
                target_id = db.get_or_create_artist({"artist": target_name})
                if target_id and target_id != artist_id:
                    rel_type = inf.get("type", "influenced_by")
                    db.execute(
                        """
                        INSERT INTO influence_relationships
                            (source_artist_id, target_artist_id, relationship_type,
                             strength, notes)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (source_artist_id, target_artist_id, relationship_type)
                        DO UPDATE SET strength = GREATEST(
                            influence_relationships.strength, EXCLUDED.strength
                        )
                        """,
                        (
                            artist_id,
                            target_id,
                            rel_type,
                            safe_float(inf.get("strength"), 0.7),
                            inf.get("notes"),
                        ),
                    )

            inserted += 1

        except Exception as exc:
            log.error("Error on record %d ('%s'): %s", idx, rec.get("title"), exc)
            db.rollback()
            skipped += 1
            continue

        # Commit in batches of 500 for performance
        if inserted % 500 == 0:
            db.commit()
            log.info("  Committed batch — %d inserted so far", inserted)

    db.commit()
    return inserted, skipped


def refresh_views(db: VHMDatabase):
    """Refresh all materialized views after loading."""
    log.info("Refreshing materialized views…")
    for view in [
        "mv_genre_popularity_by_decade",
        "mv_artist_influence_network",
        "mv_top_performances",
    ]:
        log.info("  Refreshing %s", view)
        db.execute(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {view}")
    db.commit()
    log.info("All views refreshed.")


def print_summary(db: VHMDatabase):
    """Print row counts for all core tables."""
    tables = [
        "decades", "genres", "artists", "performances",
        "influence_relationships", "awards",
    ]
    log.info("=" * 50)
    log.info("Database summary:")
    for table in tables:
        db.execute(f"SELECT COUNT(*) AS n FROM {table}")
        row = db.fetchone()
        count = row["n"] if row else "?"
        log.info("  %-32s %s rows", table, count)
    log.info("=" * 50)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="VHM ETL Pipeline — load performances.json into PostgreSQL"
    )
    parser.add_argument(
        "--db-url",
        default=DEFAULT_DB_URL,
        help=f"PostgreSQL DSN (default: {DEFAULT_DB_URL})",
    )
    parser.add_argument(
        "--data-file",
        default=DEFAULT_DATA_FILE,
        help=f"Path to performances.json (default: {DEFAULT_DATA_FILE})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and validate data without writing to the database",
    )
    parser.add_argument(
        "--no-refresh",
        action="store_true",
        help="Skip refreshing materialized views after load",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug logging",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    log.info("VHM ETL Pipeline starting at %s", datetime.now().isoformat())
    log.info("  Data file : %s", args.data_file)
    log.info("  DB URL    : %s", re.sub(r":([^:@]+)@", ":***@", args.db_url))
    log.info("  Dry run   : %s", args.dry_run)

    # 1. Load JSON
    records = load_json(args.data_file)
    if not records and not args.dry_run:
        log.warning("No records to process. Exiting.")
        sys.exit(0)

    # 2. Deduplicate
    records = deduplicate(records)

    # 3. Connect to DB
    db = VHMDatabase(args.db_url, dry_run=args.dry_run)

    try:
        # 4. Upsert
        inserted, skipped = upsert_performances(db, records)
        log.info("ETL complete — inserted: %d | skipped: %d", inserted, skipped)

        # 5. Refresh views
        if not args.dry_run and not args.no_refresh:
            refresh_views(db)

        # 6. Summary
        if not args.dry_run:
            print_summary(db)

    except KeyboardInterrupt:
        log.warning("Interrupted — rolling back.")
        db.rollback()
    except Exception as exc:
        log.exception("Fatal ETL error: %s", exc)
        db.rollback()
        sys.exit(1)
    finally:
        db.close()

    log.info("Done.")


if __name__ == "__main__":
    main()
