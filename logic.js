const canvas = document.getElementById('board'), ctx = canvas.getContext('2d'), tt = document.getElementById('tooltip');
const GRID = 30, OFFSET = 75;
let COLS = 24, ROWS = 18, components = [], connections = [], vccPins = [], gndPins = [];
let activePin = null, draggingComp = null, currentMousePin = null, hoveredComp = null, hoveredWire = null;
let hidePins = false, isPrimitiveMode = false;
let lastValidPos = { gx: 0, gy: 0 }; 

const COLORS = ['#FF5252', '#FFEB3B', '#2196F3', '#4CAF50', '#FF9800', '#E91E63', '#00BCD4', '#9C27B0', '#00FF00', '#FFA07A'];

const COMP_TYPES = {
    resistor: { name: 'R', w: 3, h: 1, color: 'rgba(129,212,250,0.8)', pins: [{x:0,y:0}, {x:2,y:0}] },
    capacitor: { name: 'C', w: 2, h: 1, color: 'rgba(255,241,118,0.8)', pins: [{x:0,y:0}, {x:1,y:0}] },
    elecCap: { name: 'E', w: 2, h: 1, color: '#2e7d32', pins: [{x:0,y:0}, {x:1,y:0}] },
    transistor: { name: 'Q', w: 3, h: 1, color: 'rgba(239,83,80,0.8)', pins: [{x:0,y:0}, {x:1,y:0}, {x:2,y:0}], labels: ['C','B','E'] },
    transistor_bce: { name: 'Q', w: 3, h: 1, color: 'rgba(239,83,80,0.8)', pins: [{x:0,y:0}, {x:1,y:0}, {x:2,y:0}], labels: ['B','C','E'] },
    opamp: { name: 'IC', w: 4, h: 3, color: 'rgba(20,20,20,0.95)', pins: [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0},{x:0,y:2},{x:1,y:2},{x:2,y:2},{x:3,y:2}] }
};

class Component {
    constructor(type, gx, gy, id, rotation = 0) {
        this.type = type; this.config = COMP_TYPES[type];
        this.gx = gx; this.gy = gy; this.id = id; this.rotation = rotation;
    }
    getHitbox() {
        const isV = (this.rotation / 90) % 2 !== 0;
        return { x1: this.gx, y1: this.gy, w: isV ? this.config.h : this.config.w, h: isV ? this.config.w : this.config.h };
    }
    getPinPos(idx) {
        const pin = this.config.pins[idx], rad = (this.rotation * Math.PI) / 180;
        const cos = Math.round(Math.cos(rad)), sin = Math.round(Math.sin(rad));
        const cx = (this.config.w - 1) / 2, cy = (this.config.h - 1) / 2;
        const nx = (pin.x - cx) * cos - (pin.y - cy) * sin + cx;
        const ny = (pin.x - cx) * sin + (pin.y - cy) * cos + cy;
        const hb = this.getHitbox();
        return { x: Math.round(this.gx + nx - (this.config.w - hb.w) / 2), y: Math.round(this.gy + ny - (this.config.h - hb.h) / 2) };
    }
    getPinLabel(idx) {
        if (this.config.labels) return this.config.labels[idx];
        if (this.type === 'opamp') {
            if (idx < 4) return 4 - idx; // 4,3,2,1
            return idx + 1; // 5,6,7,8
        }
        return idx + 1;
    }
    drawBody(isColliding) {
        ctx.save();
        const hb = this.getHitbox();
        const centerX = (this.gx + (hb.w - 1) / 2) * GRID + OFFSET, cy = (this.gy + (hb.h - 1) / 2) * GRID + OFFSET;
        ctx.translate(centerX, cy); ctx.rotate((this.rotation * Math.PI) / 180);
        const col = isColliding ? 'rgba(255,0,0,0.8)' : this.config.color;

        if (isPrimitiveMode) {
            ctx.fillStyle = col;
            const bw = (this.config.w - 1) * GRID + 24, bh = (this.config.h - 1) * GRID + 24;
            ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
        } else {
            if (this.type === 'opamp') {
                ctx.fillStyle = "#888";
                this.config.pins.forEach(p => ctx.fillRect((p.x-(this.config.w-1)/2)*GRID-8, (p.y-(this.config.h-1)/2)*GRID-4, 16, 8));
                ctx.fillStyle = isColliding ? 'rgba(255,0,0,0.8)' : "#0a0a0a";
                const bw = (this.config.w - 1) * GRID + 14, bh = (this.config.h - 1) * GRID;
                ctx.beginPath(); ctx.roundRect(-bw/2, -bh/2, bw, bh, 4); ctx.fill();
                ctx.strokeStyle = "#444"; ctx.lineWidth = 2; ctx.beginPath(); 
                ctx.arc(bw/2, 0, 6, Math.PI/2, -Math.PI/2); ctx.stroke();
            } else if (this.type === 'resistor') {
                ctx.fillStyle = col; const fw = (this.config.w - 1) * GRID;
                ctx.fillRect(-fw/2 - 4, -8, 8, 16); ctx.fillRect(fw/2 - 4, -8, 8, 16); ctx.fillRect(-fw/2, -5, fw, 10);
            } else if (this.type === 'capacitor') {
                ctx.fillStyle = col; ctx.fillRect(-(this.config.w - 1) * GRID / 2, -10, (this.config.w - 1) * GRID, 20);
            } else if (this.type === 'elecCap') {
                ctx.fillStyle = col; ctx.strokeStyle = "#81c784"; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(0, 0, GRID / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            } else if (this.type.startsWith('transistor')) {
                ctx.strokeStyle = "#888"; ctx.lineWidth = 4;
                this.config.pins.forEach(p => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo((p.x - (this.config.w - 1) / 2) * GRID, 0); ctx.stroke(); });
                ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(-(this.config.w - 1) * GRID / 2, -10, (this.config.w - 1) * GRID, 20, 6); ctx.fill();
            } else {
                ctx.fillStyle = col; ctx.fillRect(-(this.config.w-1)*GRID/2-12, -(this.config.h-1)*GRID/2-12, (this.config.w-1)*GRID+24, (this.config.h-1)*GRID+24);
            }
        }
        ctx.restore();
    }
}

