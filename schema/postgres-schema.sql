-- =============================================================================
-- Visual History of Music (VHM) — PostgreSQL Schema
-- Full DDL: Tables, Indexes, Constraints, Materialized Views
-- =============================================================================

-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- trigram indexes for fuzzy search

-- =============================================================================
-- DECADES
-- Reference table: each decade from 1920s–2020s
-- =============================================================================
CREATE TABLE decades (
    id            SERIAL PRIMARY KEY,
    decade_label  VARCHAR(10)  NOT NULL UNIQUE,  -- e.g. '1920s'
    start_year    SMALLINT     NOT NULL,           -- e.g. 1920
    end_year      SMALLINT     NOT NULL,           -- e.g. 1929
    description   TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT decades_years_check CHECK (end_year = start_year + 9)
);

CREATE INDEX idx_decades_start_year ON decades (start_year);

-- =============================================================================
-- GENRES
-- Top-level and sub-genres with visual identity for the terrain chart
-- =============================================================================
CREATE TABLE genres (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL UNIQUE,
    slug          VARCHAR(100) NOT NULL UNIQUE,   -- url-safe identifier
    color         CHAR(7)      NOT NULL,           -- hex, e.g. '#4a90d9'
    parent_genre_id INT REFERENCES genres(id) ON DELETE SET NULL,
    era_start     SMALLINT,                        -- first year genre appeared
    era_end       SMALLINT,                        -- NULL = still active
    description   TEXT,
    sort_order    SMALLINT     NOT NULL DEFAULT 0, -- display ordering
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT genres_color_format CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
    CONSTRAINT genres_era_check    CHECK (era_end IS NULL OR era_end >= era_start)
);

CREATE INDEX idx_genres_parent ON genres (parent_genre_id);
CREATE INDEX idx_genres_era    ON genres (era_start, era_end);

-- =============================================================================
-- ARTISTS
-- Musicians, bands, and collectives
-- =============================================================================
CREATE TABLE artists (
    id                SERIAL PRIMARY KEY,
    name              VARCHAR(255) NOT NULL,
    slug              VARCHAR(255) NOT NULL UNIQUE,
    mbid              UUID,                          -- MusicBrainz ID
    wikidata_id       VARCHAR(20),                   -- e.g. 'Q392'
    birth_year        SMALLINT,
    death_year        SMALLINT,                      -- NULL = still alive
    nationality       VARCHAR(100),
    bio               TEXT,
    image_url         TEXT,
    significance_score NUMERIC(5,2) NOT NULL DEFAULT 0,  -- 0–100, drives visual prominence
    is_group          BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT artists_death_after_birth CHECK (death_year IS NULL OR death_year >= birth_year),
    CONSTRAINT artists_significance_range CHECK (significance_score BETWEEN 0 AND 100)
);

CREATE UNIQUE INDEX idx_artists_mbid        ON artists (mbid) WHERE mbid IS NOT NULL;
CREATE INDEX        idx_artists_birth_year  ON artists (birth_year);
CREATE INDEX        idx_artists_nationality ON artists (nationality);
CREATE INDEX        idx_artists_significance ON artists (significance_score DESC);
CREATE INDEX        idx_artists_name_trgm   ON artists USING GIN (name gin_trgm_ops);

-- =============================================================================
-- ARTIST_GENRES
-- Many-to-many: artists belong to one or more genres
-- =============================================================================
CREATE TABLE artist_genres (
    artist_id   INT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    genre_id    INT NOT NULL REFERENCES genres(id)  ON DELETE CASCADE,
    is_primary  BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = main genre for display
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (artist_id, genre_id)
);

CREATE INDEX idx_artist_genres_genre ON artist_genres (genre_id);

