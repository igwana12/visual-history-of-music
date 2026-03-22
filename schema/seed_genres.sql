-- =============================================================================
-- VHM Seed Data: Decades + Genres
-- Run AFTER migrations/001_initial.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- DECADES  (1920s – 2020s)
-- ---------------------------------------------------------------------------
INSERT INTO decades (decade_label, start_year, end_year, description) VALUES
    ('1920s', 1920, 1929, 'The Jazz Age — blues, jazz, and early country emerge'),
    ('1930s', 1930, 1939, 'Big Band era; blues consolidates in the Mississippi Delta'),
    ('1940s', 1940, 1949, 'Bebop, jump blues, and the birth of modern country'),
    ('1950s', 1950, 1959, 'Rock and roll explodes; rhythm & blues fuels a cultural revolution'),
    ('1960s', 1960, 1969, 'British Invasion, Motown, psychedelia, and protest folk'),
    ('1970s', 1970, 1979, 'Disco, funk, punk rebellion, and arena rock'),
    ('1980s', 1980, 1989, 'MTV era: synth-pop, hair metal, and hip-hop genesis'),
    ('1990s', 1990, 1999, 'Grunge, gangsta rap, Britpop, and electronic dance culture'),
    ('2000s', 2000, 2009, 'Digital revolution: nu-metal, indie, EDM, and ringtone pop'),
    ('2010s', 2010, 2019, 'Streaming age: trap, bedroom pop, K-pop, and hyperpop'),
    ('2020s', 2020, 2029, 'Post-pandemic: lo-fi, afrobeats, and AI-assisted production')
ON CONFLICT (decade_label) DO UPDATE
    SET description = EXCLUDED.description;

-- ---------------------------------------------------------------------------
-- TOP-LEVEL GENRES
-- Colors match the VHM prototype color palette
-- ---------------------------------------------------------------------------
INSERT INTO genres (name, slug, color, parent_genre_id, era_start, era_end, description, sort_order)
VALUES
    (
        'Blues',
        'blues',
        '#4a90d9',
        NULL,
        1900, NULL,
        'African American musical tradition rooted in field hollers, work songs, and spirituals. '
        'The foundation of virtually all popular music that followed.',
        1
    ),
    (
        'Jazz',
        'jazz',
        '#d4a843',
        NULL,
        1895, NULL,
        'Improvisational genre born in New Orleans from the synthesis of blues, ragtime, and '
        'European harmonic traditions. Defined 20th-century musical sophistication.',
        2
    ),
    (
        'Country',
        'country',
        '#c17a3a',
        NULL,
        1920, NULL,
        'American folk-derived genre from the rural South and Appalachia. '
        'Evolved from old-time string band music into a billion-dollar global industry.',
        3
    ),
    (
        'Rock',
        'rock',
        '#d94452',
        NULL,
        1954, NULL,
        'Born from the fusion of blues, country, and R&B, rock became the dominant popular '
        'music form of the late 20th century.',
        4
    ),
    (
        'Soul/R&B',
        'soul-rnb',
        '#3ab5a5',
        NULL,
        1950, NULL,
        'Emotionally powerful blend of gospel, blues, and jazz. R&B evolved into soul, funk, '
        'and contemporary R&B, shaping global pop music.',
        5
    ),
    (
        'Electronic',
        'electronic',
        '#5dd477',
        NULL,
        1970, NULL,
        'Technology-driven genre spanning krautrock, synth-pop, house, techno, and ambient. '
        'The sound of modernity and the backbone of club culture.',
        6
    ),
    (
        'Hip-Hop',
        'hip-hop',
        '#9b59b6',
        NULL,
        1973, NULL,
        'Born in the South Bronx, hip-hop unified DJing, MCing, breakdancing, and graffiti '
        'into a cultural movement. Now the world''s most-streamed genre.',
        7
    ),
    (
        'Pop',
        'pop',
        '#e87ecf',
        NULL,
        1958, NULL,
        'Commercially oriented music designed for wide appeal. Pop absorbs and synthesizes '
        'other genres, constantly reinventing itself across every decade.',
        8
    ),
    (
        'Punk',
        'punk',
        '#e8a62e',
        NULL,
        1974, NULL,
        'A raw, fast, anti-establishment reaction to the excesses of 1970s rock. '
        'Gave birth to post-punk, new wave, hardcore, and indie rock.',
        9
    ),
    (
        'Metal',
        'metal',
        '#8c8c8c',
        NULL,
        1968, NULL,
        'Descended from heavy blues-rock, metal prioritizes distortion, power, and extremity. '
        'Spawned dozens of subgenres from glam to death to black metal.',
        10
    )
