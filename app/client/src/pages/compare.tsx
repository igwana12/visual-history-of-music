import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import * as d3 from "d3";
import { GENRE_COLORS } from "@shared/schema";
import { Search, X, ArrowLeftRight, Music, GitBranch, Award, Star } from "lucide-react";

function ArtistSelector({
  artists,
  selectedIds,
  onSelect,
  slot,
}: {
  artists: any[];
  selectedIds: number[];
  onSelect: (id: number) => void;
  slot: 1 | 2;
}) {
  const [search, setSearch] = useState("");
  const filtered = artists.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase())
  ).filter(a => !selectedIds.includes(a.id));

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="search"
          placeholder={`Search for artist ${slot}...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          data-testid={`compare-search-${slot}`}
          className="w-full pl-9 pr-4 py-2 bg-card border border-card-border rounded-lg text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[300px] overflow-y-auto vhm-scrollbar pr-1" data-testid={`compare-grid-${slot}`}>
        {filtered.slice(0, 60).map((artist: any) => (
          <button
            key={artist.id}
            onClick={() => { onSelect(artist.id); setSearch(""); }}
            data-testid={`compare-select-${artist.id}`}
            className="flex items-center gap-2 p-2 rounded-md bg-accent/20 hover:bg-accent/50 transition-colors text-left"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-display font-bold shrink-0"
              style={{ background: `${artist.primaryGenreColor}20`, color: artist.primaryGenreColor }}
            >
              {artist.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{artist.name}</div>
              <div className="text-[10px] text-muted-foreground">{artist.primaryGenre}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TimelineRuler({ artist1, artist2 }: { artist1: any; artist2: any }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !artist1 || !artist2) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 40;
    const height = 400;
    const margin = { top: 20, bottom: 20 };

    const allYears = [
      ...(artist1.performances?.map((p: any) => p.year) || []),
      ...(artist2.performances?.map((p: any) => p.year) || []),
    ];
    if (allYears.length === 0) return;

    const minYear = Math.min(...allYears) - 2;
    const maxYear = Math.max(...allYears) + 2;

    const y = d3.scaleLinear()
      .domain([minYear, maxYear])
      .range([margin.top, height - margin.bottom]);

    const g = svg.append("g");

    // Main line
    g.append("line")
      .attr("x1", width / 2).attr("x2", width / 2)
      .attr("y1", margin.top).attr("y2", height - margin.bottom)
      .attr("stroke", "hsl(var(--border))")
      .attr("stroke-width", 1);

    // Year ticks every 5 years
    const ticks = [];
    for (let yr = Math.ceil(minYear / 5) * 5; yr <= maxYear; yr += 5) ticks.push(yr);

    g.selectAll("text.tick")
      .data(ticks)
      .join("text")
      .attr("x", width / 2)
      .attr("y", d => y(d))
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("fill", "hsl(var(--muted-foreground))")
      .attr("font-size", "8px")
      .attr("font-family", "Inter, sans-serif")
      .text(d => d);

    g.selectAll("line.tick")
      .data(ticks)
      .join("line")
      .attr("x1", 2).attr("x2", width - 2)
      .attr("y1", d => y(d)).attr("y2", d => y(d))
      .attr("stroke", "hsl(var(--border))")
      .attr("stroke-opacity", 0.3)
      .attr("stroke-width", 0.5);

  }, [artist1, artist2]);

  return (
    <svg ref={svgRef} width={40} height={400} className="shrink-0 hidden md:block" data-testid="timeline-ruler" />
  );
}

function ArtistComparePanel({ data, side }: { data: any; side: "left" | "right" }) {
  if (!data) return null;
  const artist = data;

  return (
    <div className="flex-1 space-y-4 min-w-0" data-testid={`compare-panel-${side}`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-display font-bold shrink-0"
          style={{ background: `${artist.primaryGenreColor}20`, color: artist.primaryGenreColor }}
        >
          {artist.name.charAt(0)}
        </div>
        <div>
          <h3 className="font-display text-lg font-bold text-foreground">{artist.name}</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span style={{ color: artist.primaryGenreColor }}>{artist.primaryGenre}</span>
            {artist.nationality && <span>· {artist.nationality}</span>}
            {artist.birthYear && <span>· {artist.birthYear}{artist.deathYear ? `–${artist.deathYear}` : "–present"}</span>}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-accent/30 rounded-md p-2 text-center">
          <div className="text-base font-bold font-display">{artist.performances?.length || 0}</div>
          <div className="text-[9px] text-muted-foreground uppercase">Works</div>
        </div>
        <div className="bg-accent/30 rounded-md p-2 text-center">
          <div className="text-base font-bold font-display">
            {(artist.influencedBy?.length || 0) + (artist.influenced?.length || 0)}
          </div>
          <div className="text-[9px] text-muted-foreground uppercase">Links</div>
        </div>
        <div className="bg-accent/30 rounded-md p-2 text-center">
          <div className="text-base font-bold font-display">{artist.awards?.length || 0}</div>
          <div className="text-[9px] text-muted-foreground uppercase">Awards</div>
        </div>
      </div>

      {/* Performances Timeline */}
      {artist.performances?.length > 0 && (
        <div>
          <h4 className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <Music className="w-3 h-3" /> Timeline
          </h4>
          <div className="space-y-1 max-h-52 overflow-y-auto vhm-scrollbar pr-1">
            {artist.performances.map((p: any) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-accent/15 text-xs"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: p.genreColor || artist.primaryGenreColor }}
                />
                <span className="font-mono text-muted-foreground shrink-0">{p.year}</span>
                <span className="text-foreground truncate">{p.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Influences */}
      {(artist.influencedBy?.length > 0 || artist.influenced?.length > 0) && (
        <div>
          <h4 className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <GitBranch className="w-3 h-3" /> Connections
          </h4>
          <div className="space-y-1">
            {artist.influencedBy?.map((a: any) => (
              <div key={`by-${a.id}`} className="text-xs text-muted-foreground px-2 py-0.5">
                ← {a.name}
              </div>
            ))}
            {artist.influenced?.map((a: any) => (
              <div key={`on-${a.id}`} className="text-xs text-muted-foreground px-2 py-0.5">
                {a.name} →
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Awards */}
      {artist.awards?.length > 0 && (
        <div>
          <h4 className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <Award className="w-3 h-3" /> Awards
          </h4>
          <div className="flex flex-wrap gap-1">
            {artist.awards.map((a: any, i: number) => (
              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-accent/30 text-foreground">
                {a.awardName}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Compare() {
  const [artist1Id, setArtist1Id] = useState<number | null>(null);
  const [artist2Id, setArtist2Id] = useState<number | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const artistsQuery = useQuery<any[]>({ queryKey: ["/api/artists"] });

  const compareQuery = useQuery<any>({
    queryKey: ["/api/compare", artist1Id, artist2Id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/compare/${artist1Id}/${artist2Id}`);
      return res.json();
    },
    enabled: isComparing && artist1Id !== null && artist2Id !== null,
  });

  const artists = artistsQuery.data || [];
  const artist1 = artists.find((a: any) => a.id === artist1Id);
  const artist2 = artists.find((a: any) => a.id === artist2Id);

  const handleCompare = () => {
    if (artist1Id && artist2Id) setIsComparing(true);
  };

  const handleReset = () => {
    setArtist1Id(null);
    setArtist2Id(null);
    setIsComparing(false);
  };

  const handleSwap = () => {
    setArtist1Id(artist2Id);
    setArtist2Id(artist1Id);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="font-display text-2xl font-bold text-foreground" data-testid="compare-title">
          Compare Artists
        </h1>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Select two artists to see their timelines side by side, discover shared influences, and find overlapping eras.
        </p>
      </div>

      {!isComparing ? (
        /* Selection Screen */
        <div className="space-y-6">
          {/* Selection Preview Strip */}
          <div className="flex items-center justify-center gap-4 flex-wrap" data-testid="selection-preview">
            {/* Slot 1 */}
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 min-w-[180px] transition-all ${
              artist1 ? "border-solid bg-card" : "border-dashed border-muted"
            }`}
              style={artist1 ? { borderColor: artist1.primaryGenreColor + "60" } : {}}
            >
              {artist1 ? (
                <>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-display font-bold"
                    style={{ background: `${artist1.primaryGenreColor}20`, color: artist1.primaryGenreColor }}
                  >
                    {artist1.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{artist1.name}</div>
                    <div className="text-[10px] text-muted-foreground">{artist1.primaryGenre}</div>
                  </div>
                  <button onClick={() => setArtist1Id(null)} className="ml-auto p-0.5 rounded hover:bg-accent">
                    <X className="w-3 h-3 text-muted-foreground" />
                  </button>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Select Artist 1</span>
              )}
            </div>

            <div className="text-muted-foreground font-display italic text-lg">vs</div>

            {/* Slot 2 */}
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 min-w-[180px] transition-all ${
              artist2 ? "border-solid bg-card" : "border-dashed border-muted"
            }`}
              style={artist2 ? { borderColor: artist2.primaryGenreColor + "60" } : {}}
            >
              {artist2 ? (
                <>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-display font-bold"
                    style={{ background: `${artist2.primaryGenreColor}20`, color: artist2.primaryGenreColor }}
                  >
                    {artist2.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{artist2.name}</div>
                    <div className="text-[10px] text-muted-foreground">{artist2.primaryGenre}</div>
                  </div>
                  <button onClick={() => setArtist2Id(null)} className="ml-auto p-0.5 rounded hover:bg-accent">
                    <X className="w-3 h-3 text-muted-foreground" />
                  </button>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Select Artist 2</span>
              )}
            </div>
          </div>

          {/* Compare Button */}
          {artist1Id && artist2Id && (
            <div className="flex justify-center">
              <button
                onClick={handleCompare}
                data-testid="compare-btn"
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-md"
              >
                <ArrowLeftRight className="w-4 h-4" />
                Compare Artists
              </button>
            </div>
          )}

          {/* Selection Grids */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {artist1 ? "Change Artist 1" : "Choose Artist 1"}
              </h3>
              <ArtistSelector
                artists={artists}
                selectedIds={[artist1Id, artist2Id].filter(Boolean) as number[]}
                onSelect={setArtist1Id}
                slot={1}
              />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {artist2 ? "Change Artist 2" : "Choose Artist 2"}
              </h3>
              <ArtistSelector
                artists={artists}
                selectedIds={[artist1Id, artist2Id].filter(Boolean) as number[]}
                onSelect={setArtist2Id}
                slot={2}
              />
            </div>
          </div>
        </div>
      ) : (
        /* Compare View */
        <div className="space-y-4">
          {/* Action Bar */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleReset}
              data-testid="reset-compare"
              className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              ← Back to Selection
            </button>
            <button
              onClick={handleSwap}
              data-testid="swap-btn"
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
            >
              <ArrowLeftRight className="w-3 h-3" />
              Swap
            </button>
          </div>

          {/* Common influences / overlap banner */}
          {compareQuery.data && (
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground flex-wrap">
              {compareQuery.data.commonInfluences?.length > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-yellow-500" />
                  {compareQuery.data.commonInfluences.length} shared influences:
                  {compareQuery.data.commonInfluences.slice(0, 3).map((a: any) => a.name).join(", ")}
                </span>
              )}
              {compareQuery.data.overlap && (
                <span>
                  Overlapping era: {compareQuery.data.overlap.start}–{compareQuery.data.overlap.end}
                </span>
              )}
            </div>
          )}

          {/* Split View */}
          {compareQuery.isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-pulse text-muted-foreground text-sm">Loading comparison...</div>
            </div>
          ) : compareQuery.data ? (
            <div className="flex gap-4 items-start" data-testid="compare-view">
              <div className="flex-1 bg-card border border-card-border rounded-xl p-4 overflow-y-auto vhm-scrollbar max-h-[70vh]">
                <ArtistComparePanel data={compareQuery.data.artist1} side="left" />
              </div>

              <TimelineRuler
                artist1={compareQuery.data.artist1}
                artist2={compareQuery.data.artist2}
              />

              <div className="flex-1 bg-card border border-card-border rounded-xl p-4 overflow-y-auto vhm-scrollbar max-h-[70vh]">
                <ArtistComparePanel data={compareQuery.data.artist2} side="right" />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
