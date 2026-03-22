import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import * as d3 from "d3";
import { GENRE_COLORS } from "@shared/schema";
import { Search, X, ChevronRight, ArrowLeft, Home } from "lucide-react";
import { ArtistDetailModal } from "@/components/ArtistDetailModal";

// Influence graph node
interface InfluenceNode {
  id: number;
  name: string;
  genre: string;
  genreColor: string;
}

interface InfluenceData {
  artist: InfluenceNode;
  influencedBy: InfluenceNode[];
  influenced: InfluenceNode[];
}

function InfluenceGraph({ data, onNodeClick }: { data: InfluenceData; onNodeClick: (id: number) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 800, height: 500 });

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ width: Math.max(400, width), height: Math.max(400, Math.min(600, height || 500)) });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height } = dims;
    const centerX = width / 2;
    const centerY = height / 2;

    const g = svg.append("g");

    // Central node
    const center = data.artist;
    const upstream = data.influencedBy || [];
    const downstream = data.influenced || [];

    // Dynamic radius based on node count
    const maxUpstream = Math.max(upstream.length, 1);
    const maxDownstream = Math.max(downstream.length, 1);
    const baseRadius = Math.min(width * 0.3, height * 0.38);
    const upstreamRadius = Math.max(120, baseRadius);
    const downstreamRadius = Math.max(120, baseRadius);

    // Position upstream nodes in a semicircle on the left
    const upNodes = upstream.map((node, i) => {
      const totalAngle = Math.min(Math.PI * 0.85, maxUpstream * 0.35);
      const startAngle = Math.PI + (Math.PI - totalAngle) / 2;
      const a = maxUpstream === 1 ? Math.PI : startAngle + (totalAngle * i) / Math.max(maxUpstream - 1, 1);
      return {
        ...node,
        x: centerX + upstreamRadius * Math.cos(a),
        y: centerY + upstreamRadius * Math.sin(a) * 0.85,
      };
    });

    // Position downstream nodes in a semicircle on the right
    const downNodes = downstream.map((node, i) => {
      const totalAngle = Math.min(Math.PI * 0.85, maxDownstream * 0.35);
      const startAngle = -(totalAngle / 2);
      const a = maxDownstream === 1 ? 0 : startAngle + (totalAngle * i) / Math.max(maxDownstream - 1, 1);
      return {
        ...node,
        x: centerX + downstreamRadius * Math.cos(a),
        y: centerY + downstreamRadius * Math.sin(a) * 0.85,
      };
    });

    // Draw connection lines — upstream
    const linkGen = d3.linkHorizontal<any, any>()
      .x(d => d.x)
      .y(d => d.y);

    upNodes.forEach(node => {
      g.append("path")
        .attr("d", linkGen({ source: { x: node.x, y: node.y }, target: { x: centerX, y: centerY } }))
        .attr("fill", "none")
        .attr("stroke", node.genreColor || "#666")
        .attr("stroke-width", 1.5)
        .attr("stroke-opacity", 0.3)
        .attr("stroke-dasharray", "4,4");
    });

    // Draw connection lines — downstream
    downNodes.forEach(node => {
      g.append("path")
        .attr("d", linkGen({ source: { x: centerX, y: centerY }, target: { x: node.x, y: node.y } }))
        .attr("fill", "none")
        .attr("stroke", node.genreColor || "#666")
        .attr("stroke-width", 1.5)
        .attr("stroke-opacity", 0.3)
        .attr("stroke-dasharray", "4,4");
    });

    // Draw direction labels
    if (upstream.length > 0) {
      g.append("text")
        .attr("x", centerX - upstreamRadius - 10)
        .attr("y", 20)
        .attr("text-anchor", "start")
        .attr("fill", "hsl(var(--muted-foreground))")
        .attr("font-size", "10px")
        .attr("font-family", "Inter, sans-serif")
        .attr("letter-spacing", "0.1em")
        .text("INFLUENCED BY");
    }

    if (downstream.length > 0) {
      g.append("text")
        .attr("x", centerX + downstreamRadius + 10)
        .attr("y", 20)
        .attr("text-anchor", "end")
        .attr("fill", "hsl(var(--muted-foreground))")
        .attr("font-size", "10px")
        .attr("font-family", "Inter, sans-serif")
        .attr("letter-spacing", "0.1em")
        .text("INFLUENCED");
    }

    // Draw node function
    function drawNode(sel: d3.Selection<SVGGElement, unknown, null, undefined>, x: number, y: number, node: InfluenceNode, isCenter: boolean) {
      const radius = isCenter ? 36 : 26;
      const group = sel.append("g")
        .attr("transform", `translate(${x},${y})`)
        .style("cursor", isCenter ? "default" : "pointer");

      // Circle
      group.append("circle")
        .attr("r", radius)
        .attr("fill", `${node.genreColor || "#666"}20`)
        .attr("stroke", node.genreColor || "#666")
        .attr("stroke-width", isCenter ? 2.5 : 1.5);

      // Initial letter
      group.append("text")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("fill", node.genreColor || "#666")
        .attr("font-size", isCenter ? "18px" : "13px")
        .attr("font-family", "'Playfair Display', serif")
        .attr("font-weight", "700")
        .text(node.name.charAt(0));

      // Name label below
      group.append("text")
        .attr("y", radius + 14)
        .attr("text-anchor", "middle")
        .attr("fill", "hsl(var(--foreground))")
        .attr("font-size", isCenter ? "13px" : "11px")
        .attr("font-family", "Inter, sans-serif")
        .attr("font-weight", isCenter ? "600" : "400")
        .text(node.name.length > 18 ? node.name.slice(0, 16) + "…" : node.name);

      // Genre label
      group.append("text")
        .attr("y", radius + 26)
        .attr("text-anchor", "middle")
        .attr("fill", node.genreColor || "hsl(var(--muted-foreground))")
        .attr("font-size", "9px")
        .attr("font-family", "Inter, sans-serif")
        .text(node.genre || "");

      if (!isCenter) {
        // Hover effects
        group.on("mouseenter", function() {
          d3.select(this).select("circle")
            .transition().duration(200)
            .attr("r", radius + 4)
            .attr("fill", `${node.genreColor || "#666"}35`);
        });
        group.on("mouseleave", function() {
          d3.select(this).select("circle")
            .transition().duration(200)
            .attr("r", radius)
            .attr("fill", `${node.genreColor || "#666"}20`);
        });
        group.on("click", () => onNodeClick(node.id));
      }
    }

    // Draw all nodes
    upNodes.forEach(node => drawNode(g as any, node.x, node.y, node, false));
    downNodes.forEach(node => drawNode(g as any, node.x, node.y, node, false));
    drawNode(g as any, centerX, centerY, center, true);

  }, [data, dims, onNodeClick]);

  return (
    <div ref={containerRef} className="w-full h-[500px]" data-testid="influence-graph">
      <svg ref={svgRef} width={dims.width} height={dims.height} className="w-full h-full" />
    </div>
  );
}

