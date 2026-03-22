/**
 * Visual History of Music (VHM) — Drizzle ORM Schema
 * Target: SQLite via better-sqlite3
 *
 * Mirrors the PostgreSQL schema but adapted for SQLite constraints:
 *  - No native UUID type → TEXT with default crypto.randomUUID()
 *  - No ARRAY type → JSON text columns
 *  - No ENUM type → TEXT with Zod/app-level validation
 *  - No native BOOLEAN → INTEGER (0/1) via Drizzle's integer({ mode: 'boolean' })
 *  - Timestamps → INTEGER (Unix ms) or TEXT (ISO 8601)
 */

import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// DECADES
// ---------------------------------------------------------------------------
export const decades = sqliteTable(
  "decades",
  {
    id:           integer("id").primaryKey({ autoIncrement: true }),
    decadeLabel:  text("decade_label").notNull().unique(),   // '1920s'
    startYear:    integer("start_year").notNull(),
    endYear:      integer("end_year").notNull(),
    description:  text("description"),
    createdAt:    text("created_at")
                    .notNull()
                    .default(sql`(datetime('now'))`),
  },
  (t) => ({
    startYearIdx: index("idx_decades_start_year").on(t.startYear),
  })
);

// ---------------------------------------------------------------------------
// GENRES
// ---------------------------------------------------------------------------
export const genres = sqliteTable(
  "genres",
  {
    id:            integer("id").primaryKey({ autoIncrement: true }),
    name:          text("name").notNull().unique(),
    slug:          text("slug").notNull().unique(),
    color:         text("color").notNull(),              // '#4a90d9'
    parentGenreId: integer("parent_genre_id").references(() => genres.id),
    eraStart:      integer("era_start"),
    eraEnd:        integer("era_end"),
    description:   text("description"),
    sortOrder:     integer("sort_order").notNull().default(0),
    createdAt:     text("created_at")
                     .notNull()
                     .default(sql`(datetime('now'))`),
    updatedAt:     text("updated_at")
                     .notNull()
                     .default(sql`(datetime('now'))`),
  },
  (t) => ({
    parentIdx: index("idx_genres_parent").on(t.parentGenreId),
    eraIdx:    index("idx_genres_era").on(t.eraStart, t.eraEnd),
  })
);

// ---------------------------------------------------------------------------
// ARTISTS
// ---------------------------------------------------------------------------
export const artists = sqliteTable(
  "artists",
  {
    id:                 integer("id").primaryKey({ autoIncrement: true }),
    name:               text("name").notNull(),
    slug:               text("slug").notNull().unique(),
    mbid:               text("mbid"),              // MusicBrainz UUID string
    wikidataId:         text("wikidata_id"),        // 'Q392'
    birthYear:          integer("birth_year"),
    deathYear:          integer("death_year"),
    nationality:        text("nationality"),
    bio:                text("bio"),
    imageUrl:           text("image_url"),
    significanceScore:  real("significance_score").notNull().default(0),
    isGroup:            integer("is_group", { mode: "boolean" }).notNull().default(false),
    createdAt:          text("created_at")
                          .notNull()
                          .default(sql`(datetime('now'))`),
    updatedAt:          text("updated_at")
                          .notNull()
                          .default(sql`(datetime('now'))`),
  },
  (t) => ({
    mbidIdx:          uniqueIndex("idx_artists_mbid").on(t.mbid),
    birthYearIdx:     index("idx_artists_birth_year").on(t.birthYear),
    nationalityIdx:   index("idx_artists_nationality").on(t.nationality),
    significanceIdx:  index("idx_artists_significance").on(t.significanceScore),
  })
);

// ---------------------------------------------------------------------------
// ARTIST_GENRES  (many-to-many)
// ---------------------------------------------------------------------------
export const artistGenres = sqliteTable(
  "artist_genres",
  {
    artistId:  integer("artist_id")
                 .notNull()
                 .references(() => artists.id, { onDelete: "cascade" }),
    genreId:   integer("genre_id")
                 .notNull()
                 .references(() => genres.id, { onDelete: "cascade" }),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
                 .notNull()
                 .default(sql`(datetime('now'))`),
  },
  (t) => ({
    pk:        primaryKey({ columns: [t.artistId, t.genreId] }),
    genreIdx:  index("idx_artist_genres_genre").on(t.genreId),
  })
);