ON CONFLICT (slug) DO UPDATE
    SET
        name        = EXCLUDED.name,
        color       = EXCLUDED.color,
        era_start   = EXCLUDED.era_start,
        description = EXCLUDED.description,
        sort_order  = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------------
-- SUB-GENRES (sample set — expand via ETL)
-- ---------------------------------------------------------------------------
INSERT INTO genres (name, slug, color, parent_genre_id, era_start, era_end, description, sort_order)
VALUES
    -- Blues sub-genres
    ('Delta Blues',      'delta-blues',      '#4a90d9', (SELECT id FROM genres WHERE slug='blues'),      1900, NULL, 'Raw, acoustic solo blues from the Mississippi Delta region.',              11),
    ('Chicago Blues',    'chicago-blues',    '#6aaae9', (SELECT id FROM genres WHERE slug='blues'),      1940, NULL, 'Electric, band-based blues that migrated north with the Great Migration.',  12),
    -- Jazz sub-genres
    ('Bebop',            'bebop',            '#d4a843', (SELECT id FROM genres WHERE slug='jazz'),       1940, NULL, 'Fast, complex improvisational jazz developed by Parker and Gillespie.',    13),
    ('Fusion',           'jazz-fusion',      '#e4b853', (SELECT id FROM genres WHERE slug='jazz'),       1968, NULL, 'Jazz blended with rock and funk electric instrumentation.',                14),
    -- Rock sub-genres
    ('Psychedelic Rock', 'psychedelic-rock', '#d94452', (SELECT id FROM genres WHERE slug='rock'),       1965, 1975, 'LSD-influenced experimental rock with studio manipulation.',              15),
    ('Grunge',           'grunge',           '#b93342', (SELECT id FROM genres WHERE slug='rock'),       1986, 1997, 'Heavy, distorted Seattle-born rock with introspective lyrics.',            16),
    ('Indie Rock',       'indie-rock',       '#c94452', (SELECT id FROM genres WHERE slug='rock'),       1980, NULL, 'Independent-label alternative rock spanning countless micro-genres.',      17),
    -- Electronic sub-genres
    ('House',            'house',            '#5dd477', (SELECT id FROM genres WHERE slug='electronic'), 1984, NULL, 'Four-on-the-floor Chicago dance music pioneered at The Warehouse.',       18),
    ('Techno',           'techno',           '#4dc467', (SELECT id FROM genres WHERE slug='electronic'), 1985, NULL, 'Mechanical, industrial dance music from Detroit.',                         19),
    ('Ambient',          'ambient',          '#7de497', (SELECT id FROM genres WHERE slug='electronic'), 1978, NULL, 'Textural, atmosphere-first electronic music pioneered by Brian Eno.',    20),
    -- Hip-Hop sub-genres
    ('Gangsta Rap',      'gangsta-rap',      '#9b59b6', (SELECT id FROM genres WHERE slug='hip-hop'),   1986, NULL, 'West Coast hip-hop depicting street life; pioneered by N.W.A.',           21),
    ('Trap',             'trap',             '#ab69c6', (SELECT id FROM genres WHERE slug='hip-hop'),   2003, NULL, 'Atlanta-born hip-hop with heavy 808 bass and hi-hat rolls.',               22),
    -- Metal sub-genres
    ('Heavy Metal',      'heavy-metal',      '#8c8c8c', (SELECT id FROM genres WHERE slug='metal'),     1968, NULL, 'The original metal form: loud, riff-driven, and blues-influenced.',       23),
    ('Thrash Metal',     'thrash-metal',     '#9c9c9c', (SELECT id FROM genres WHERE slug='metal'),     1982, NULL, 'Extreme-tempo metal combining punk aggression with technical precision.', 24)
ON CONFLICT (slug) DO UPDATE
    SET
        name          = EXCLUDED.name,
        color         = EXCLUDED.color,
        parent_genre_id = EXCLUDED.parent_genre_id,
        era_start     = EXCLUDED.era_start,
        description   = EXCLUDED.description,
        sort_order    = EXCLUDED.sort_order;
