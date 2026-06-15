/* ============================================================================
   Site Brawl — optional local relay server (cross-device 2-player)
   ----------------------------------------------------------------------------
   Pure Node.js. NO npm install, NO dependencies. Just Node itself.

   Run it instead of `python -m http.server`:

       node server.js            # serves on http://0.0.0.0:8000

   Then:
     • Open the printed http://<your-pc-ip>:8000 on your DESKTOP  -> Player 1 (red)
     • Open the SAME url on your PHONE (same Wi-Fi)               -> Player 2 (blue)

   The first connection hosts the simulation; the second joins as P2. The server
   is a thin message relay between the two browsers (max 2 players).

   The game's index.html ALSO works as a plain static file (GitHub Pages,
   python http.server, file://) — it just falls back to solo / same-screen
   co-op when no relay is present. This server is only needed for two SEPARATE
   devices in one match.
============================================================================ */
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon'
};

/* ---------------- Static file server ---------------- */
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  // prevent path traversal
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, {'Content-Type':'text/plain'}); return res.end('Not found'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
    res.end(data);
  });
});

/* ---------------- Minimal WebSocket relay ----------------
   Implements just enough of RFC 6455 for small JSON text frames:
   handshake, masked client->server frames, unmasked server->client frames,
   ping/pong, and close. Two player slots; everything one peer sends is
   forwarded to the other.
--------------------------------------------------------- */
let slots = [null, null];   // index 0 = P1 (host), 1 = P2 (guest)

function wsAccept(key){
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}
function sendFrame(socket, str){
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126){ header = Buffer.from([0x81, len]); }
  else if (len < 65536){ header = Buffer.alloc(4); header[0]=0x81; header[1]=126; header.writeUInt16BE(len,2); }
  else { header = Buffer.alloc(10); header[0]=0x81; header[1]=127; header.writeUInt32BE(0,2); header.writeUInt32BE(len,6); }
  try { socket.write(Buffer.concat([header, payload])); } catch(e){}
}
function sendTo(slotIndex, obj){
  const s = slots[slotIndex]; if (s && !s.destroyed) sendFrame(s, JSON.stringify(obj));
}

server.on('upgrade', (req, socket) => {
  if (req.url.split('?')[0] !== '/ws'){ socket.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  if (!key){ socket.destroy(); return; }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + wsAccept(key) + '\r\n\r\n'
  );

  // assign a slot
  let idx = slots[0] ? (slots[1] ? -1 : 1) : 0;
  if (idx === -1){ // game full -> politely close
    sendFrame(socket, JSON.stringify({t:'full'}));
    setTimeout(()=>socket.destroy(), 50);
    return;
  }
  slots[idx] = socket;
  const role = idx === 0 ? 'p1' : 'p2';
  sendTo(idx, { t:'welcome', role });
  if (idx === 1){ sendTo(0, { t:'peer-join' }); }     // tell host a guest arrived
  console.log(`[ws] ${role} connected (${peers()} online)`);

  // ---- incoming frame parser (handles fragmented TCP) ----
  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (true){
      if (buf.length < 2) break;
      const b0 = buf[0], b1 = buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126){ if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127){ if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) break;
      let mask = null;
      if (masked){ mask = buf.slice(off, off+4); off += 4; }
      const data = buf.slice(off, off+len);
      if (masked){ for (let i=0;i<data.length;i++) data[i] ^= mask[i & 3]; }
      buf = buf.slice(need);

      if (opcode === 0x8){ closeSocket(); return; }        // close
      else if (opcode === 0x9){ /* ping -> pong */ try{ socket.write(Buffer.from([0x8a,0])); }catch(e){} }
      else if (opcode === 0x1){                              // text
        const other = idx === 0 ? 1 : 0;
        // forward raw JSON text to the peer
        if (slots[other] && !slots[other].destroyed) sendFrame(slots[other], data.toString('utf8'));
      }
    }
  });

  function closeSocket(){
    if (slots[idx] === socket){
      slots[idx] = null;
      const other = idx === 0 ? 1 : 0;
      if (slots[other]) sendTo(other, { t:'peer-left' });
      // if the host (p1) leaves, drop the guest too so a fresh host can take slot 0
      if (idx === 0 && slots[1]){ try{ slots[1].destroy(); }catch(e){} slots[1]=null; }
      console.log(`[ws] ${role} disconnected (${peers()} online)`);
    }
    try { socket.destroy(); } catch(e){}
  }
  socket.on('close', closeSocket);
  socket.on('error', closeSocket);
});

function peers(){ return (slots[0]?1:0) + (slots[1]?1:0); }

/* ---------------- Boot ---------------- */
server.listen(PORT, '0.0.0.0', () => {
  const nets = require('os').networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets))
    for (const ni of nets[name])
      if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
  console.log('\n  Site Brawl relay running:');
  console.log('    Local:    http://localhost:' + PORT);
  ips.forEach(ip => console.log('    Network:  http://' + ip + ':' + PORT + '   <- open this on your phone (same Wi-Fi)'));
  console.log('\n  First connection = Player 1 (red).  Second = Player 2 (blue).');
  console.log('  Ctrl+C to stop.\n');
});