-- =============================================================================
-- PERFORMANCES / RECORDINGS
-- Core content: a specific song, album, or live performance
-- =============================================================================
CREATE TABLE performances (
    id                   SERIAL PRIMARY KEY,
    title                VARCHAR(500) NOT NULL,
    artist_id            INT          NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    year                 SMALLINT     NOT NULL,
    decade_id            INT          REFERENCES decades(id) ON DELETE SET NULL,
    genre_id             INT          REFERENCES genres(id)  ON DELETE SET NULL,
    subgenre_id          INT          REFERENCES genres(id)  ON DELETE SET NULL,
    description          TEXT,
    youtube_video_id     VARCHAR(20),     -- e.g. 'dQw4w9WgXcQ'
    youtube_search_query TEXT,            -- fallback search string if no direct ID
    tags                 TEXT[],          -- free-form tags array
    significance_score   NUMERIC(5,2) NOT NULL DEFAULT 0,
    is_album             BOOLEAN      NOT NULL DEFAULT FALSE,
    is_live              BOOLEAN      NOT NULL DEFAULT FALSE,
    duration_seconds     INT,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT performances_year_range       CHECK (year BETWEEN 1900 AND 2100),
    CONSTRAINT performances_significance_range CHECK (significance_score BETWEEN 0 AND 100),
    CONSTRAINT performances_duration_positive  CHECK (duration_seconds IS NULL OR duration_seconds > 0)
);

CREATE INDEX idx_performances_artist       ON performances (artist_id);
CREATE INDEX idx_performances_genre        ON performances (genre_id);
CREATE INDEX idx_performances_subgenre     ON performances (subgenre_id);
CREATE INDEX idx_performances_year         ON performances (year);
CREATE INDEX idx_performances_decade       ON performances (decade_id);
CREATE INDEX idx_performances_significance ON performances (significance_score DESC);
CREATE INDEX idx_performances_tags         ON performances USING GIN (tags);
CREATE INDEX idx_performances_title_trgm   ON performances USING GIN (title gin_trgm_ops);
-- Composite for timeline queries
CREATE INDEX idx_performances_genre_year   ON performances (genre_id, year, significance_score DESC);

-- =============================================================================
-- INFLUENCE_RELATIONSHIPS
-- Directed graph edges for the influence chain navigator
-- relationship_type: 'influenced_by' | 'collaborated_with' | 'member_of'
-- =============================================================================
CREATE TYPE influence_type AS ENUM (
    'influenced_by',
    'collaborated_with',
    'member_of',
    'sampled',
    'produced_by'
);

CREATE TABLE influence_relationships (
    id                 SERIAL PRIMARY KEY,
    source_artist_id   INT          NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    target_artist_id   INT          NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    relationship_type  influence_type NOT NULL,
    strength           NUMERIC(3,2) NOT NULL DEFAULT 1.0,  -- 0.0–1.0, edge weight
    year_start         SMALLINT,
    year_end           SMALLINT,
    notes              TEXT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT influence_no_self_loop CHECK (source_artist_id != target_artist_id),
    CONSTRAINT influence_strength_range CHECK (strength BETWEEN 0 AND 1),
    CONSTRAINT influence_year_order CHECK (year_end IS NULL OR year_end >= year_start),
    UNIQUE (source_artist_id, target_artist_id, relationship_type)
);

CREATE INDEX idx_influence_source ON influence_relationships (source_artist_id);
CREATE INDEX idx_influence_target ON influence_relationships (target_artist_id);
CREATE INDEX idx_influence_type   ON influence_relationships (relationship_type);

-- =============================================================================
-- AWARDS
-- Grammy, Billboard, Rock and Roll Hall of Fame, etc.
-- =============================================================================
CREATE TABLE awards (
    id           SERIAL PRIMARY KEY,
    artist_id    INT         NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    award_name   VARCHAR(255) NOT NULL,     -- e.g. 'Grammy Award'
    category     VARCHAR(255),              -- e.g. 'Best Rock Album'
    year         SMALLINT    NOT NULL,
    is_win       BOOLEAN     NOT NULL DEFAULT TRUE,  -- FALSE = nomination
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT awards_year_range CHECK (year BETWEEN 1900 AND 2100)
);

CREATE INDEX idx_awards_artist ON awards (artist_id);
CREATE INDEX idx_awards_year   ON awards (year);
CREATE INDEX idx_awards_name   ON awards (award_name);

-- =============================================================================
-- USERS  (future — auth foundation)
-- =============================================================================
CREATE TABLE users (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    username     VARCHAR(50)  NOT NULL UNIQUE,
    email        VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(100),
    avatar_url   TEXT,
    is_admin     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT users_email_format CHECK (email ~ '^[^@]+@[^@]+\.[^@]+$')
);

CREATE INDEX idx_users_email ON users (email);

