
const pageImg = new Image();
pageImg.src = 'docs/page-08.png';

const chart = document.getElementById('chart');
const ctx = chart.getContext('2d');
const paEl = document.getElementById('pa');
const oatEl = document.getElementById('oat');
const wtEl = document.getElementById('wt');
const runBtn = document.getElementById('run');
const demoBtn = document.getElementById('demo');
const statusTitle = document.getElementById('statusTitle');
const statusText = document.getElementById('statusText');
const maxWeightEl = document.getElementById('maxWeight');
const marginEl = document.getElementById('margin');

let DATA = null;
let lastResult = null;

fetch('data/eaps_off_base_nowind.json').then(r => r.json()).then(j => {
  DATA = j;
  pageImg.onload = () => draw();
  if (pageImg.complete) draw();
});

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function round5(v) { return Math.round(v / 5) * 5; }
function formatKg(v) { return Math.round(v).toLocaleString('pt-BR') + ' kg'; }

function xToKg(x) {
  const g = DATA.mainChart;
  return g.xKgMin + ((x - g.left) / (g.right - g.left)) * (g.xKgMax - g.xKgMin);
}
function kgToX(kg) {
  const g = DATA.mainChart;
  return g.left + ((kg - g.xKgMin) / (g.xKgMax - g.xKgMin)) * (g.right - g.left);
}
function paToY(paFt) {
  const g = DATA.mainChart;
  const t = (paFt - g.yPaMinFt) / (g.yPaMaxFt - g.yPaMinFt);
  return g.bottom - t * (g.bottom - g.top);
}
function xAtY(points, y) {
  const xs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const ymin = Math.min(y1, y2), ymax = Math.max(y1, y2);
    if (y >= ymin - 0.01 && y <= ymax + 0.01 && Math.abs(y2 - y1) > 0.0001) {
      const t = (y - y1) / (y2 - y1);
      if (t >= -0.001 && t <= 1.001) xs.push(x1 + t * (x2 - x1));
    }
  }
  if (!xs.length) return NaN;
  return Math.max(...xs);
}
function interp1(x, xp, fp) {
  if (x <= xp[0]) return fp[0];
  if (x >= xp[xp.length - 1]) return fp[fp.length - 1];
  for (let i = 0; i < xp.length - 1; i++) {
    if (x >= xp[i] && x <= xp[i + 1]) {
      const t = (x - xp[i]) / (xp[i + 1] - xp[i]);
      return fp[i] + t * (fp[i + 1] - fp[i]);
    }
  }
  return fp[fp.length - 1];
}

function calculateBaseNoWind(paFt, oat, actualWeightKg) {
  const temps = Object.keys(DATA.tempCurves).map(Number).sort((a,b)=>a-b);
  if (oat < temps[0] || oat > temps[temps.length - 1]) {
    return { error: 'OAT fora da faixa do chart (-40°C a 50°C).' };
  }
  const y = paToY(clamp(paFt, DATA.mainChart.yPaMinFt, DATA.mainChart.yPaMaxFt));
  let lower = temps[0], upper = temps[temps.length - 1];
  for (const t of temps) {
    if (t <= oat) lower = t;
    if (t >= oat) { upper = t; break; }
  }
  const lowerCurve = DATA.tempCurves[String(lower)];
  const upperCurve = DATA.tempCurves[String(upper)];
  const lowerX = xAtY(lowerCurve, y);
  const upperX = xAtY(upperCurve, y);
  if (Number.isNaN(lowerX) || Number.isNaN(upperX)) {
    return { error: 'Ponto fora da família explícita de curvas desta build base sem vento.' };
  }
  let x = lowerX;
  if (lower !== upper) {
    const t = (oat - lower) / (upper - lower);
    x = lowerX + t * (upperX - lowerX);
  }
  const maxWeight = round5(Math.min(DATA.mainChart.xKgMax, xToKg(x)));
  const margin = maxWeight - actualWeightKg;
  return { paFt, oat, actualWeightKg, y, lower, upper, lowerCurve, upperCurve, lowerX, upperX, x, maxWeight, margin, within: margin >= 0 };
}