// ---------------------------------------------------------------------------
// PERFORMANCES / RECORDINGS
// ---------------------------------------------------------------------------
export const performances = sqliteTable(
  "performances",
  {
    id:                  integer("id").primaryKey({ autoIncrement: true }),
    title:               text("title").notNull(),
    artistId:            integer("artist_id")
                           .notNull()
                           .references(() => artists.id, { onDelete: "cascade" }),
    year:                integer("year").notNull(),
    decadeId:            integer("decade_id").references(() => decades.id),
    genreId:             integer("genre_id").references(() => genres.id),
    subgenreId:          integer("subgenre_id").references(() => genres.id),
    description:         text("description"),
    youtubeVideoId:      text("youtube_video_id"),
    youtubeSearchQuery:  text("youtube_search_query"),
    /** JSON-encoded string array, e.g. '["blues","guitar","delta"]' */
    tags:                text("tags"),
    significanceScore:   real("significance_score").notNull().default(0),
    isAlbum:             integer("is_album", { mode: "boolean" }).notNull().default(false),
    isLive:              integer("is_live", { mode: "boolean" }).notNull().default(false),
    durationSeconds:     integer("duration_seconds"),
    createdAt:           text("created_at")
                           .notNull()
                           .default(sql`(datetime('now'))`),
    updatedAt:           text("updated_at")
                           .notNull()
                           .default(sql`(datetime('now'))`),
  },
  (t) => ({
    artistIdx:       index("idx_performances_artist").on(t.artistId),
    genreIdx:        index("idx_performances_genre").on(t.genreId),
    subgenreIdx:     index("idx_performances_subgenre").on(t.subgenreId),
    yearIdx:         index("idx_performances_year").on(t.year),
    decadeIdx:       index("idx_performances_decade").on(t.decadeId),
    significanceIdx: index("idx_performances_significance").on(t.significanceScore),
    genreYearIdx:    index("idx_performances_genre_year").on(
                       t.genreId, t.year, t.significanceScore
                     ),
  })
);

// ---------------------------------------------------------------------------
// INFLUENCE_RELATIONSHIPS
// SQLite has no native ENUM — store as TEXT, validate in app layer
// Valid values: 'influenced_by' | 'collaborated_with' | 'member_of' | 'sampled' | 'produced_by'
// ---------------------------------------------------------------------------
export const influenceRelationships = sqliteTable(
  "influence_relationships",
  {
    id:               integer("id").primaryKey({ autoIncrement: true }),
    sourceArtistId:   integer("source_artist_id")
                        .notNull()
                        .references(() => artists.id, { onDelete: "cascade" }),
    targetArtistId:   integer("target_artist_id")
                        .notNull()
                        .references(() => artists.id, { onDelete: "cascade" }),
    relationshipType: text("relationship_type").notNull(),
    strength:         real("strength").notNull().default(1.0),  // 0.0–1.0
    yearStart:        integer("year_start"),
    yearEnd:          integer("year_end"),
    notes:            text("notes"),
    createdAt:        text("created_at")
                        .notNull()
                        .default(sql`(datetime('now'))`),
  },
  (t) => ({
    sourceIdx:  index("idx_influence_source").on(t.sourceArtistId),
    targetIdx:  index("idx_influence_target").on(t.targetArtistId),
    typeIdx:    index("idx_influence_type").on(t.relationshipType),
    uniqueEdge: uniqueIndex("uq_influence_edge").on(
                  t.sourceArtistId, t.targetArtistId, t.relationshipType
                ),
  })
);

