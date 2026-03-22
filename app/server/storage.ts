import {
  decades, genres, artists, artistGenres, performances,
  influenceRelationships, awards,
  type Decade, type Genre, type Artist, type Performance,
  type InfluenceRelationship, type Award, type ArtistGenre,
  GENRE_COLORS,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, like, or, and, desc, asc, sql, inArray } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
export const db = drizzle(sqlite);

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS decades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    decade_label TEXT NOT NULL UNIQUE,
    start_year INTEGER NOT NULL,
    end_year INTEGER NOT NULL,
    description TEXT
  );
  CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    mbid TEXT,
    wikidata_id TEXT,
    birth_year INTEGER,
    death_year INTEGER,
    nationality TEXT,
    bio TEXT,
    significance_score REAL NOT NULL DEFAULT 0,
    is_group INTEGER NOT NULL DEFAULT 0,
    tags TEXT
  );
  CREATE TABLE IF NOT EXISTS artist_genres (
    artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    is_primary INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (artist_id, genre_id)
  );
  CREATE TABLE IF NOT EXISTS performances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    decade_id INTEGER REFERENCES decades(id),
    genre_id INTEGER REFERENCES genres(id),
    subgenre TEXT,
    description TEXT,
    youtube_search_query TEXT,
    tags TEXT,
    significance_score REAL NOT NULL DEFAULT 0,
    is_album INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS influence_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    target_artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL DEFAULT 'influenced_by',
    strength REAL NOT NULL DEFAULT 1.0
  );
  CREATE TABLE IF NOT EXISTS awards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    award_name TEXT NOT NULL,
    year INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_performances_artist ON performances(artist_id);
  CREATE INDEX IF NOT EXISTS idx_performances_genre ON performances(genre_id);
  CREATE INDEX IF NOT EXISTS idx_performances_year ON performances(year);
  CREATE INDEX IF NOT EXISTS idx_performances_decade ON performances(decade_id);
  CREATE INDEX IF NOT EXISTS idx_influence_source ON influence_relationships(source_artist_id);
  CREATE INDEX IF NOT EXISTS idx_influence_target ON influence_relationships(target_artist_id);
  CREATE INDEX IF NOT EXISTS idx_awards_artist ON awards(artist_id);
  CREATE INDEX IF NOT EXISTS idx_artists_significance ON artists(significance_score);