-- =============================================================================
-- USER_RATINGS  (future — personalization)
-- =============================================================================
CREATE TABLE user_ratings (
    id             SERIAL PRIMARY KEY,
    user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    performance_id INT         NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
    rating         SMALLINT    NOT NULL,       -- 1–5 stars
    review         TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, performance_id),
    CONSTRAINT user_ratings_range CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX idx_user_ratings_user        ON user_ratings (user_id);
CREATE INDEX idx_user_ratings_performance ON user_ratings (performance_id);

-- =============================================================================
-- UPDATED_AT triggers — auto-update timestamps
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_artists_updated_at
    BEFORE UPDATE ON artists
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_performances_updated_at
    BEFORE UPDATE ON performances
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_genres_updated_at
    BEFORE UPDATE ON genres
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_ratings_updated_at
    BEFORE UPDATE ON user_ratings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- MATERIALIZED VIEWS
-- Pre-aggregated data for frontend charts — refresh after ETL loads
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Genre Popularity by Decade
--    Powers the terrain/landscape chart.
--    "Popularity" = weighted sum of significance scores of performances.
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_genre_popularity_by_decade AS
SELECT
    g.id                             AS genre_id,
    g.name                           AS genre_name,
    g.slug                           AS genre_slug,
    g.color                          AS genre_color,
    d.id                             AS decade_id,
    d.decade_label,
    d.start_year,
    COUNT(p.id)                      AS performance_count,
    ROUND(SUM(p.significance_score)::NUMERIC, 2)
                                     AS total_significance,
    ROUND(AVG(p.significance_score)::NUMERIC, 2)
                                     AS avg_significance,
    MAX(p.significance_score)        AS peak_significance,
    -- Normalize 0–100 within each decade for terrain height
    ROUND(
        100.0 * SUM(p.significance_score) /
        NULLIF(SUM(SUM(p.significance_score)) OVER (PARTITION BY d.id), 0),
        2
    )                                AS relative_weight
FROM performances p
JOIN genres  g ON p.genre_id  = g.id
JOIN decades d ON p.decade_id = d.id
GROUP BY g.id, g.name, g.slug, g.color, d.id, d.decade_label, d.start_year
ORDER BY d.start_year, total_significance DESC;

CREATE UNIQUE INDEX idx_mv_genre_decade
    ON mv_genre_popularity_by_decade (genre_id, decade_id);
CREATE INDEX idx_mv_genre_decade_genre
    ON mv_genre_popularity_by_decade (genre_id);

-- -----------------------------------------------------------------------------
-- 2. Artist Influence Network
--    Powers the influence chain navigator.
--    Returns edge list with enriched node metadata.
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_artist_influence_network AS
SELECT
    ir.id                            AS edge_id,
    ir.source_artist_id,
    sa.name                          AS source_name,
    sa.slug                          AS source_slug,
    sa.birth_year                    AS source_birth_year,
    sa.significance_score            AS source_significance,
    -- primary genre of source
    (SELECT g.name FROM genres g
     JOIN artist_genres ag ON ag.genre_id = g.id
     WHERE ag.artist_id = ir.source_artist_id AND ag.is_primary
     LIMIT 1)                        AS source_primary_genre,
    (SELECT g.color FROM genres g
     JOIN artist_genres ag ON ag.genre_id = g.id
     WHERE ag.artist_id = ir.source_artist_id AND ag.is_primary
     LIMIT 1)                        AS source_genre_color,
    ir.target_artist_id,
    ta.name                          AS target_name,
    ta.slug                          AS target_slug,
    ta.birth_year                    AS target_birth_year,
    ta.significance_score            AS target_significance,
    (SELECT g.name FROM genres g
     JOIN artist_genres ag ON ag.genre_id = g.id
     WHERE ag.artist_id = ir.target_artist_id AND ag.is_primary
     LIMIT 1)                        AS target_primary_genre,
    ir.relationship_type,
    ir.strength,
    ir.year_start,
    ir.year_end
FROM influence_relationships ir
JOIN artists sa ON ir.source_artist_id = sa.id
JOIN artists ta ON ir.target_artist_id = ta.id
ORDER BY ir.strength DESC, sa.significance_score DESC;

CREATE INDEX idx_mv_influence_source ON mv_artist_influence_network (source_artist_id);
CREATE INDEX idx_mv_influence_target ON mv_artist_influence_network (target_artist_id);
CREATE INDEX idx_mv_influence_type   ON mv_artist_influence_network (relationship_type);

