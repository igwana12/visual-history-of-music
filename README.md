# Visual History of Music (VHM)

An interactive visualization platform exploring music history from the 1920s to the 2020s — across 2,798 performances, 237 artists, 10 genres, and 118 influence connections.

## Live Demos
- **Influence Chain Navigator**: [Demo](https://www.perplexity.ai/computer/a/74187d37-77ce-4e3c-bb38-1132fbc21fa3)
- **Compare View**: [Demo](https://www.perplexity.ai/computer/a/6dd813ad-7237-41e4-9a8e-9937975cbd42)

## Features

### 🎵 Terrain Timeline
Interactive D3.js stacked area chart showing genre evolution across decades. Click genre peaks to explore performances, with YouTube links and artist detail cards.

### 🔗 Influence Chain Navigator  
Explore artist-to-artist influence lineages. Click through connections from Robert Johnson → Muddy Waters → Jimi Hendrix → Prince. SVG connection lines, breadcrumb navigation, genre color-coded nodes.

### ⚡ Compare View
Side-by-side artist comparison with mini timelines, shared timeline ruler, overlapping years highlighted, and common influences connected.

### 📊 Data Pipeline
Automated collection from MusicBrainz + Wikidata APIs:
- 2,798 performances across all decades
- 237 artists with full metadata
- 118 influence relationships
- Awards, nationality, genre classification

## Architecture

```
vhm/
├── index.html           # Original prototype (86 performances)
├── app/                 # Fullstack app (Express + React + SQLite)
├── data-pipeline/       # MusicBrainz + Wikidata collection scripts
├── schema/              # PostgreSQL + Drizzle schemas, ETL pipeline
└── ui-features/         # Standalone UI component demos
```

### Tech Stack
- **Frontend**: React + D3.js v7 + Tailwind CSS + shadcn/ui
- **Backend**: Express + SQLite (better-sqlite3) + Drizzle ORM
- **Data**: MusicBrainz API + Wikidata SPARQL
- **Visualization**: D3.js stacked area charts, SVG influence graphs

### Genre Colors
| Genre | Color |
|-------|-------|
| Blues | `#4a90d9` |
| Jazz | `#d4a843` |
| Country | `#c17a3a` |
| Rock | `#d94452` |
| Soul/R&B | `#3ab5a5` |
| Electronic | `#5dd477` |
| Hip-Hop | `#9b59b6` |
| Pop | `#e87ecf` |
| Punk | `#e8a62e` |
| Metal | `#8c8c8c` |

## Data Pipeline

### Collect data (MusicBrainz + Wikidata)
```bash
cd data-pipeline
python3 collect_data.py
```
Rate-limited (1.1s/req for MusicBrainz). ~237 artists × ~12 recordings = ~2,800 performances.

### Run ETL (load into PostgreSQL)
```bash
cd schema
python3 etl_pipeline.py --input ../data-pipeline/performances.json --db postgresql://localhost/vhm
```

## Running the Fullstack App
```bash
cd app
npm install
npm run dev
```
The app auto-imports `performances.json` into SQLite on first start.

## Remaining TODOs

### Needs Your Input
1. **YouTube Data API v3** — requires API key for real video metadata/embeds
2. **User accounts + rating system** — needs auth provider decision (Google, GitHub, email?)
3. **Community-driven map reshaping** — depends on user accounts

### Future Enhancements
- Meilisearch for instant fuzzy search
- Domain registration (visualhistoryofmusic.com)
- White-label product spec
- Pitch deck for acquisition targets

## Status
**ACTIVE** — Reactivated March 21, 2026

## License
Proprietary — All rights reserved.
