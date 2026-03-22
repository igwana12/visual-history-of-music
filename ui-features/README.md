# VHM UI Modules — Influence Chain Navigator & Compare View

Two standalone UI feature modules for the **Visual History of Music** D3.js prototype. Each file is a self-contained HTML demo with embedded CSS/JS and realistic mock data, designed for integration into the existing single-file `index.html` app.

---

## Files

| File | Purpose |
|---|---|
| `shared-styles.css` | Design tokens, CSS variables, base styles, genre color map |
| `influence-chain.html` | Influence Chain Navigator — interactive artist lineage explorer |
| `compare-view.html` | Compare View — side-by-side artist timeline comparison |
| `README.md` | This integration guide |

---

## Design System Compliance

Both modules use the existing VHM design system:

- **Colors**: `#0a0a0f` background, `#151520`/`#1a1a2a` surfaces, `#e8e6e1` text
- **Fonts**: Playfair Display (headings), Inter (body) — loaded via Google Fonts CDN
- **Genre Colors**: Blues `#4a90d9`, Jazz `#d4a843`, Country `#c17a3a`, Rock `#d94452`, Soul `#3ab5a5`, Electronic `#5dd477`, Hip-Hop `#9b59b6`, Pop `#e87ecf`, Punk `#e8a62e`, Metal `#8c8c8c`
- **Motion**: `cubic-bezier(0.16, 1, 0.3, 1)` for entries, `cubic-bezier(0.4, 0, 0.2, 1)` for morphs
- **Responsive**: Side panel → bottom sheet on mobile; split view → vertical stack

---

## Feature 1: Influence Chain Navigator

### How It Works

1. User clicks an artist card (or "Influences" button on any performance card)
2. Side panel slides in from right (desktop) or bottom sheet rises (mobile)
3. Center shows the selected artist with genre-colored accent bar
4. "Influenced by" section shows upstream artists
5. "Influenced" section shows downstream artists
6. Clicking any connected artist re-centers the view with animated transition
7. Breadcrumb trail tracks navigation path
8. SVG dashed curves connect upstream/downstream nodes visually

### Keyboard Navigation

| Key | Action |
|---|---|
| `Escape` | Close panel |
| `Backspace` | Go back in breadcrumb |
| `↑` / `↓` | Cycle through influence nodes |
| `←` | Navigate to first upstream artist |
| `→` | Navigate to first downstream artist |
| `Enter` / `Space` | Activate focused node |

### Data Format

```javascript
{
  artist_id: 'mbid-string',
  name: 'Jimi Hendrix',
  genre: 'Rock',
  years: '1963–1970',
  influenced_by: [
    { id: 'mbid2', name: 'Muddy Waters', genre: 'Blues' }
  ],
  influenced: [
    { id: 'mbid3', name: 'Prince', genre: 'Pop' }
  ]
}
```

### Integration Steps

1. **Extract the CSS** from `<style>` in `influence-chain.html` and append to your main stylesheet or a new `influence-chain.css` file.

2. **Extract the HTML** for the panel (`.influence-panel`, `.panel-backdrop`) and add it to your `index.html` body.

3. **Extract the JavaScript** and integrate into your main script:
   - Replace the `artistsDB` mock object with your actual data source
   - Wire the `openPanel(artistId)` function to your existing artist card "Influences" button
   - The `navigateTo()`, `goBack()`, `closePanel()` functions handle all state

4. **Adapt the data layer**: Replace the hardcoded `artistsDB` lookup with your API calls or D3 data joins. The module expects a function that returns artist data given an ID.

```javascript
// Example: Replace mock data lookup with your data source
async function getArtistData(artistId) {
  // Option A: From your existing D3 data
  return vhmData.artists.find(a => a.artist_id === artistId);
  
  // Option B: From an API
  const res = await fetch(`/api/artists/${artistId}/influences`);
  return res.json();
}
```

---

## Feature 2: Compare View

### How It Works

1. User selects two artists from a grid (or via "Compare" button)
2. Selection preview shows both artists with "vs" separator
3. "Compare Artists" button activates the split view
4. Left and right panels show artist profiles with:
   - Header with avatar, name, genre, nationality
   - Stats row (key works, connections, awards)
   - Vertical timeline of performances/recordings
   - Influence connections with common connections highlighted (★)
   - Awards and achievements
5. Central timeline ruler shows year scale with overlapping periods highlighted
6. "Swap" button switches left/right sides
7. Overlapping years and shared connections are called out in a banner

### Data Format

```javascript
{
  artist: {
    name: 'Jimi Hendrix',
    genre: 'Rock',
    years: '1963–1970',
    nationality: 'American',
    startYear: 1963,
    endYear: 1970
  },
  performances: [
    { title: 'Are You Experienced', year: 1967, genre: 'Rock', type: 'Album' }
  ],
  influences: {
    by: ['Muddy Waters', 'B.B. King'],
    on: ['Prince', 'Eddie Van Halen']
  },
  awards: [
    { title: 'Rock & Roll Hall of Fame', year: 1992 }
  ]
}
```

### Integration Steps

1. **Extract CSS** from `compare-view.html` into your stylesheet.

2. **Extract HTML** for both screens (`.selection-screen` and `.compare-screen`) into your app.

3. **Wire to your routing**:
   - Show selection screen when user clicks "Compare" in your nav
   - The `showCompare()` function transitions to split view
   - `backToSelection()` returns to the picker

4. **Replace mock data** with your data source:

```javascript
// Replace compareData lookup with your data
async function getCompareData(artistId) {
  const artist = await fetch(`/api/artists/${artistId}`).then(r => r.json());
  const performances = await fetch(`/api/artists/${artistId}/performances`).then(r => r.json());
  return { artist, performances, influences: artist.influences, awards: artist.awards };
}
```

5. **D3 ruler**: The central timeline ruler uses D3.js v7 `d3.scaleLinear()` for year positioning. It adapts automatically to the year range of the selected artists.

---

## Shared CSS Tokens

`shared-styles.css` exports all design tokens as CSS custom properties. Both HTML files import it. Key variables:

```css
--bg-root         /* #0a0a0f — page background */
--bg-surface      /* #151520 — card/panel background */
--bg-surface-raised /* #1a1a2a — elevated surface */
--text-primary    /* #e8e6e1 — primary text */
--text-muted      /* #8a8890 — secondary text */
--genre-blues     /* #4a90d9 — genre-specific */
--font-display    /* Playfair Display */
--font-body       /* Inter */
--ease-out        /* cubic-bezier(0.16, 1, 0.3, 1) */
--transition-base /* 300ms ease-out */
```

To use in the main app, add `<link rel="stylesheet" href="shared-styles.css">` to your `<head>`, or copy the `:root` block into your existing stylesheet.

---

## Mobile Behavior

| Feature | Desktop | Mobile (≤768px) |
|---|---|---|
| Influence Chain | Side panel (520px, slides from right) | Bottom sheet (85vh, slides up) |
| Compare View | Side-by-side split with central ruler | Vertical stack, ruler hidden |
| Keyboard hints | Shown in panel footer | Hidden |

---

## Dependencies

- **D3.js v7** — loaded via CDN (`https://d3js.org/d3.v7.min.js`)
- **Google Fonts** — Playfair Display + Inter (loaded in `shared-styles.css`)
- No other dependencies. Pure vanilla JS.

---

## Mock Data

Both demos include 20+ real artists across Blues, Rock, Pop, Soul, Funk, Hip-Hop, and R&B with historically accurate influence chains and discographies. This data is embedded for demo purposes — replace with your actual MusicBrainz/API data for production.