// ---------------------------------------------------------------------------
// AWARDS
// ---------------------------------------------------------------------------
export const awards = sqliteTable(
  "awards",
  {
    id:         integer("id").primaryKey({ autoIncrement: true }),
    artistId:   integer("artist_id")
                  .notNull()
                  .references(() => artists.id, { onDelete: "cascade" }),
    awardName:  text("award_name").notNull(),
    category:   text("category"),
    year:       integer("year").notNull(),
    isWin:      integer("is_win", { mode: "boolean" }).notNull().default(true),
    notes:      text("notes"),
    createdAt:  text("created_at")
                  .notNull()
                  .default(sql`(datetime('now'))`),
  },
  (t) => ({
    artistIdx:  index("idx_awards_artist").on(t.artistId),
    yearIdx:    index("idx_awards_year").on(t.year),
  })
);

// ---------------------------------------------------------------------------
// USERS  (future)
// ---------------------------------------------------------------------------
export const users = sqliteTable(
  "users",
  {
    id:          text("id")
                   .primaryKey()
                   .$defaultFn(() => crypto.randomUUID()),
    username:    text("username").notNull().unique(),
    email:       text("email").notNull().unique(),
    displayName: text("display_name"),
    avatarUrl:   text("avatar_url"),
    isAdmin:     integer("is_admin", { mode: "boolean" }).notNull().default(false),
    createdAt:   text("created_at")
                   .notNull()
                   .default(sql`(datetime('now'))`),
    updatedAt:   text("updated_at")
                   .notNull()
                   .default(sql`(datetime('now'))`),
  },
  (t) => ({
    emailIdx: index("idx_users_email").on(t.email),
  })
);

// ---------------------------------------------------------------------------
// USER_RATINGS  (future)
// ---------------------------------------------------------------------------
export const userRatings = sqliteTable(
  "user_ratings",
  {
    id:            integer("id").primaryKey({ autoIncrement: true }),
    userId:        text("user_id")
                     .notNull()
                     .references(() => users.id, { onDelete: "cascade" }),
    performanceId: integer("performance_id")
                     .notNull()
                     .references(() => performances.id, { onDelete: "cascade" }),
    rating:        integer("rating").notNull(),   // 1–5
    review:        text("review"),
    createdAt:     text("created_at")
                     .notNull()
                     .default(sql`(datetime('now'))`),
    updatedAt:     text("updated_at")
                     .notNull()
                     .default(sql`(datetime('now'))`),
  },
  (t) => ({
    uniqueRating:     uniqueIndex("uq_user_rating").on(t.userId, t.performanceId),
    userIdx:          index("idx_user_ratings_user").on(t.userId),
    performanceIdx:   index("idx_user_ratings_performance").on(t.performanceId),
  })
);

// ---------------------------------------------------------------------------
// TypeScript type exports (inferred from schema)
// ---------------------------------------------------------------------------
export type Decade              = typeof decades.$inferSelect;
export type NewDecade           = typeof decades.$inferInsert;

export type Genre               = typeof genres.$inferSelect;
export type NewGenre            = typeof genres.$inferInsert;

export type Artist              = typeof artists.$inferSelect;
export type NewArtist           = typeof artists.$inferInsert;

export type ArtistGenre         = typeof artistGenres.$inferSelect;
export type NewArtistGenre      = typeof artistGenres.$inferInsert;

export type Performance         = typeof performances.$inferSelect;
export type NewPerformance      = typeof performances.$inferInsert;

export type InfluenceRelationship    = typeof influenceRelationships.$inferSelect;
export type NewInfluenceRelationship = typeof influenceRelationships.$inferInsert;

export type Award               = typeof awards.$inferSelect;
export type NewAward            = typeof awards.$inferInsert;

export type User                = typeof users.$inferSelect;
export type NewUser             = typeof users.$inferInsert;

export type UserRating          = typeof userRatings.$inferSelect;
export type NewUserRating       = typeof userRatings.$inferInsert;

// ---------------------------------------------------------------------------
// Influence type union (mirrors the PostgreSQL ENUM)
// ---------------------------------------------------------------------------
export type InfluenceType =
  | "influenced_by"
  | "collaborated_with"
  | "member_of"
  | "sampled"
  | "produced_by";