function getWirePath(cn) {
    const p1 = cn.p1.comp.getPinPos(cn.p1.idx), p2 = cn.p2.comp.getPinPos(cn.p2.idx);
    const x1 = p1.x * GRID + OFFSET, y1 = p1.y * GRID + OFFSET;
    const x2 = p2.x * GRID + OFFSET, y2 = p2.y * GRID + OFFSET;
    const dx = Math.abs(p2.x - p1.x), dy = Math.abs(p2.y - p1.y);
    return (dy > dx) ? [{x: x1, y: y1}, {x: x1, y: y2}, {x: x2, y: y2}] : [{x: x1, y: y1}, {x: x2, y: y1}, {x: x2, y: y2}];
}

function checkWireHit(mx, my, cn) {
    const path = getWirePath(cn);
    const t = 8;
    for(let i=0; i < path.length - 1; i++) {
        const a = path[i], b = path[i+1];
        const minX = Math.min(a.x, b.x) - t, maxX = Math.max(a.x, b.x) + t;
        const minY = Math.min(a.y, b.y) - t, maxY = Math.max(a.y, b.y) + t;
        if (mx >= minX && mx <= maxX && my >= minY && my <= maxY) return true;
    }
    return false;
}

function checkColl(c1, c2) {
    const h1 = c1.getHitbox(), h2 = c2.getHitbox();
    return !(h1.x1 + h1.w - 1 < h2.x1 || h1.x1 > h2.x1 + h2.w - 1 || h1.y1 + h1.h - 1 < h2.y1 || h1.y1 > h2.y1 + h2.h - 1);
}