function draw() {
  if (!DATA || !pageImg.complete) return;
  chart.width = pageImg.naturalWidth;
  chart.height = pageImg.naturalHeight;
  ctx.clearRect(0,0,chart.width,chart.height);
  ctx.drawImage(pageImg, 0, 0);

  // summary box
  ctx.fillStyle = 'rgba(27,31,39,0.86)';
  ctx.beginPath();
  ctx.roundRect(38, 38, 980, 136, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = '700 24px sans-serif';
  ctx.fillText('EAPS OFF — leitura base sem vento', 58, 74);
  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#d8e2f0';
  ctx.fillText('Figure 4-8 | Page S50-31 | usando somente o envelope principal nesta build', 58, 108);
  if (lastResult && !lastResult.error) {
    ctx.fillText(`PA ${Math.round(lastResult.paFt)} ft | OAT ${lastResult.oat}°C | WT ${Math.round(lastResult.actualWeightKg)} kg | Max ${Math.round(lastResult.maxWeight)} kg`, 58, 140);
  }

  const g = DATA.mainChart;
  ctx.strokeStyle = '#18b9f7';
  ctx.lineWidth = 3;
  ctx.strokeRect(g.left, g.top, g.right-g.left, g.bottom-g.top);

  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 3;
  const hw = DATA.headwindChart;
  ctx.strokeRect(hw.left, hw.top, hw.right-hw.left, hw.bottom-hw.top);

  ctx.strokeStyle = '#ffffff';
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(g.left, g.yZeroFt);
  ctx.lineTo(g.right, g.yZeroFt);
  ctx.stroke();
  ctx.setLineDash([]);

  if (!lastResult || lastResult.error) return;

  // curves
  const drawCurve = (pts, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    });
    ctx.stroke();
  };
  drawCurve(lastResult.lowerCurve, '#f3b447');
  if (lastResult.upper !== lastResult.lower) drawCurve(lastResult.upperCurve, '#f3b447');

  // PA line
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(g.left, lastResult.y);
  ctx.lineTo(g.right, lastResult.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // actual weight line
  const actualX = kgToX(clamp(lastResult.actualWeightKg, g.xKgMin, g.xKgMax));
  ctx.strokeStyle = '#52a8ff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(actualX, g.top);
  ctx.lineTo(actualX, hw.bottom);
  ctx.stroke();

  // max weight line
  const maxX = kgToX(lastResult.maxWeight);
  ctx.strokeStyle = lastResult.within ? '#14b86a' : '#df4f5f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(maxX, g.top);
  ctx.lineTo(maxX, hw.bottom);
  ctx.stroke();

  // dots
  const dot = (x,y,color,r=7) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = '#081019';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fill();
    ctx.stroke();
  };
  dot(lastResult.x, lastResult.y, '#ffffff', 8);
  dot(actualX, lastResult.y, '#52a8ff', 7);
  dot(maxX, lastResult.y, lastResult.within ? '#14b86a' : '#df4f5f', 8);
}

function run() {
  if (!DATA) return;
  const pa = Number(paEl.value);
  const oat = Number(oatEl.value);
  const wt = Number(wtEl.value);
  if ([pa,oat,wt].some(Number.isNaN)) {
    statusTitle.textContent = 'Aguardando dados';
    statusText.textContent = 'Preencha altitude, OAT e peso.';
    maxWeightEl.textContent = '—';
    marginEl.textContent = '—';
    lastResult = null;
    draw();
    return;
  }
  lastResult = calculateBaseNoWind(pa, oat, wt);
  if (lastResult.error) {
    statusTitle.textContent = 'Validação manual necessária';
    statusText.textContent = lastResult.error;
    maxWeightEl.textContent = '—';
    marginEl.textContent = '—';
  } else {
    statusTitle.textContent = lastResult.within ? 'WITHIN ENVELOPE' : 'OUT OF ENVELOPE';
    statusText.textContent = 'Leitura base sem vento do envelope principal da Figure 4-8.';
    maxWeightEl.textContent = formatKg(lastResult.maxWeight);
    marginEl.textContent = (lastResult.margin >= 0 ? '+' : '') + Math.round(lastResult.margin).toLocaleString('pt-BR') + ' kg';
  }
  draw();
}
runBtn.addEventListener('click', run);
demoBtn.addEventListener('click', () => {
  paEl.value = '0';
  oatEl.value = '30';
  wtEl.value = '6600';
  run();
});
window.addEventListener('resize', draw);
