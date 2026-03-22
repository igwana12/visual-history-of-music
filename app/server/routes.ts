import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, importDataIfEmpty } from "./storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Import data on startup
  importDataIfEmpty();

  // GET /api/performances
  app.get("/api/performances", (req, res) => {
    const { genre, decade, page, limit } = req.query;
    const filters = {
      genre: genre as string | undefined,
      decade: decade as string | undefined,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 100,
    };
    const data = storage.getPerformances(filters);
    const total = storage.getPerformanceCount(filters);
    res.json({ performances: data, total, page: filters.page, limit: filters.limit });
  });

  // GET /api/performances/:id
  app.get("/api/performances/:id", (req, res) => {
    const data = storage.getPerformanceById(parseInt(req.params.id));
    if (!data) return res.status(404).json({ error: "Performance not found" });
    res.json(data);
  });

  // GET /api/artists
  app.get("/api/artists", (_req, res) => {
    const data = storage.getArtists();
    res.json(data);
  });

  // GET /api/artists/:id
  app.get("/api/artists/:id", (req, res) => {
    const data = storage.getArtistById(parseInt(req.params.id));
    if (!data) return res.status(404).json({ error: "Artist not found" });
    res.json(data);
  });

  // GET /api/genres
  app.get("/api/genres", (_req, res) => {
    const data = storage.getGenres();
    res.json(data);
  });

  // GET /api/influences/:artistId
  app.get("/api/influences/:artistId", (req, res) => {
    const data = storage.getInfluences(parseInt(req.params.artistId));
    if (!data) return res.status(404).json({ error: "Artist not found" });
    res.json(data);
  });

  // GET /api/compare/:id1/:id2
  app.get("/api/compare/:id1/:id2", (req, res) => {
    const data = storage.getCompareData(
      parseInt(req.params.id1),
      parseInt(req.params.id2)
    );
    if (!data) return res.status(404).json({ error: "One or both artists not found" });
    res.json(data);
  });

  // GET /api/stats
  app.get("/api/stats", (_req, res) => {
    const data = storage.getStats();
    res.json(data);
  });

  // GET /api/search
  app.get("/api/search", (req, res) => {
    const q = req.query.q as string;
    if (!q || q.length < 2) return res.json({ artists: [], performances: [] });
    const data = storage.search(q);
    res.json(data);
  });

  return httpServer;
}