function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const rails = [OFFSET-60, OFFSET-30, OFFSET+(ROWS-1)*GRID+30, OFFSET+(ROWS-1)*GRID+60];
    rails.forEach((y, i) => {
        ctx.fillStyle = (i%2===0) ? "#f22" : "#000";
        for(let j=0; j<COLS; j++) { ctx.beginPath(); ctx.arc(j*GRID+OFFSET, y, 5, 0, 7); ctx.fill(); }
    });
    for(let i=0; i<COLS; i++) for(let j=0; j<ROWS; j++) {
        ctx.fillStyle = "#a88e73"; ctx.beginPath(); ctx.arc(i*GRID+OFFSET, j*GRID+OFFSET, 5, 0, 7); ctx.fill();
        ctx.fillStyle = "#0a1a0a"; ctx.beginPath(); ctx.arc(i*GRID+OFFSET, j*GRID+OFFSET, 2, 0, 7); ctx.fill();
    }

    const drawPwrLine = (p, vcc) => {
        const pos = p.comp.getPinPos(p.idx), ry = (pos.y < ROWS/2) ? (vcc ? rails[0] : rails[1]) : (vcc ? rails[2] : rails[3]);
        ctx.strokeStyle = vcc ? "#f22" : "#555"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(pos.x*GRID+OFFSET, pos.y*GRID+OFFSET); ctx.lineTo(pos.x*GRID+OFFSET, ry); ctx.stroke();
    };
    vccPins.forEach(p => drawPwrLine(p, true)); gndPins.forEach(p => drawPwrLine(p, false));
    
    connections.forEach(cn => {
        const path = getWirePath(cn);
        const isH = (hoveredWire === cn) || (currentMousePin && (
            (cn.p1.comp === currentMousePin.comp && cn.p1.idx === currentMousePin.idx) ||
            (cn.p2.comp === currentMousePin.comp && cn.p2.idx === currentMousePin.idx)
        ));
        ctx.strokeStyle = cn.color; ctx.lineWidth = isH ? 8 : 4; ctx.globalAlpha = isH ? 1 : 0.7;
        ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
        for(let i=1; i<path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke(); ctx.globalAlpha = 1;
    });

    components.forEach(c => {
        c.drawBody(draggingComp === c && components.some(o => o !== c && checkColl(c, o)));
        if (!hidePins) c.config.pins.forEach((_, i) => {
            const p = c.getPinPos(i), isV = vccPins.some(v => v.comp===c && v.idx===i), isG = gndPins.some(g => g.comp===c && g.idx===i);
            const nets = connections.filter(cn => (cn.p1.comp===c && cn.p1.idx===i) || (cn.p2.comp===c && cn.p2.idx===i));
            let dotCol = "#222", textColor = "#fff", char = c.getPinLabel(i);
            if(isV) { dotCol="#f00"; char="V"; }
            else if(isG) { dotCol="#000"; char="G"; }
            else if(nets.length > 1) { dotCol="#00e5ff"; char="M"; textColor="#000"; }
            else if(nets.length === 1) { dotCol=nets[0].color; }
            
            ctx.fillStyle = dotCol; ctx.beginPath(); ctx.arc(p.x*GRID+OFFSET, p.y*GRID+OFFSET, 10, 0, 7); ctx.fill();
            ctx.save(); ctx.fillStyle = textColor; ctx.font = "bold 10px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(char, p.x*GRID+OFFSET, p.y*GRID+OFFSET+1); ctx.restore();

            if ((activePin && activePin.comp === c && activePin.idx === i)) {
                ctx.strokeStyle = "#0f0"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x*GRID+OFFSET, p.y*GRID+OFFSET, 15, 0, 7); ctx.stroke();
            } else if (currentMousePin && currentMousePin.comp === c && currentMousePin.idx === i) {
                ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x*GRID+OFFSET, p.y*GRID+OFFSET, 15, 0, 7); ctx.stroke();
            }
        });
        const hb = c.getHitbox();
        const ncx = (c.gx + (hb.w - 1) / 2) * GRID + OFFSET, ncy = (c.gy + (hb.h - 1) / 2) * GRID + OFFSET;
        ctx.fillStyle = "#fff"; ctx.font = "bold 12px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(`${c.config.name}${c.id}`, ncx, ncy);
    });
}

function toggleRenderMode() {
    isPrimitiveMode = !isPrimitiveMode;
    document.getElementById('toggleMode').innerText = isPrimitiveMode ? "📦 Режим: Примитив" : "🎨 Режим: Графика";
    draw();
}

function showModal() { document.getElementById('modal-overlay').style.display = 'flex'; }
function hideModal() { document.getElementById('modal-overlay').style.display = 'none'; }

