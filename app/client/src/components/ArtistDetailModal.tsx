import { useQuery } from "@tanstack/react-query";
import { X, ExternalLink, Award, Music, GitBranch, MapPin, Calendar } from "lucide-react";
import { GENRE_COLORS } from "@shared/schema";

interface ArtistDetailModalProps {
  artistId: number;
  onClose: () => void;
  onArtistClick?: (id: number) => void;
}

export function ArtistDetailModal({ artistId, onClose, onArtistClick }: ArtistDetailModalProps) {
  const { data: artist, isLoading } = useQuery<any>({
    queryKey: ["/api/artists", artistId],
  });

  const handleArtistNav = (id: number) => {
    if (onArtistClick) onArtistClick(id);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="artist-modal">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 vhm-glass" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 bg-card border border-card-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto vhm-scrollbar">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-md bg-accent/80 hover:bg-accent text-muted-foreground hover:text-foreground z-10 transition-colors"
          data-testid="modal-close"
        >
          <X className="w-4 h-4" />
        </button>

        {isLoading ? (
          <div className="p-8 space-y-4 animate-pulse">
            <div className="h-6 bg-muted rounded w-1/3" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-20 bg-muted rounded" />
          </div>
        ) : artist ? (
          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-display font-bold shrink-0"
                style={{
                  background: `${artist.primaryGenreColor}20`,
                  color: artist.primaryGenreColor,
                }}
              >
                {artist.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-xl font-bold text-foreground" data-testid="artist-name">
                  {artist.name}
                </h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  {artist.nationality && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {artist.nationality}
                    </span>
                  )}
                  {artist.birthYear && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {artist.birthYear}{artist.deathYear ? `–${artist.deathYear}` : "–present"}
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {artist.genres?.map((g: any) => (
                    <span
                      key={g.name}
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ background: `${g.color}18`, color: g.color }}
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-accent/30 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-foreground font-display">{artist.performances?.length || 0}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Performances</div>
              </div>
              <div className="bg-accent/30 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-foreground font-display">
                  {(artist.influencedBy?.length || 0) + (artist.influenced?.length || 0)}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Connections</div>
              </div>
              <div className="bg-accent/30 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-foreground font-display">{artist.awards?.length || 0}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Awards</div>
              </div>
            </div>

            {/* Performances Timeline */}
            {artist.performances?.length > 0 && (
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  <Music className="w-3.5 h-3.5" /> Key Performances
                </h3>
                <div className="space-y-1.5 max-h-48 overflow-y-auto vhm-scrollbar pr-1">
                  {artist.performances.map((p: any) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-accent/20 hover:bg-accent/40 transition-colors group"
                      data-testid={`artist-perf-${p.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: p.genreColor || artist.primaryGenreColor }}
                        />
                        <span className="text-sm text-foreground truncate">{p.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground font-mono">{p.year}</span>
                        {p.youtubeSearchQuery && (
                          <a
                            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(p.youtubeSearchQuery)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <ExternalLink className="w-3 h-3 text-muted-foreground" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Influence Connections */}
            {(artist.influencedBy?.length > 0 || artist.influenced?.length > 0) && (
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  <GitBranch className="w-3.5 h-3.5" /> Influence Connections
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {artist.influencedBy?.length > 0 && (
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider">Influenced by</div>
                      <div className="space-y-1">
                        {artist.influencedBy.map((a: any) => (
                          <button
                            key={a.id}
                            onClick={() => handleArtistNav(a.id)}
                            className="w-full text-left text-sm text-foreground hover:text-primary px-2 py-1 rounded hover:bg-accent/40 transition-colors truncate"
                            data-testid={`influence-by-${a.id}`}
                          >
                            ← {a.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {artist.influenced?.length > 0 && (
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider">Influenced</div>
                      <div className="space-y-1">
                        {artist.influenced.map((a: any) => (
                          <button
                            key={a.id}
                            onClick={() => handleArtistNav(a.id)}
                            className="w-full text-left text-sm text-foreground hover:text-primary px-2 py-1 rounded hover:bg-accent/40 transition-colors truncate"
                            data-testid={`influence-on-${a.id}`}
                          >
                            {a.name} →
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Awards */}
            {artist.awards?.length > 0 && (
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  <Award className="w-3.5 h-3.5" /> Awards & Honors
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {artist.awards.map((a: any, i: number) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-full text-xs bg-accent/40 text-foreground"
                    >
                      {a.awardName}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {artist.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {artist.tags.slice(0, 10).map((tag: string, i: number) => (
                  <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-accent/20 text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">Artist not found</div>
        )}
      </div>
    </div>
  );
}
