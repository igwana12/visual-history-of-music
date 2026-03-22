-- =============================================================================
-- Migration 001: Initial Schema — Visual History of Music (VHM)
-- Target: SQLite (via Drizzle ORM + better-sqlite3)
-- For PostgreSQL use postgres-schema.sql directly.
-- =============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- DECADES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decades (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    decade_label  TEXT    NOT NULL UNIQUE,
    start_year    INTEGER NOT NULL,
    end_year      INTEGER NOT NULL,
    description   TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_decades_start_year ON decades (start_year);

-- ---------------------------------------------------------------------------
-- GENRES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS genres (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL UNIQUE,
    slug            TEXT    NOT NULL UNIQUE,
    color           TEXT    NOT NULL,
    parent_genre_id INTEGER REFERENCES genres(id) ON DELETE SET NULL,
    era_start       INTEGER,
    era_end         INTEGER,
    description     TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_genres_parent ON genres (parent_genre_id);
CREATE INDEX IF NOT EXISTS idx_genres_era    ON genres (era_start, era_end);

-- ---------------------------------------------------------------------------
-- ARTISTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS artists (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT    NOT NULL,
    slug                TEXT    NOT NULL UNIQUE,
    mbid                TEXT,
    wikidata_id         TEXT,
    birth_year          INTEGER,
    death_year          INTEGER,
    nationality         TEXT,
    bio                 TEXT,
    image_url           TEXT,
    significance_score  REAL    NOT NULL DEFAULT 0,
    is_group            INTEGER NOT NULL DEFAULT 0,   -- boolean: 0/1
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_artists_mbid          ON artists (mbid) WHERE mbid IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_artists_birth_year    ON artists (birth_year);
CREATE INDEX        IF NOT EXISTS idx_artists_nationality   ON artists (nationality);
CREATE INDEX        IF NOT EXISTS idx_artists_significance  ON artists (significance_score DESC);

-- ---------------------------------------------------------------------------
-- ARTIST_GENRES  (many-to-many)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS artist_genres (
    artist_id  INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    genre_id   INTEGER NOT NULL REFERENCES genres(id)  ON DELETE CASCADE,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),

    PRIMARY KEY (artist_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_artist_genres_genre ON artist_genres (genre_id);

-- ---------------------------------------------------------------------------
-- PERFORMANCES
-- tags stored as JSON text: '["blues","guitar"]'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS performances (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    title                TEXT    NOT NULL,
    artist_id            INTEGER NOT NULL REFERENCES artists(id)    ON DELETE CASCADE,
    year                 INTEGER NOT NULL,
    decade_id            INTEGER REFERENCES decades(id)             ON DELETE SET NULL,
    genre_id             INTEGER REFERENCES genres(id)              ON DELETE SET NULL,
    subgenre_id          INTEGER REFERENCES genres(id)              ON DELETE SET NULL,
    description          TEXT,
    youtube_video_id     TEXT,
    youtube_search_query TEXT,
    tags                 TEXT,    -- JSON array string
    significance_score   REAL    NOT NULL DEFAULT 0,
    is_album             INTEGER NOT NULL DEFAULT 0,
    is_live              INTEGER NOT NULL DEFAULT 0,
    duration_seconds     INTEGER,
    created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_performances_artist        ON performances (artist_id);
CREATE INDEX IF NOT EXISTS idx_performances_genre         ON performances (genre_id);
CREATE INDEX IF NOT EXISTS idx_performances_subgenre      ON performances (subgenre_id);
CREATE INDEX IF NOT EXISTS idx_performances_year          ON performances (year);
CREATE INDEX IF NOT EXISTS idx_performances_decade        ON performances (decade_id);
CREATE INDEX IF NOT EXISTS idx_performances_significance  ON performances (significance_score DESC);
CREATE INDEX IF NOT EXISTS idx_performances_genre_year    ON performances (genre_id, year, significance_score DESC);

-- ---------------------------------------------------------------------------
-- INFLUENCE_RELATIONSHIPS
-- relationship_type: 'influenced_by'|'collaborated_with'|'member_of'|'sampled'|'produced_by'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS influence_relationships (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    source_artist_id   INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    target_artist_id   INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    relationship_type  TEXT    NOT NULL,
    strength           REAL    NOT NULL DEFAULT 1.0,
    year_start         INTEGER,
    year_end           INTEGER,
    notes              TEXT,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now')),

    UNIQUE (source_artist_id, target_artist_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_influence_source ON influence_relationships (source_artist_id);
CREATE INDEX IF NOT EXISTS idx_influence_target ON influence_relationships (target_artist_id);
CREATE INDEX IF NOT EXISTS idx_influence_type   ON influence_relationships (relationship_type);

-- ---------------------------------------------------------------------------
-- AWARDS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS awards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id   INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    award_name  TEXT    NOT NULL,
    category    TEXT,
    year        INTEGER NOT NULL,
    is_win      INTEGER NOT NULL DEFAULT 1,
    notes       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_awards_artist ON awards (artist_id);
CREATE INDEX IF NOT EXISTS idx_awards_year   ON awards (year);

-- ---------------------------------------------------------------------------
-- USERS  (future)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id           TEXT    PRIMARY KEY,  -- UUID string
    username     TEXT    NOT NULL UNIQUE,
    email        TEXT    NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url   TEXT,
    is_admin     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ---------------------------------------------------------------------------
-- USER_RATINGS  (future)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_ratings (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        TEXT    NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
    performance_id INTEGER NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
    rating         INTEGER NOT NULL,   -- 1–5
    review         TEXT,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),

    UNIQUE (user_id, performance_id)
);

CREATE INDEX IF NOT EXISTS idx_user_ratings_user        ON user_ratings (user_id);
CREATE INDEX IF NOT EXISTS idx_user_ratings_performance ON user_ratings (performance_id);

-- ---------------------------------------------------------------------------
-- SCHEMA VERSION tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT    NOT NULL DEFAULT (datetime('now')),
    description TEXT
);

INSERT OR IGNORE INTO schema_migrations (version, description)
VALUES (1, 'Initial schema: decades, genres, artists, performances, influence_relationships, awards, users, user_ratings');