function initNewBoard() {
    let w = parseInt(document.getElementById('boardW').value) || 24;
    let h = parseInt(document.getElementById('boardH').value) || 18;
    if (w > 40) w = 40; if (h > 24) h = 24; if (w < 1) w = 1; if (h < 1) h = 1;
    COLS = w; ROWS = h;
    canvas.width = (COLS-1)*GRID + OFFSET*2; canvas.height = (ROWS-1)*GRID + OFFSET*2;
    components = []; connections = []; vccPins = []; gndPins = [];
    hideModal(); draw();
}

window.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect(), mx = e.clientX-r.left, my = e.clientY-r.top;
    currentMousePin = null; hoveredComp = null; hoveredWire = null;
    components.forEach(c => {
        const hb = c.getHitbox();
        if(mx > hb.x1*GRID+OFFSET-15 && mx < (hb.x1+hb.w-1)*GRID+OFFSET+15 && my > hb.y1*GRID+OFFSET-15 && my < (hb.y1+hb.h-1)*GRID+OFFSET+15) hoveredComp = c;
        if (!hidePins) c.config.pins.forEach((_, i) => { const p = c.getPinPos(i); if(Math.hypot(p.x*GRID+OFFSET-mx, p.y*GRID+OFFSET-my) < 15) currentMousePin = {comp:c, idx:i}; });
    });
    if(!currentMousePin) connections.forEach(cn => { if(checkWireHit(mx, my, cn)) hoveredWire = cn; });
    if(currentMousePin) {
        const p = currentMousePin;
        let h = `<b style="color:white">${p.comp.config.name}${p.comp.id}: Пин ${p.comp.getPinLabel(p.idx)}</b>`;
        if(vccPins.some(v => v.comp===p.comp && v.idx===p.idx)) h += `<div style="color:red">● VCC</div>`;
        if(gndPins.some(g => g.comp===p.comp && g.idx===p.idx)) h += `<div style="color:gray">● GND</div>`;
        connections.filter(cn => (cn.p1.comp===p.comp && cn.p1.idx===p.idx) || (cn.p2.comp===p.comp && cn.p2.idx===p.idx)).forEach(cn => {
            const dest = (cn.p1.comp === p.comp && cn.p1.idx === p.idx) ? cn.p2 : cn.p1;
            h += `<div style="color:${cn.color}">● ${dest.comp.config.name}${dest.comp.id} (${dest.comp.getPinLabel(dest.idx)})</div>`;
        });
        tt.style.display = 'block'; tt.innerHTML = h;
        tt.style.left = (e.clientX - tt.offsetWidth - 10) + 'px'; tt.style.top = (e.clientY - tt.offsetHeight - 10) + 'px';
    } else tt.style.display = 'none';
    if(draggingComp) { 
        const hb = draggingComp.getHitbox();
        draggingComp.gx = Math.max(0, Math.min(COLS-hb.w, Math.round((mx-OFFSET)/GRID - (draggingComp.config.w-1)/2)));
        draggingComp.gy = Math.max(0, Math.min(ROWS-hb.h, Math.round((my-OFFSET)/GRID - (draggingComp.config.h-1)/2)));
    } draw();
};

canvas.onmousedown = (e) => {
    if(e.button === 0) {
        if(hoveredWire) connections = connections.filter(c => c !== hoveredWire);
        else if(currentMousePin) {
            if(!activePin) activePin = currentMousePin;
            else { if(activePin.comp !== currentMousePin.comp || activePin.idx !== currentMousePin.idx) connections.push({p1:activePin, p2:currentMousePin, color: COLORS[connections.length%COLORS.length]}); activePin = null; }
        } else activePin = null;
    } else if(e.button === 2 && currentMousePin) {
        const p = currentMousePin;
        connections = connections.filter(cn => !((cn.p1.comp===p.comp && cn.p1.idx===p.idx) || (cn.p2.comp===p.comp && cn.p2.idx===p.idx)));
        vccPins = vccPins.filter(v => !(v.comp===p.comp && v.idx===p.idx)); gndPins = gndPins.filter(g => !(g.comp===p.comp && g.idx===p.idx));
    } else if(e.button === 1 && hoveredComp) {
        draggingComp = hoveredComp; lastValidPos = { gx: draggingComp.gx, gy: draggingComp.gy };
    } draw();
};

window.onmouseup = () => {
    if (draggingComp && components.some(o => o !== draggingComp && checkColl(draggingComp, o))) {
        draggingComp.gx = lastValidPos.gx; draggingComp.gy = lastValidPos.gy;
    }
    draggingComp = null; draw();
};

