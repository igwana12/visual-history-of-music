# VHM Database Schema — Design Notes

Visual History of Music (VHM) — PostgreSQL + SQLite schema and ETL pipeline.

---

## File Overview

| File | Purpose |
|------|---------|
| `postgres-schema.sql` | Full PostgreSQL DDL: tables, indexes, triggers, materialized views, helper views |
| `drizzle-schema.ts` | Drizzle ORM schema for the webapp (SQLite via better-sqlite3) |
| `migrations/001_initial.sql` | SQLite migration for the webapp (run once, tracked via `schema_migrations`) |
| `seed_genres.sql` | Seed data for all 10 top-level genres + 14 sub-genres + 11 decades |
| `etl_pipeline.py` | Python ETL script: reads `performances.json`, normalises, deduplicates, loads PostgreSQL |

---

## Schema Design Decisions

### 1. Normalisation level — 3NF with deliberate denormalisation

The schema is **Third Normal Form (3NF)** for editable data:

- Artists, genres, and decades are fully normalised into separate tables.
- `performances` references all three by foreign key.
- `artist_genres` is a proper junction table instead of an `artists.genre` text column — this correctly handles multi-genre artists (e.g. Miles Davis → Jazz + Blues + Soul/R&B).

Deliberate **denormalisation** is applied only in the materialized views (`mv_*`), where repeated joins would make every API call expensive. Those views embed genre names, colors, and artist slugs directly so the frontend can query a single table.

---

### 2. Significance scores

Both `artists.significance_score` and `performances.significance_score` are `NUMERIC(5,2)` in the range 0–100. This is a float rather than an integer to preserve ordering precision across hundreds of records with similar cultural weight.

**What drives the score:**
- Seeded manually for landmark artists/performances (first pass)
- ETL infers a default (50) with bonuses for embedded awards, historical tags (`"iconic"`, `"legendary"`), and recency discount for more recent decades
- Used as the primary visual weight in the terrain chart and node sizing in the influence graph

---

### 3. Genre taxonomy — self-referencing tree

`genres.parent_genre_id` creates a simple adjacency-list hierarchy:

```
Blues
  └─ Delta Blues
  └─ Chicago Blues
Rock
  └─ Psychedelic Rock
  └─ Grunge
  └─ Indie Rock
```

This avoids a nested-set or closure-table for now because the genre tree is shallow (max 2 levels in the VHM dataset) and writes are rare (genres are edited by admins, not users). For deeper hierarchies, a `WITH RECURSIVE` CTE or a dedicated closure table would be appropriate.

---

### 4. Influence relationships — directed weighted graph

`influence_relationships` models a directed graph where:

- `source_artist_id` → `target_artist_id` with a `relationship_type` ENUM.
- `strength` (0.0–1.0) serves as the edge weight for graph layout algorithms (e.g. force-directed D3 layouts).
- A UNIQUE constraint on `(source, target, type)` prevents duplicate edges while allowing the same pair to have multiple relationship types (e.g. Muddy Waters both **influenced** and **collaborated_with** Little Walter).

The `mv_artist_influence_network` materialized view pre-joins all node metadata so the influence chain navigator can load in a single query.

---

### 5. PostgreSQL vs. SQLite parity

The webapp uses **SQLite** (via `better-sqlite3` + Drizzle ORM) for zero-infrastructure local development. The PostgreSQL schema powers any hosted/production deployment.

Key differences handled:

| Feature | PostgreSQL | SQLite |
|---------|------------|--------|
| UUID type | `UUID` column | `TEXT` with `crypto.randomUUID()` default |
| Boolean | `BOOLEAN` | `INTEGER` (0/1), mode `'boolean'` in Drizzle |
| Arrays | `TEXT[]` | JSON-encoded `TEXT` |
| ENUM | `CREATE TYPE influence_type AS ENUM(...)` | `TEXT` + app-layer validation |
| Triggers | `set_updated_at()` trigger | Application must update `updated_at` |
| Materialized views | Supported | Not supported — recreate as regular views or queries |

---

### 6. Materialized views for the three chart types