`);

// ---------------------------------------------------------------------------
// Data Import
// ---------------------------------------------------------------------------
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function importDataIfEmpty() {
  const count = db.select({ count: sql<number>`count(*)` }).from(artists).get();
  if (count && count.count > 0) {
    console.log(`Database already has ${count.count} artists, skipping import.`);
    return;
  }

  console.log("Importing data from performances.json...");

  // Try multiple paths for the data file
  const possiblePaths = [
    path.join(process.cwd(), "server", "data", "performances.json"),
    path.join(process.cwd(), "dist", "server", "data", "performances.json"),
    path.resolve("server/data/performances.json"),
  ];
  let dataPath = possiblePaths.find(p => fs.existsSync(p));
  if (!dataPath) {
    console.error("Could not find performances.json, tried:", possiblePaths);
    return;
  }

  const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const perfData: any[] = raw.performances;
  const artistData: any[] = raw.artists;
  const influenceGraph = raw.influence_graph;

  // 1. Insert decades
  const decadeLabels = [
    "1920s","1930s","1940s","1950s","1960s","1970s","1980s","1990s","2000s","2010s","2020s",
  ];
  const decadeMap: Record<string, number> = {};
  for (const label of decadeLabels) {
    const startYear = parseInt(label);
    const result = db.insert(decades).values({
      decadeLabel: label,
      startYear,
      endYear: startYear + 9,
    }).returning().get();
    decadeMap[label] = result.id;
  }

  // 2. Insert genres
  const genreNames = Object.keys(GENRE_COLORS);
  const genreMap: Record<string, number> = {};
  for (let i = 0; i < genreNames.length; i++) {
    const name = genreNames[i];
    const result = db.insert(genres).values({
      name,
      slug: slugify(name),
      color: GENRE_COLORS[name],
      sortOrder: i,
    }).returning().get();
    genreMap[name] = result.id;
  }

  // 3. Insert artists
  const artistMap: Record<string, number> = {}; // mbid -> db id
  const artistNameMap: Record<string, number> = {}; // name -> db id
  for (const a of artistData) {
    const result = db.insert(artists).values({
      name: a.name,
      slug: slugify(a.name),
      mbid: a.mbid || null,
      wikidataId: a.wikidata_id || null,
      birthYear: a.birth_year || null,
      deathYear: a.death_year || null,
      nationality: a.nationality || null,
      bio: a.subgenre ? `${a.subgenre} artist` : null,
      significanceScore: a.significance || 0,
      isGroup: false,
      tags: a.tags ? JSON.stringify(a.tags) : null,
    }).returning().get();

    if (a.mbid) artistMap[a.mbid] = result.id;
    artistNameMap[a.name] = result.id;

    // Insert artist-genre relationships
    if (a.genres && Array.isArray(a.genres)) {
      for (let i = 0; i < a.genres.length; i++) {
        const genreId = genreMap[a.genres[i]];
        if (genreId) {
          db.insert(artistGenres).values({
            artistId: result.id,
            genreId,
            isPrimary: i === 0,
          }).run();
        }
      }
    }

    // Insert awards
    if (a.awards && Array.isArray(a.awards)) {
      for (const award of a.awards) {
        db.insert(awards).values({
          artistId: result.id,
          awardName: award,
        }).run();
      }
    }
  }

  // 4. Insert performances
  for (const p of perfData) {
    const artistId = p.artist_mbid ? artistMap[p.artist_mbid] : artistNameMap[p.artist];
    if (!artistId) continue;

    const genreId = genreMap[p.genre] || null;
    const decadeId = decadeMap[p.decade] || null;

    db.insert(performances).values({
      title: p.title,
      artistId,
      year: p.year,
      decadeId,
      genreId,
      subgenre: p.subgenre || null,
      description: p.description || null,
      youtubeSearchQuery: p.youtube_search_query || null,
      tags: p.tags ? JSON.stringify(p.tags) : null,
      significanceScore: p.significance_score || 0,
      isAlbum: false,
    }).run();
  }

  // 5. Insert influence relationships from the graph
  if (influenceGraph && influenceGraph.edges) {
    for (const edge of influenceGraph.edges) {
      const sourceId = artistMap[edge.source];
      const targetId = artistMap[edge.target];
      if (sourceId && targetId) {
        try {
          db.insert(influenceRelationships).values({
            sourceArtistId: sourceId,
            targetArtistId: targetId,
            relationshipType: edge.type || "influenced_by",
            strength: 1.0,
          }).run();
        } catch (e) {
          // Skip duplicates
        }
      }
    }
  }

  const perfCount = db.select({ count: sql<number>`count(*)` }).from(performances).get();
  const artCount = db.select({ count: sql<number>`count(*)` }).from(artists).get();
  const inflCount = db.select({ count: sql<number>`count(*)` }).from(influenceRelationships).get();
  console.log(`Imported ${artCount?.count} artists, ${perfCount?.count} performances, ${inflCount?.count} influence edges.`);
}

// ---------------------------------------------------------------------------
// Storage Interface
// ---------------------------------------------------------------------------
export interface IStorage {
  // Performances
  getPerformances(filters?: { genre?: string; decade?: string; page?: number; limit?: number }): Performance[];
  getPerformanceById(id: number): any;
  getPerformanceCount(filters?: { genre?: string; decade?: string }): number;

  // Artists
  getArtists(): any[];
  getArtistById(id: number): any;

  // Genres
  getGenres(): Genre[];

  // Influences
  getInfluences(artistId: number): any;

  // Compare
  getCompareData(id1: number, id2: number): any;

  // Stats
  getStats(): any;

  // Search
  search(q: string): any;
}

export class DatabaseStorage implements IStorage {
  getPerformances(filters?: { genre?: string; decade?: string; page?: number; limit?: number }): any[] {
    const page = filters?.page || 1;
    const limit = filters?.limit || 100;
    const offset = (page - 1) * limit;

    let query = db.select({
      id: performances.id,
      title: performances.title,
      year: performances.year,
      subgenre: performances.subgenre,
      description: performances.description,
      youtubeSearchQuery: performances.youtubeSearchQuery,
      significanceScore: performances.significanceScore,
      artistId: performances.artistId,
      artistName: artists.name,
      genreName: genres.name,
      genreColor: genres.color,
      decadeLabel: decades.decadeLabel,
    })
    .from(performances)
    .leftJoin(artists, eq(performances.artistId, artists.id))
    .leftJoin(genres, eq(performances.genreId, genres.id))
    .leftJoin(decades, eq(performances.decadeId, decades.id));

    const conditions: any[] = [];
    if (filters?.genre) {
      conditions.push(eq(genres.name, filters.genre));
    }
    if (filters?.decade) {
      conditions.push(eq(decades.decadeLabel, filters.decade));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return (query as any).orderBy(asc(performances.year), desc(performances.significanceScore))
      .limit(limit).offset(offset).all();
  }

  getPerformanceCount(filters?: { genre?: string; decade?: string }): number {
    let query = db.select({ count: sql<number>`count(*)` })
      .from(performances)
      .leftJoin(genres, eq(performances.genreId, genres.id))
      .leftJoin(decades, eq(performances.decadeId, decades.id));

    const conditions: any[] = [];
    if (filters?.genre) conditions.push(eq(genres.name, filters.genre));
    if (filters?.decade) conditions.push(eq(decades.decadeLabel, filters.decade));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const result = (query as any).get();
    return result?.count || 0;
  }

  getPerformanceById(id: number): any {
    return db.select({
      id: performances.id,
      title: performances.title,
      year: performances.year,
      subgenre: performances.subgenre,
      description: performances.description,
      youtubeSearchQuery: performances.youtubeSearchQuery,
      significanceScore: performances.significanceScore,
      artistId: performances.artistId,
      artistName: artists.name,
      genreName: genres.name,
      genreColor: genres.color,
      decadeLabel: decades.decadeLabel,
    })
    .from(performances)
    .leftJoin(artists, eq(performances.artistId, artists.id))
    .leftJoin(genres, eq(performances.genreId, genres.id))
    .leftJoin(decades, eq(performances.decadeId, decades.id))
    .where(eq(performances.id, id))
    .get();
  }

  getArtists(): any[] {
    const result = db.select({
      id: artists.id,
      name: artists.name,
      slug: artists.slug,
      mbid: artists.mbid,
      birthYear: artists.birthYear,
      deathYear: artists.deathYear,
      nationality: artists.nationality,
      significanceScore: artists.significanceScore,
      tags: artists.tags,
    }).from(artists).orderBy(desc(artists.significanceScore)).all();

    return result.map(a => {
      // Get genres for artist
      const artistGenreRows = db.select({
        genreName: genres.name,
        genreColor: genres.color,
        isPrimary: artistGenres.isPrimary,
      })
      .from(artistGenres)
      .leftJoin(genres, eq(artistGenres.genreId, genres.id))
      .where(eq(artistGenres.artistId, a.id))
      .all();

      return {
        ...a,
        tags: a.tags ? JSON.parse(a.tags) : [],
        genres: artistGenreRows.map(g => ({ name: g.genreName, color: g.genreColor, isPrimary: g.isPrimary })),
        primaryGenre: artistGenreRows.find(g => g.isPrimary)?.genreName || artistGenreRows[0]?.genreName || "Unknown",
        primaryGenreColor: artistGenreRows.find(g => g.isPrimary)?.genreColor || artistGenreRows[0]?.genreColor || "#666",
      };
    });
  }

  getArtistById(id: number): any {
    const a = db.select().from(artists).where(eq(artists.id, id)).get();
    if (!a) return null;

    const artistGenreRows = db.select({
      genreName: genres.name,
      genreColor: genres.color,
      isPrimary: artistGenres.isPrimary,
    })
    .from(artistGenres)
    .leftJoin(genres, eq(artistGenres.genreId, genres.id))
    .where(eq(artistGenres.artistId, id))
    .all();

    const perfs = db.select({
      id: performances.id,
      title: performances.title,
      year: performances.year,
      subgenre: performances.subgenre,
      significanceScore: performances.significanceScore,
      genreName: genres.name,
      genreColor: genres.color,
      youtubeSearchQuery: performances.youtubeSearchQuery,
    })
    .from(performances)
    .leftJoin(genres, eq(performances.genreId, genres.id))
    .where(eq(performances.artistId, id))
    .orderBy(asc(performances.year))
    .all();

    const artistAwards = db.select().from(awards).where(eq(awards.artistId, id)).all();

    // Get influences
    const influencedBy = db.select({
      id: artists.id,
      name: artists.name,
    })
    .from(influenceRelationships)
    .innerJoin(artists, eq(influenceRelationships.targetArtistId, artists.id))
    .where(eq(influenceRelationships.sourceArtistId, id))
    .all();

    const influenced = db.select({
      id: artists.id,
      name: artists.name,
    })
    .from(influenceRelationships)
    .innerJoin(artists, eq(influenceRelationships.sourceArtistId, artists.id))
    .where(eq(influenceRelationships.targetArtistId, id))
    .all();

    return {
      ...a,
      tags: a.tags ? JSON.parse(a.tags) : [],
      genres: artistGenreRows.map(g => ({ name: g.genreName, color: g.genreColor, isPrimary: g.isPrimary })),
      primaryGenre: artistGenreRows.find(g => g.isPrimary)?.genreName || artistGenreRows[0]?.genreName || "Unknown",
      primaryGenreColor: artistGenreRows.find(g => g.isPrimary)?.genreColor || artistGenreRows[0]?.genreColor || "#666",
      performances: perfs,
      awards: artistAwards,
      influencedBy,
      influenced,
    };
  }

  getGenres(): Genre[] {
    return db.select().from(genres).orderBy(asc(genres.sortOrder)).all();
  }

  getInfluences(artistId: number): any {
    const artist = db.select({ id: artists.id, name: artists.name }).from(artists).where(eq(artists.id, artistId)).get();
    if (!artist) return null;

    const artistGenreRows = db.select({
      genreName: genres.name,
      genreColor: genres.color,
    })
    .from(artistGenres)
    .leftJoin(genres, eq(artistGenres.genreId, genres.id))
    .where(eq(artistGenres.artistId, artistId))
    .all();

    // Influenced by (source = this artist, target = influencer)
    const influencedByRows = db.select({
      id: artists.id,
      name: artists.name,
    })
    .from(influenceRelationships)
    .innerJoin(artists, eq(influenceRelationships.targetArtistId, artists.id))
    .where(eq(influenceRelationships.sourceArtistId, artistId))
    .all();

    // Influenced (other artists that this artist influenced -> they have source = other, target = this)
    const influencedRows = db.select({
      id: artists.id,
      name: artists.name,
    })
    .from(influenceRelationships)
    .innerJoin(artists, eq(influenceRelationships.sourceArtistId, artists.id))
    .where(eq(influenceRelationships.targetArtistId, artistId))
    .all();

    // Get genre info for each connected artist
    const enrichArtist = (a: { id: number; name: string }) => {
      const g = db.select({ genreName: genres.name, genreColor: genres.color })
        .from(artistGenres)
        .leftJoin(genres, eq(artistGenres.genreId, genres.id))
        .where(eq(artistGenres.artistId, a.id))
        .get();
      return { ...a, genre: g?.genreName || "Unknown", genreColor: g?.genreColor || "#666" };
    };

    return {
      artist: {
        ...artist,
        genre: artistGenreRows[0]?.genreName || "Unknown",
        genreColor: artistGenreRows[0]?.genreColor || "#666",
      },
      influencedBy: influencedByRows.map(enrichArtist),
      influenced: influencedRows.map(enrichArtist),
    };
  }

  getCompareData(id1: number, id2: number): any {
    const a1 = this.getArtistById(id1);
    const a2 = this.getArtistById(id2);
    if (!a1 || !a2) return null;

    // Find common influences
    const a1InfluencedByIds = new Set(a1.influencedBy.map((a: any) => a.id));
    const a2InfluencedByIds = new Set(a2.influencedBy.map((a: any) => a.id));
    const commonInfluences = a1.influencedBy.filter((a: any) => a2InfluencedByIds.has(a.id));

    // Calculate overlapping years
    const a1Start = a1.birthYear ? a1.birthYear + 18 : (a1.performances[0]?.year || 1920);
    const a1End = a1.deathYear || (a1.performances[a1.performances.length - 1]?.year || 2025);
    const a2Start = a2.birthYear ? a2.birthYear + 18 : (a2.performances[0]?.year || 1920);
    const a2End = a2.deathYear || (a2.performances[a2.performances.length - 1]?.year || 2025);

    const overlapStart = Math.max(a1Start, a2Start);
    const overlapEnd = Math.min(a1End, a2End);

    return {
      artist1: a1,
      artist2: a2,
      commonInfluences,
      overlap: overlapStart < overlapEnd ? { start: overlapStart, end: overlapEnd } : null,
    };
  }

  getStats(): any {
    const genreCounts = db.select({
      genre: genres.name,
      color: genres.color,
      count: sql<number>`count(*)`,
    })
    .from(performances)
    .leftJoin(genres, eq(performances.genreId, genres.id))
    .groupBy(genres.name, genres.color)
    .all();

    const decadeCounts = db.select({
      decade: decades.decadeLabel,
      count: sql<number>`count(*)`,
    })
    .from(performances)
    .leftJoin(decades, eq(performances.decadeId, decades.id))
    .groupBy(decades.decadeLabel)
    .all();

    // Genre by decade for terrain chart
    const genreByDecade = db.select({
      genre: genres.name,
      color: genres.color,
      decade: decades.decadeLabel,
      count: sql<number>`count(*)`,
    })
    .from(performances)
    .leftJoin(genres, eq(performances.genreId, genres.id))
    .leftJoin(decades, eq(performances.decadeId, decades.id))
    .groupBy(genres.name, genres.color, decades.decadeLabel)
    .all();

    const totalPerformances = db.select({ count: sql<number>`count(*)` }).from(performances).get();
    const totalArtists = db.select({ count: sql<number>`count(*)` }).from(artists).get();

    return {
      totalPerformances: totalPerformances?.count || 0,
      totalArtists: totalArtists?.count || 0,
      genreCounts,
      decadeCounts,
      genreByDecade,
    };
  }

  search(q: string): any {
    const term = `%${q}%`;

    const matchedArtists = db.select({
      id: artists.id,
      name: artists.name,
      type: sql<string>`'artist'`,
    })
    .from(artists)
    .where(like(artists.name, term))
    .limit(20)
    .all();

    const matchedPerformances = db.select({
      id: performances.id,
      title: performances.title,
      year: performances.year,
      artistName: artists.name,
      genreName: genres.name,
      type: sql<string>`'performance'`,
    })
    .from(performances)
    .leftJoin(artists, eq(performances.artistId, artists.id))
    .leftJoin(genres, eq(performances.genreId, genres.id))
    .where(or(
      like(performances.title, term),
      like(artists.name, term),
    ))
    .limit(30)
    .all();

    return { artists: matchedArtists, performances: matchedPerformances };
  }
}

export const storage = new DatabaseStorage();