export default function Influences() {
  const [selectedArtistId, setSelectedArtistId] = useState<number | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: number; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showArtistModal, setShowArtistModal] = useState(false);

  const artistsQuery = useQuery<any[]>({
    queryKey: ["/api/artists"],
  });

  const influenceQuery = useQuery<InfluenceData>({
    queryKey: ["/api/influences", selectedArtistId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/influences/${selectedArtistId}`);
      return res.json();
    },
    enabled: selectedArtistId !== null,
  });

  const navigateToArtist = useCallback((id: number) => {
    const artistList = artistsQuery.data || [];
    const artist = artistList.find((a: any) => a.id === id);
    if (artist) {
      setBreadcrumbs(prev => {
        const exists = prev.findIndex(b => b.id === id);
        if (exists >= 0) return prev.slice(0, exists + 1);
        return [...prev, { id, name: artist.name }];
      });
    }
    setSelectedArtistId(id);
  }, [artistsQuery.data]);

  const goBack = useCallback(() => {
    if (breadcrumbs.length > 1) {
      const prev = breadcrumbs[breadcrumbs.length - 2];
      setBreadcrumbs(b => b.slice(0, -1));
      setSelectedArtistId(prev.id);
    } else {
      setBreadcrumbs([]);
      setSelectedArtistId(null);
    }
  }, [breadcrumbs]);

  // Filter artists by search
  const filteredArtists = (artistsQuery.data || []).filter((a: any) =>
    !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="font-display text-2xl font-bold text-foreground" data-testid="influences-title">
          Influence Explorer
        </h1>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Trace the lineage of musical influence. Select an artist to see who shaped their sound and who they inspired.
        </p>
      </div>

      {selectedArtistId === null ? (
        /* Artist Selection Grid */
        <div className="space-y-4">
          {/* Search */}
          <div className="max-w-md mx-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Find an artist..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              data-testid="influence-search"
              className="w-full pl-9 pr-8 py-2 bg-card border border-card-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent">
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Artist Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2" data-testid="artist-grid">
            {filteredArtists.slice(0, 120).map((artist: any) => (
              <button
                key={artist.id}
                onClick={() => navigateToArtist(artist.id)}
                data-testid={`artist-card-${artist.id}`}
                className="group bg-card border border-card-border rounded-lg p-3 text-left hover:border-border hover:shadow-sm transition-all vhm-ease"
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-display font-bold shrink-0"
                    style={{ background: `${artist.primaryGenreColor}20`, color: artist.primaryGenreColor }}
                  >
                    {artist.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {artist.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{artist.primaryGenre}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Influence Graph View */
        <div className="space-y-4">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 flex-wrap" data-testid="breadcrumbs">
            <button
              onClick={() => { setBreadcrumbs([]); setSelectedArtistId(null); }}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              data-testid="breadcrumb-home"
            >
              <Home className="w-3 h-3" />
              All Artists
            </button>
            {breadcrumbs.map((bc, i) => (
              <div key={bc.id} className="flex items-center gap-1.5">
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                <button
                  onClick={() => {
                    setBreadcrumbs(prev => prev.slice(0, i + 1));
                    setSelectedArtistId(bc.id);
                  }}
                  data-testid={`breadcrumb-${bc.id}`}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    i === breadcrumbs.length - 1
                      ? "font-semibold text-foreground bg-accent/50"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  {bc.name}
                </button>
              </div>
            ))}
          </div>

          {/* Back and View Detail buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={goBack}
              data-testid="back-btn"
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <button
              onClick={() => setShowArtistModal(true)}
              data-testid="view-detail-btn"
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              View Full Profile
            </button>
          </div>

          {/* Graph */}
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            {influenceQuery.isLoading ? (
              <div className="h-[500px] flex items-center justify-center">
                <div className="animate-pulse text-muted-foreground text-sm">Loading influence network...</div>
              </div>
            ) : influenceQuery.data ? (
              <InfluenceGraph data={influenceQuery.data} onNodeClick={navigateToArtist} />
            ) : (
              <div className="h-[500px] flex items-center justify-center text-muted-foreground">
                No influence data available
              </div>
            )}
          </div>

          {/* Connection Summary */}
          {influenceQuery.data && (
            <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
              <span>{influenceQuery.data.influencedBy?.length || 0} influences received</span>
              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
              <span>{influenceQuery.data.influenced?.length || 0} artists influenced</span>
            </div>
          )}
        </div>
      )}

      {/* Artist Detail Modal */}
      {showArtistModal && selectedArtistId !== null && (
        <ArtistDetailModal
          artistId={selectedArtistId}
          onClose={() => setShowArtistModal(false)}
        />
      )}
    </div>
  );
}