-- -----------------------------------------------------------------------------
-- 3. Top Performances by Genre and Decade
--    Powers the compare view (side-by-side genre/decade analysis).
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_top_performances AS
SELECT
    p.id                             AS performance_id,
    p.title,
    p.year,
    p.youtube_video_id,
    p.youtube_search_query,
    p.significance_score,
    p.tags,
    p.is_live,
    p.is_album,
    a.id                             AS artist_id,
    a.name                           AS artist_name,
    a.slug                           AS artist_slug,
    g.id                             AS genre_id,
    g.name                           AS genre_name,
    g.color                          AS genre_color,
    sg.id                            AS subgenre_id,
    sg.name                          AS subgenre_name,
    d.id                             AS decade_id,
    d.decade_label,
    d.start_year,
    -- Rank within genre+decade for filtering top N
    RANK() OVER (
        PARTITION BY p.genre_id, p.decade_id
        ORDER BY p.significance_score DESC
    )                                AS rank_in_genre_decade,
    -- Rank globally within decade
    RANK() OVER (
        PARTITION BY p.decade_id
        ORDER BY p.significance_score DESC
    )                                AS rank_in_decade
FROM performances p
JOIN artists a ON p.artist_id = a.id
LEFT JOIN genres  g  ON p.genre_id    = g.id
LEFT JOIN genres  sg ON p.subgenre_id = sg.id
LEFT JOIN decades d  ON p.decade_id   = d.id
ORDER BY p.significance_score DESC;

CREATE INDEX idx_mv_top_genre_decade   ON mv_top_performances (genre_id, decade_id, rank_in_genre_decade);
CREATE INDEX idx_mv_top_decade         ON mv_top_performances (decade_id, rank_in_decade);
CREATE INDEX idx_mv_top_artist         ON mv_top_performances (artist_id);
CREATE INDEX idx_mv_top_significance   ON mv_top_performances (significance_score DESC);

-- =============================================================================
-- REFRESH MATERIALIZED VIEWS PROCEDURE
-- Call after each ETL load
-- =============================================================================
CREATE OR REPLACE PROCEDURE refresh_materialized_views()
LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_genre_popularity_by_decade;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_artist_influence_network;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_top_performances;
    RAISE NOTICE 'All materialized views refreshed at %', NOW();
END;
$$;

-- =============================================================================
-- HELPER VIEWS (non-materialized, for convenience queries)
-- =============================================================================

-- Full performance detail with artist + genre + decade
CREATE VIEW v_performance_detail AS
SELECT
    p.*,
    a.name      AS artist_name,
    a.slug      AS artist_slug,
    a.mbid      AS artist_mbid,
    g.name      AS genre_name,
    g.color     AS genre_color,
    sg.name     AS subgenre_name,
    d.decade_label
FROM performances p
JOIN artists a       ON p.artist_id   = a.id
LEFT JOIN genres  g  ON p.genre_id    = g.id
LEFT JOIN genres  sg ON p.subgenre_id = sg.id
LEFT JOIN decades d  ON p.decade_id   = d.id;

-- Artist summary with primary genre and influence count
CREATE VIEW v_artist_summary AS
SELECT
    a.*,
    pg.name  AS primary_genre_name,
    pg.color AS primary_genre_color,
    pg.slug  AS primary_genre_slug,
    COUNT(DISTINCT p.id)                                        AS performance_count,
    COUNT(DISTINCT ir_out.id)                                   AS influences_count,
    COUNT(DISTINCT ir_in.id)                                    AS influenced_by_count,
    COUNT(DISTINCT aw.id)                                       AS award_count
FROM artists a
LEFT JOIN artist_genres ag  ON ag.artist_id = a.id AND ag.is_primary
LEFT JOIN genres pg          ON pg.id = ag.genre_id
LEFT JOIN performances p     ON p.artist_id = a.id
LEFT JOIN influence_relationships ir_out ON ir_out.source_artist_id = a.id
LEFT JOIN influence_relationships ir_in  ON ir_in.target_artist_id  = a.id
LEFT JOIN awards aw          ON aw.artist_id = a.id
GROUP BY a.id, pg.name, pg.color, pg.slug;
