import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import * as d3 from "d3";
import { apiRequest } from "@/lib/queryClient";
import { GENRE_COLORS, DECADE_LIST } from "@shared/schema";
import { Search, ExternalLink, X, ChevronDown } from "lucide-react";
import { ArtistDetailModal } from "@/components/ArtistDetailModal";

// Terrain visualization component
function TerrainChart({
  stats,
  onGenreDecadeClick,
  selectedGenre,
  selectedDecade,
}: {
  stats: any;
  onGenreDecadeClick: (genre: string | null, decade: string | null) => void;
  selectedGenre: string | null;
  selectedDecade: string | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 360 });

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setDimensions({ width: Math.max(320, width), height: Math.min(400, Math.max(240, width * 0.4)) });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!stats || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height } = dimensions;
    const margin = { top: 20, right: 20, bottom: 40, left: 20 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const genreOrder = Object.keys(GENRE_COLORS);
    const decadeOrder = DECADE_LIST;

    // Build matrix: decade -> genre -> count
    const matrix: Record<string, Record<string, number>> = {};
    for (const d of decadeOrder) {
      matrix[d] = {};
      for (const g of genreOrder) matrix[d][g] = 0;
    }
    for (const item of stats.genreByDecade || []) {
      if (item.decade && item.genre && matrix[item.decade]) {
        matrix[item.decade][item.genre] = item.count;
      }
    }

    // Stack data
    const stackData = decadeOrder.map(d => ({ decade: d, ...matrix[d] }));
    const stack = d3.stack<any>()
      .keys(genreOrder)
      .order(d3.stackOrderInsideOut)
      .offset(d3.stackOffsetWiggle);

    const series = stack(stackData);

    const x = d3.scalePoint()
      .domain(decadeOrder)
      .range([0, innerW])
      .padding(0.1);

    const yMax = d3.max(series, s => d3.max(s, d => d[1])) || 1;
    const yMin = d3.min(series, s => d3.min(s, d => d[0])) || 0;
    const y = d3.scaleLinear()
      .domain([yMin, yMax])
      .range([innerH, 0]);

    const area = d3.area<any>()
      .x((d: any) => x(d.data.decade)!)
      .y0((d: any) => y(d[0]))
      .y1((d: any) => y(d[1]))
      .curve(d3.curveBasis);

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Draw areas
    g.selectAll("path.area")
      .data(series)
      .join("path")
      .attr("class", "area")
      .attr("d", area as any)
      .attr("fill", (d: any) => GENRE_COLORS[d.key] || "#666")
      .attr("fill-opacity", (d: any) => {
        if (selectedGenre && d.key !== selectedGenre) return 0.15;
        return 0.7;
      })
      .attr("stroke", (d: any) => GENRE_COLORS[d.key] || "#666")
      .attr("stroke-width", (d: any) => {
        if (selectedGenre === d.key) return 2;
        return 0.5;
      })
      .attr("stroke-opacity", 0.4)
      .style("cursor", "pointer")
      .style("transition", "fill-opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)")
      .on("click", (_event: any, d: any) => {
        onGenreDecadeClick(d.key === selectedGenre ? null : d.key, selectedDecade);
      })
      .on("mouseenter", function(this: SVGPathElement) {
        d3.select(this).attr("fill-opacity", 0.9);
      })
      .on("mouseleave", function(this: SVGPathElement, _event: any, d: any) {
        d3.select(this).attr("fill-opacity", selectedGenre && d.key !== selectedGenre ? 0.15 : 0.7);
      });

    // X-axis
    const xAxis = g.append("g")
      .attr("transform", `translate(0,${innerH + 8})`)
      .selectAll("text")
      .data(decadeOrder)
      .join("text")
      .attr("x", d => x(d)!)
      .attr("y", 0)
      .attr("text-anchor", "middle")
      .attr("fill", (d: string) => selectedDecade === d ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))")
      .attr("font-size", "11px")
      .attr("font-family", "Inter, sans-serif")
      .attr("font-weight", (d: string) => selectedDecade === d ? "600" : "400")
      .style("cursor", "pointer")
      .text(d => d)
      .on("click", (_event: any, d: string) => {
        onGenreDecadeClick(selectedGenre, d === selectedDecade ? null : d);
      });

    // Decade highlight line
    if (selectedDecade) {
      const xPos = x(selectedDecade);
      if (xPos !== undefined) {
        g.append("line")
          .attr("x1", xPos).attr("x2", xPos)
          .attr("y1", 0).attr("y2", innerH)
          .attr("stroke", "hsl(var(--foreground))")
          .attr("stroke-opacity", 0.2)
          .attr("stroke-dasharray", "4,4");
      }
    }

  }, [stats, dimensions, selectedGenre, selectedDecade, onGenreDecadeClick]);

  return (
    <div ref={containerRef} className="w-full" data-testid="terrain-chart">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full"
        style={{ maxHeight: "400px" }}
      />
    </div>
  );
}

