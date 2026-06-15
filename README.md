# Site Brawl — stick-figure fighting platformer

A single-file HTML5 canvas brawler. Black stick figures swarm a construction
site; punch and kick through endless waves. Solo by default, with a second
player able to join.

## Files
- **`index.html`** — the whole game. Self-contained (HTML/CSS/JS only). This is
  all you need.
- **`server.js`** — *optional* tiny Node relay for cross-device 2-player.
- **`README.md`** — this file.

## Run it

### Easiest — just open it
Double-click `index.html`, or host the folder anywhere static:
```
python -m http.server 8000        # then visit http://localhost:8000
```
or drop `index.html` on **GitHub Pages**. You get:
- **Solo play** (default)
- **Same-screen 2-player** — press **Enter** (or the on-screen prompt) to bring
  Player 2 in on the same machine.

### Cross-device 2-player (phone + desktop, same match)
A purely static server can't sync two *separate* devices — there's no backend to
relay state. Run the included relay instead (needs Node.js, **no `npm install`**):
```
node server.js                    # serves on port 8000
```
Then open the printed `http://<your-pc-ip>:8000`:
- **Desktop** opens it first  → **Player 1 (red)**
- **Phone** opens it (same Wi-Fi) → **Player 2 (blue)**

If no relay is running, the game automatically falls back to solo / same-screen.

## Controls

### Desktop
| Action | Key |
|---|---|
| Move | `A` / `D` |
| Up / down ladders | `W` / `S` |
| Jump | `Space` |
| Punch | Left-click or `J` |
| Kick | Right-click or `K` |
| Pause | `P` |

*Same-screen Player 2:* Arrow keys move/climb, `/` jump, `.` punch, `,` kick.

### Mobile
On-screen buttons appear automatically: movement D-pad bottom-left, and
**JUMP / PUNCH / KICK** bottom-right.

## Rules
- 100 HP. Basic enemies deal 5 HP per strike and take 5 hits to drop.
- Variants: **fast/weak** (small, quick, 5 hits) and **slow/tough** (big, slow,
  **9 hits** and hits for **10 HP**).
- Defeated enemies sometimes drop a **+10 HP** pickup (green cross).
- Endless waves, steadily harder. Survive for the high score (saved locally).
