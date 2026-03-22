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
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ---------------------------------------------------------------------------
// DECADES
// ---------------------------------------------------------------------------
export const decades = sqliteTable("decades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  decadeLabel: text("decade_label").notNull().unique(),
  startYear: integer("start_year").notNull(),
  endYear: integer("end_year").notNull(),
  description: text("description"),
});

// ---------------------------------------------------------------------------
// GENRES
// ---------------------------------------------------------------------------
export const genres = sqliteTable("genres", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  color: text("color").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ---------------------------------------------------------------------------
// ARTISTS
// ---------------------------------------------------------------------------
export const artists = sqliteTable(
  "artists",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    mbid: text("mbid"),
    wikidataId: text("wikidata_id"),
    birthYear: integer("birth_year"),
    deathYear: integer("death_year"),
    nationality: text("nationality"),
    bio: text("bio"),
    significanceScore: real("significance_score").notNull().default(0),
    isGroup: integer("is_group", { mode: "boolean" }).notNull().default(false),
    tags: text("tags"), // JSON array
  },
  (t) => ({
    mbidIdx: uniqueIndex("idx_artists_mbid").on(t.mbid),
    significanceIdx: index("idx_artists_significance").on(t.significanceScore),
  })
);

// ---------------------------------------------------------------------------
// ARTIST_GENRES (many-to-many)
// ---------------------------------------------------------------------------
export const artistGenres = sqliteTable(
  "artist_genres",
  {
    artistId: integer("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    genreId: integer("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" }),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.artistId, t.genreId] }),
  })
);

// ---------------------------------------------------------------------------
// PERFORMANCES
// ---------------------------------------------------------------------------
export const performances = sqliteTable(
  "performances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    artistId: integer("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    decadeId: integer("decade_id").references(() => decades.id),
    genreId: integer("genre_id").references(() => genres.id),
    subgenre: text("subgenre"),
    description: text("description"),
    youtubeSearchQuery: text("youtube_search_query"),
    tags: text("tags"), // JSON array
    significanceScore: real("significance_score").notNull().default(0),
    isAlbum: integer("is_album", { mode: "boolean" }).notNull().default(false),
  },
  (t) => ({
    artistIdx: index("idx_performances_artist").on(t.artistId),
    genreIdx: index("idx_performances_genre").on(t.genreId),
    yearIdx: index("idx_performances_year").on(t.year),
    decadeIdx: index("idx_performances_decade").on(t.decadeId),
  })
);

// ---------------------------------------------------------------------------
// INFLUENCE_RELATIONSHIPS
// ---------------------------------------------------------------------------
export const influenceRelationships = sqliteTable(
  "influence_relationships",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceArtistId: integer("source_artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    targetArtistId: integer("target_artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    relationshipType: text("relationship_type").notNull().default("influenced_by"),
    strength: real("strength").notNull().default(1.0),
  },
  (t) => ({
    sourceIdx: index("idx_influence_source").on(t.sourceArtistId),
    targetIdx: index("idx_influence_target").on(t.targetArtistId),
    uniqueEdge: uniqueIndex("uq_influence_edge").on(
      t.sourceArtistId,
      t.targetArtistId,
      t.relationshipType
    ),
  })
);

// ---------------------------------------------------------------------------
// AWARDS
// ---------------------------------------------------------------------------
export const awards = sqliteTable(
  "awards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    artistId: integer("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    awardName: text("award_name").notNull(),
    year: integer("year"),
  },
  (t) => ({
    artistIdx: index("idx_awards_artist").on(t.artistId),
  })
);

// ---------------------------------------------------------------------------
// Insert Schemas
// ---------------------------------------------------------------------------
export const insertDecadeSchema = createInsertSchema(decades).omit({ id: true });
export const insertGenreSchema = createInsertSchema(genres).omit({ id: true });
export const insertArtistSchema = createInsertSchema(artists).omit({ id: true });
export const insertPerformanceSchema = createInsertSchema(performances).omit({ id: true });
export const insertInfluenceSchema = createInsertSchema(influenceRelationships).omit({ id: true });
export const insertAwardSchema = createInsertSchema(awards).omit({ id: true });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type Decade = typeof decades.$inferSelect;
export type InsertDecade = z.infer<typeof insertDecadeSchema>;

export type Genre = typeof genres.$inferSelect;
export type InsertGenre = z.infer<typeof insertGenreSchema>;

export type Artist = typeof artists.$inferSelect;
export type InsertArtist = z.infer<typeof insertArtistSchema>;

export type ArtistGenre = typeof artistGenres.$inferSelect;

export type Performance = typeof performances.$inferSelect;
export type InsertPerformance = z.infer<typeof insertPerformanceSchema>;

export type InfluenceRelationship = typeof influenceRelationships.$inferSelect;
export type InsertInfluence = z.infer<typeof insertInfluenceSchema>;

export type Award = typeof awards.$inferSelect;
export type InsertAward = z.infer<typeof insertAwardSchema>;

// Genre color constants for frontend usage
export const GENRE_COLORS: Record<string, string> = {
  Blues: "#4a90d9",
  Jazz: "#d4a843",
  Country: "#c17a3a",
  Rock: "#d94452",
  "Soul/R&B": "#3ab5a5",
  Electronic: "#5dd477",
  "Hip-Hop": "#9b59b6",
  Pop: "#e87ecf",
  Punk: "#e8a62e",
  Metal: "#8c8c8c",
};

export const DECADE_LIST = [
  "1920s", "1930s", "1940s", "1950s", "1960s",
  "1970s", "1980s", "1990s", "2000s", "2010s", "2020s",
];