// Genre legend/filter bar
function GenreLegend({
  selectedGenre,
  onSelect,
}: {
  selectedGenre: string | null;
  onSelect: (g: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 justify-center" data-testid="genre-legend">
      {Object.entries(GENRE_COLORS).map(([name, color]) => (
        <button
          key={name}
          onClick={() => onSelect(selectedGenre === name ? null : name)}
          data-testid={`genre-filter-${name}`}
          className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
            transition-all duration-200 vhm-ease border
            ${selectedGenre === name
              ? "border-current shadow-sm"
              : selectedGenre
                ? "border-transparent opacity-40 hover:opacity-70"
                : "border-transparent hover:border-current/20"
            }
          `}
          style={{ color }}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: color }}
          />
          {name}
        </button>
      ))}
    </div>
  );
}

// Performance card
function PerformanceCard({ perf, onArtistClick }: { perf: any; onArtistClick: (id: number) => void }) {
  const ytUrl = perf.youtubeSearchQuery
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(perf.youtubeSearchQuery)}`
    : null;

  return (
    <div
      className="group bg-card border border-card-border rounded-lg p-3.5 hover:border-border transition-all duration-200 vhm-ease hover:shadow-md"
      data-testid={`performance-card-${perf.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-foreground truncate leading-tight">
            {perf.title}
          </h3>
          <button
            onClick={() => onArtistClick(perf.artistId)}
            className="text-xs text-muted-foreground hover:text-primary transition-colors mt-0.5"
            data-testid={`artist-link-${perf.artistId}`}
          >
            {perf.artistName}
          </button>
        </div>
        <span className="text-xs font-mono text-muted-foreground shrink-0">{perf.year}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{
              background: `${perf.genreColor}18`,
              color: perf.genreColor,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: perf.genreColor }} />
            {perf.genreName}
          </span>
          {perf.subgenre && (
            <span className="text-[10px] text-muted-foreground">{perf.subgenre}</span>
          )}
        </div>
        {ytUrl && (
          <a
            href={ytUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent transition-all"
            data-testid={`yt-link-${perf.id}`}
          >
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function Timeline() {
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedDecade, setSelectedDecade] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArtistId, setSelectedArtistId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const statsQuery = useQuery<any>({
    queryKey: ["/api/stats"],
  });

  const perfQuery = useQuery<any>({
    queryKey: ["/api/performances", selectedGenre, selectedDecade, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedGenre) params.set("genre", selectedGenre);
      if (selectedDecade) params.set("decade", selectedDecade);
      params.set("page", String(page));
      params.set("limit", "60");
      const res = await apiRequest("GET", `/api/performances?${params}`);
      return res.json();
    },
  });

  const searchResults = useQuery<any>({
    queryKey: ["/api/search", searchQuery],
    queryFn: async () => {
      if (searchQuery.length < 2) return { artists: [], performances: [] };
      const res = await apiRequest("GET", `/api/search?q=${encodeURIComponent(searchQuery)}`);
      return res.json();
    },
    enabled: searchQuery.length >= 2,
  });

  const handleGenreDecadeClick = useCallback((genre: string | null, decade: string | null) => {
    setSelectedGenre(genre);
    setSelectedDecade(decade);
    setPage(1);
  }, []);

  const performances = perfQuery.data?.performances || [];
  const totalPerf = perfQuery.data?.total || 0;
  const hasMore = performances.length >= 60;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      {/* Hero Section */}
      <div className="text-center space-y-3">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground" data-testid="timeline-title">
          A Visual History of Music
        </h1>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">
          Explore 100 years of music through 2,798 performances across 10 genres.
          Click the terrain to filter by genre, decades to focus on an era.
        </p>
      </div>

      {/* Search */}
      <div className="max-w-md mx-auto relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search artists or performances..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            data-testid="search-input"
            className="w-full pl-9 pr-8 py-2 bg-card border border-card-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent"
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {searchQuery.length >= 2 && searchResults.data && (
          <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-popover-border rounded-lg shadow-lg overflow-hidden vhm-scrollbar max-h-72 overflow-y-auto">
            {searchResults.data.artists?.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-accent/50">
                  Artists
                </div>
                {searchResults.data.artists.slice(0, 8).map((a: any) => (
                  <button
                    key={`a-${a.id}`}
                    onClick={() => { setSelectedArtistId(a.id); setSearchQuery(""); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                    data-testid={`search-artist-${a.id}`}
                  >
                    <span className="font-medium text-foreground">{a.name}</span>
                  </button>
                ))}
              </div>
            )}
            {searchResults.data.performances?.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-accent/50">
                  Performances
                </div>
                {searchResults.data.performances.slice(0, 10).map((p: any) => (
                  <button
                    key={`p-${p.id}`}
                    onClick={() => setSearchQuery("")}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                    data-testid={`search-perf-${p.id}`}
                  >
                    <span className="text-foreground">{p.title}</span>
                    <span className="text-muted-foreground ml-1.5 text-xs">by {p.artistName} · {p.year}</span>
                  </button>
                ))}
              </div>
            )}
            {(!searchResults.data.artists?.length && !searchResults.data.performances?.length) && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">No results found</div>
            )}
          </div>
        )}
      </div>

      {/* Terrain Visualization */}
      <div className="bg-card border border-card-border rounded-xl p-4 overflow-hidden">
        {statsQuery.data ? (
          <TerrainChart
            stats={statsQuery.data}
            onGenreDecadeClick={handleGenreDecadeClick}
            selectedGenre={selectedGenre}
            selectedDecade={selectedDecade}
          />
        ) : (
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading visualization...</div>
          </div>
        )}
      </div>

      {/* Genre Legend */}
      <GenreLegend selectedGenre={selectedGenre} onSelect={g => { setSelectedGenre(g); setPage(1); }} />

      {/* Decade Navigation Bar */}
      <div className="flex items-center justify-center gap-1 flex-wrap" data-testid="decade-nav">
        <button
          onClick={() => { setSelectedDecade(null); setPage(1); }}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            !selectedDecade ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
          data-testid="decade-all"
        >
          All Decades
        </button>
        {DECADE_LIST.map(d => (
          <button
            key={d}
            onClick={() => { setSelectedDecade(selectedDecade === d ? null : d); setPage(1); }}
            data-testid={`decade-${d}`}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              selectedDecade === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Active Filters */}
      {(selectedGenre || selectedDecade) && (
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs text-muted-foreground">Showing:</span>
          {selectedGenre && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: `${GENRE_COLORS[selectedGenre]}20`, color: GENRE_COLORS[selectedGenre] }}
            >
              {selectedGenre}
              <button onClick={() => { setSelectedGenre(null); setPage(1); }}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {selectedDecade && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent text-accent-foreground">
              {selectedDecade}
              <button onClick={() => { setSelectedDecade(null); setPage(1); }}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          <span className="text-xs text-muted-foreground">{totalPerf} performances</span>
        </div>
      )}

      {/* Performance Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" data-testid="performances-grid">
        {perfQuery.isLoading ? (
          Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="bg-card border border-card-border rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2 mb-3" />
              <div className="h-3 bg-muted rounded w-1/4" />
            </div>
          ))
        ) : (
          performances.map((perf: any) => (
            <PerformanceCard
              key={perf.id}
              perf={perf}
              onArtistClick={setSelectedArtistId}
            />
          ))
        )}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => setPage(p => p + 1)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-card border border-card-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
            data-testid="load-more"
          >
            <ChevronDown className="w-4 h-4" />
            Load more
          </button>
        </div>
      )}

      {/* Artist Detail Modal */}
      {selectedArtistId !== null && (
        <ArtistDetailModal
          artistId={selectedArtistId}
          onClose={() => setSelectedArtistId(null)}
        />
      )}
    </div>
  );
}