| View | Chart | Refresh cost | Key columns |
|------|-------|-------------|-------------|
| `mv_genre_popularity_by_decade` | Terrain/landscape | Low — group-by on ~10k rows | `genre_id`, `decade_id`, `total_significance`, `relative_weight` |
| `mv_artist_influence_network` | Influence chain navigator | Medium — joins across artists × influence_relationships | `source_artist_id`, `target_artist_id`, `relationship_type`, `strength` |
| `mv_top_performances` | Compare view | Medium — window functions over performances | `rank_in_genre_decade`, `rank_in_decade` |

All three use `REFRESH MATERIALIZED VIEW CONCURRENTLY` (requires a unique index, which each view has) so reads are never blocked during refresh.

Refresh is triggered by calling the `refresh_materialized_views()` stored procedure at the end of each ETL run.

---

### 7. Indexing strategy

- **B-tree indexes** on all foreign keys, year columns, and significance scores.
- **GIN trigram indexes** (`pg_trgm`) on `artists.name` and `performances.title` for fast `ILIKE '%query%'` full-text search without a heavyweight full-text search setup.
- **GIN array indexes** on `performances.tags` for `@>` (array-contains) queries.
- **Composite index** `(genre_id, year, significance_score DESC)` on performances matches the most common timeline query pattern.
- **Partial unique index** on `artists.mbid WHERE mbid IS NOT NULL` avoids duplicates for MusicBrainz-verified artists while allowing NULL for unverified ones.

---

## ETL Pipeline

### Running the pipeline

```bash
# Install dependencies
pip install psycopg2-binary python-slugify tqdm

# Basic run (reads performances.json, writes to local DB)
python etl_pipeline.py

# Custom DB URL
python etl_pipeline.py --db-url postgresql://user:pass@host:5432/vhm

# Validate without writing
python etl_pipeline.py --dry-run

# Skip view refresh (faster, do manually later)
python etl_pipeline.py --no-refresh
```

### Expected JSON format

`performances.json` should be a JSON array (or an object with a `"performances"` key):

```json
[
  {
    "title": "Cross Road Blues",
    "artist": "Robert Johnson",
    "year": 1936,
    "genre": "Blues",
    "subgenre": "Delta Blues",
    "description": "Legendary Delta Blues recording...",
    "youtube_video_id": "cDF1_CJ2MbI",
    "youtube_search_query": "Robert Johnson Cross Road Blues",
    "tags": ["delta blues", "guitar", "classic"],
    "significance_score": 95,
    "birth_year": 1911,
    "death_year": 1938,
    "nationality": "American",
    "awards": [
      { "name": "Grammy Hall of Fame", "year": 1998, "is_win": true }
    ],
    "influences": [
      { "artist": "Son House", "type": "influenced_by", "strength": 0.9 }
    ]
  }
]
```

All fields except `title`, `artist`, and `year` are optional. The ETL tolerates missing fields gracefully.

### Deduplication

Records are deduplicated on the composite key `(slugified_title, slugified_artist, year)`. When two records share a key, the one with the higher `significance_score` is kept.

### Order of operations for fresh database setup

```sql
-- 1. Create schema
\i postgres-schema.sql

-- 2. Seed reference data
\i seed_genres.sql

-- 3. Run ETL
-- python etl_pipeline.py

-- 4. (Optional) Refresh views manually
CALL refresh_materialized_views();
```

---

## SQLite Setup (webapp)

```bash
# Install Drizzle CLI + better-sqlite3
npm install drizzle-orm better-sqlite3
npm install -D drizzle-kit @types/better-sqlite3

# Apply migration
npx drizzle-kit migrate

# Or run the SQL directly
sqlite3 vhm.db < migrations/001_initial.sql
sqlite3 vhm.db < seed_genres.sql   # NOTE: seed file uses PostgreSQL ON CONFLICT syntax
                                    # For SQLite: INSERT OR REPLACE works equivalently
```

> **Note:** `seed_genres.sql` uses PostgreSQL `ON CONFLICT (col) DO UPDATE` syntax. For SQLite, replace with `INSERT OR REPLACE INTO` or use the Drizzle seed scripts.

---

## Entity Relationship Summary

```
decades ◄──── performances ────► artists ◄──── artist_genres ────► genres
                   │                 │                                  ▲
                   ▼                 ▼                                  │
              genres (subgenre)   awards              genres (parent) ──┘
                                     │
                                  influence_relationships (source↔target)

users ◄──── user_ratings ────► performances
```