window.onkeydown = (e) => {
    const k = e.key.toLowerCase();
    if(k === 'h') { hidePins = !hidePins; draw(); }
    if(currentMousePin) {
        const p = currentMousePin, isM = (x) => x.comp === p.comp && x.idx === p.idx;
        if(k === 'v') { const aV = vccPins.some(isM); vccPins = vccPins.filter(x => !isM(x)); gndPins = gndPins.filter(x => !isM(x)); if(!aV) vccPins.push(p); }
        if(k === 'g') { const aG = gndPins.some(isM); gndPins = gndPins.filter(x => !isM(x)); vccPins = vccPins.filter(x => !isM(x)); if(!aG) gndPins.push(p); }
        draw();
    }
    if(k === 'r' && hoveredComp) {
        const old = hoveredComp.rotation; hoveredComp.rotation = (hoveredComp.rotation + 90) % 360;
        const hb = hoveredComp.getHitbox(); if(hoveredComp.gx+hb.w > COLS || hoveredComp.gy+hb.h > ROWS || components.some(o => o !== hoveredComp && checkColl(hoveredComp, o))) hoveredComp.rotation = old;
        draw();
    }
    if(k === 'delete' && hoveredComp) {
        components = components.filter(c => c !== hoveredComp);
        connections = connections.filter(cn => cn.p1.comp !== hoveredComp && cn.p2.comp !== hoveredComp);
        vccPins = vccPins.filter(p => p.comp !== hoveredComp); gndPins = gndPins.filter(p => p.comp !== hoveredComp);
        draw();
    }
};

function addComp(t) {
    let mid = 0; components.filter(c=>c.type===t).forEach(c => { if(c.id > mid) mid = c.id; });
    components.push(new Component(t, 0, 0, mid + 1)); draw();
}

async function saveToFile() {
    const data = { COLS, ROWS, comps: components.map(c => ({t:c.type, x:c.gx, y:c.gy, id:c.id, r:c.rotation})), conns: connections.map(cn => ({p1:{id:cn.p1.comp.id, t:cn.p1.comp.type, i:cn.p1.idx}, p2:{id:cn.p2.comp.id, t:cn.p2.comp.type, i:cn.p2.idx}, c:cn.color})), vcc: vccPins.map(p => ({id:p.comp.id, t:p.comp.type, i:p.idx})), gnd: gndPins.map(p => ({id:p.comp.id, t:p.comp.type, i:p.idx})) };
    const jsonString = JSON.stringify(data, null, 2);
    if (window.showSaveFilePicker) {
        try { const handle = await window.showSaveFilePicker({ suggestedName: 'pcb_project.json', types: [{ description: 'JSON', accept: {'application/json': ['.json']} }] }); const writable = await handle.createWritable(); await writable.write(jsonString); await writable.close(); } catch (err) {}
    } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([jsonString], {type: 'application/json'})); a.download = 'pcb_project.json'; a.click();
    }
}

function loadFromFile(ev) {
    const file = ev.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            COLS = parseInt(data.COLS) || 24; ROWS = parseInt(data.ROWS) || 18;
            canvas.width = (COLS - 1) * GRID + OFFSET * 2; canvas.height = (ROWS - 1) * GRID + OFFSET * 2;
            components = data.comps.map(c => new Component(c.t, c.x, c.y, c.id, c.r || 0));
            const findObj = (ref) => { if (!ref) return null; const found = components.find(c => c.id === ref.id && c.type === ref.t); return found ? { comp: found, idx: ref.i } : null; };
            connections = (data.conns || []).map(cn => { const p1 = findObj(cn.p1), p2 = findObj(cn.p2); return (p1 && p2) ? { p1, p2, color: cn.c } : null; }).filter(x => x !== null);
            vccPins = (data.vcc || []).map(p => findObj(p)).filter(x => x !== null);
            gndPins = (data.gnd || []).map(p => findObj(p)).filter(x => x !== null);
            draw();
        } catch (err) { alert("Ошибка загрузки"); }
    };
    reader.readAsText(file); ev.target.value = '';
}

window.onload = initNewBoard;
canvas.oncontextmenu = (e) => e.preventDefault();
