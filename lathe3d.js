import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";
import { OBJExporter } from "https://unpkg.com/three@0.165.0/examples/jsm/exporters/OBJExporter.js?module";

const drawCanvas = document.getElementById("drawCanvas");
const ctx = drawCanvas.getContext("2d");
const threeCanvas = document.getElementById("threeCanvas");
const exportScaleInput = document.getElementById("exportScaleInput");
const exportBtn = document.getElementById("exportBtn");
const exportX90Btn = document.getElementById("exportX90Btn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const ptCount = document.getElementById("ptCount");
const modeBadge = document.getElementById("modeBadge");
const axisDistInfo = document.getElementById("axisDistInfo");
const undoBtn = document.getElementById("undoBtn");
const clearBtn = document.getElementById("clearBtn");
const importBtn = document.getElementById("importBtn");
const pasteBtn = document.getElementById("pasteBtn");
const importInput = document.getElementById("importInput");
const createBtn = document.getElementById("createBtn");
const rotateCcwBtn = document.getElementById("rotateCcwBtn");
const rotateCwBtn = document.getElementById("rotateCwBtn");
const rotateStepInput = document.getElementById("rotateStepInput");
const moveStepInput = document.getElementById("moveStepInput");
const segSlider = document.getElementById("segSlider");
const wireSlider = document.getElementById("wireSlider");
const segVal = document.getElementById("segVal");
const wireVal = document.getElementById("wireVal");
const SEGMENTS_STORAGE_KEY = "lathe3d.segments";

let points = [];
let drawing = false;
let dpr = Math.max(1, window.devicePixelRatio || 1);
let appliedScale = 1;
let viewScale2D = 1;
let viewOffsetX2D = 0;
let viewOffsetY2D = 0;

function setDrawMode(is3d=false){
  modeBadge.textContent = is3d ? "3D VIEW" : "DRAW MODE";
  modeBadge.classList.toggle("view", is3d);
}
function resize2D(){
  dpr = Math.max(1, window.devicePixelRatio || 1);
  const r = drawCanvas.getBoundingClientRect();
  drawCanvas.width = Math.max(1, Math.round(r.width * dpr));
  drawCanvas.height = Math.max(1, Math.round(r.height * dpr));
  clamp2DViewOffset();
  draw();
}
function clamp2DViewOffset(){
  const w = drawCanvas.width / dpr;
  const h = drawCanvas.height / dpr;
  const maxX = Math.max(0, (viewScale2D - 1) * w / 2);
  const maxY = Math.max(0, (viewScale2D - 1) * h / 2);
  viewOffsetX2D = Math.max(-maxX, Math.min(maxX, viewOffsetX2D));
  viewOffsetY2D = Math.max(-maxY, Math.min(maxY, viewOffsetY2D));
}
function getCanvasPoint(e){
  const r = drawCanvas.getBoundingClientRect();
  const sx = (e.clientX - r.left) * (drawCanvas.width / r.width) / dpr;
  const sy = (e.clientY - r.top) * (drawCanvas.height / r.height) / dpr;
  const w = drawCanvas.width / dpr;
  const h = drawCanvas.height / dpr;
  const cx = w / 2 + viewOffsetX2D;
  const cy = h / 2 + viewOffsetY2D;
  const x = cx + (sx - cx) / viewScale2D;
  const y = cy + (sy - cy) / viewScale2D;
  return {x,y};
}
function set2DViewScale(next){
  viewScale2D = Math.max(0.3, Math.min(6, next));
  clamp2DViewOffset();
  draw();
}
function updateAxisDistanceInfo(point){
  if(!axisDistInfo) return;
  if(!point){
    axisDistInfo.textContent = "축거리: -";
    return;
  }
  const w = drawCanvas.width / dpr;
  const cx = w / 2;
  const dist = Math.abs(point.x - cx);
  axisDistInfo.textContent = `축거리: ${dist.toFixed(1)} px`;
}
function updateAxisDistanceStatsSummary(){
  if(!axisDistInfo || points.length === 0){
    updateAxisDistanceInfo(null);
    return;
  }

  const w = drawCanvas.width / dpr;
  const cx = w / 2;
  const distances = points.map(p => Math.abs(p.x - cx));
  const min = Math.min(...distances);
  const max = Math.max(...distances);
  const avg = distances.reduce((sum, v) => sum + v, 0) / distances.length;

  axisDistInfo.textContent = `축거리 평균 ${avg.toFixed(1)} px · 최소 ${min.toFixed(1)} · 최대 ${max.toFixed(1)}`;
}
function draw(){
  const w = drawCanvas.width / dpr, h = drawCanvas.height / dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);

  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0,0,w,h);

  const cx = w / 2 + viewOffsetX2D;
  const cy = h / 2 + viewOffsetY2D;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(viewScale2D, viewScale2D);
  ctx.translate(-cx, -cy);

  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  const grid = 24;
  for(let x=0;x<=w;x+=grid){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=0;y<=h;y+=grid){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}

  ctx.save();
  ctx.setLineDash([8,8]);
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(w/2,0); ctx.lineTo(w/2,h); ctx.stroke();
  ctx.restore();

  if(points.length){
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    points.forEach((p,i)=> i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
    ctx.stroke();

    for(const p of points){
      ctx.beginPath();
      ctx.arc(p.x,p.y,3.7,0,Math.PI*2);
      ctx.fillStyle = "#38bdf8";
      ctx.fill();
      ctx.strokeStyle = "#082f49";
      ctx.stroke();
    }
  }
  ctx.restore();
  ptCount.textContent = `${points.length} pts`;
}
function addPoint(p){
  const last = points[points.length-1];
  const minSpacing = 2 / Math.max(0.3, viewScale2D);
  if(!last || Math.hypot(p.x-last.x,p.y-last.y) > minSpacing){
    points.push(p);
    updateAxisDistanceInfo(p);
    setDrawMode(false);
    draw();
  }
}

function extractImportPoints(data){
  if(!data || !Array.isArray(data.groups)) return [];
  const out = [];
  for(const group of data.groups){
    if(!group || !Array.isArray(group.segments)) continue;
    for(const seg of group.segments){
      if(!seg || !Array.isArray(seg.points)) continue;
      for(const p of seg.points){
        const x = Number(p?.x), y = Number(p?.y);
        if(Number.isFinite(x) && Number.isFinite(y)) out.push({x,y});
      }
    }
  }
  return out;
}

function mapImportPoints(raw, data){
  const w = drawCanvas.width / dpr;
  const h = drawCanvas.height / dpr;
  const pad = 24;

  const xs = raw.map(p=>p.x);
  const ys = raw.map(p=>p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  let srcW = Number(data?.canvas1ClipboardScale?.sourceWidth);
  let srcH = Number(data?.canvas1ClipboardScale?.sourceHeight);
  if(!Number.isFinite(srcW) || srcW <= 0) srcW = Math.max(1, maxX - minX);
  if(!Number.isFinite(srcH) || srcH <= 0) srcH = Math.max(1, maxY - minY);

  const scale = Math.min(
    Math.max(1, w - pad * 2) / srcW,
    Math.max(1, h - pad * 2) / srcH
  );
  const offX = (w - srcW * scale) / 2;
  const offY = (h - srcH * scale) / 2;

  return raw.map(p => ({
    x: (p.x - minX) * scale + offX,
    y: (p.y - minY) * scale + offY
  }));
}

function flashWarn(button){
  button.classList.add("warn");
  setTimeout(()=>button.classList.remove("warn"), 450);
}

function getNumericInputValue(input, fallback, min, max){
  const raw = Number(input?.value);
  let next = Number.isFinite(raw) ? raw : fallback;
  next = Math.max(min, Math.min(max, next));
  if(input) input.value = String(next);
  return next;
}

function getRotateStepDeg(){
  return getNumericInputValue(rotateStepInput, 8, 0.1, 180);
}

function getMoveStepPx(){
  return getNumericInputValue(moveStepInput, 4, 1, 200);
}

function getScaleValueForApply(){
  return getNumericInputValue(exportScaleInput, 1, 0.001, 100);
}

function applyScaleToCurrentModel(){
  if(mesh) mesh.scale.setScalar(appliedScale);
  if(wire) wire.scale.setScalar(appliedScale);
}

function rotatePointsAroundMiddle(direction){
  if(points.length < 2){
    flashWarn(direction > 0 ? rotateCcwBtn : rotateCwBtn);
    return;
  }

  const pivotIndex = Math.floor(points.length / 2);
  const pivot = points[pivotIndex];
  const angle = (getRotateStepDeg() * Math.PI / 180) * direction;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  points = points.map((p, i) => {
    if(i === pivotIndex) return {x: p.x, y: p.y};
    const dx = p.x - pivot.x;
    const dy = p.y - pivot.y;
    return {
      x: pivot.x + dx * cosA - dy * sinA,
      y: pivot.y + dx * sinA + dy * cosA
    };
  });

  clearLathe();
  setDrawMode(false);
  updateAxisDistanceInfo(points[points.length - 1]);
  draw();
}

function moveAllPoints(dx, dy){
  if(points.length === 0) return;

  points = points.map(p => ({
    x: p.x + dx,
    y: p.y + dy
  }));

  clearLathe();
  setDrawMode(false);
  updateAxisDistanceInfo(points[points.length - 1]);
  draw();
}

function importFromJsonData(data){
  const raw = extractImportPoints(data);
  if(raw.length === 0) return false;
  points = mapImportPoints(raw, data);
  updateAxisDistanceInfo(points[points.length - 1]);

  const importedScale = Number(data?.canvas1ClipboardScale?.scale);
  if(Number.isFinite(importedScale) && importedScale > 0){
    const min = Number(exportScaleInput.min) || 0.001;
    const max = Number(exportScaleInput.max) || 100;
    const clamped = Math.min(max, Math.max(min, importedScale));
    exportScaleInput.value = String(clamped);
    // Make imported scale value visibly selected for quick confirmation/edit.
    exportScaleInput.focus();
    exportScaleInput.select();
  }

  clearLathe();
  setDrawMode(false);
  draw();
  return true;
}

drawCanvas.addEventListener("pointerdown", e => {
  if(e.button !== 0) return;
  drawing = true;
  drawCanvas.setPointerCapture(e.pointerId);
  addPoint(getCanvasPoint(e));
});
drawCanvas.addEventListener("pointermove", e => drawing && addPoint(getCanvasPoint(e)));
drawCanvas.addEventListener("pointerup", () => drawing = false);
drawCanvas.addEventListener("pointercancel", () => drawing = false);
drawCanvas.addEventListener("wheel", e => {
  if(viewScale2D <= 1) return;
  e.preventDefault();
  if(e.shiftKey){
    // Shift+wheel maps vertical wheel motion to horizontal panning.
    viewOffsetX2D -= e.deltaY;
  }else{
    viewOffsetX2D -= e.deltaX;
    viewOffsetY2D -= e.deltaY;
  }
  clamp2DViewOffset();
  draw();
},{passive:false});

undoBtn.onclick = () => {
  points.pop();
  updateAxisDistanceInfo(points[points.length - 1]);
  setDrawMode(false);
  draw();
};
clearBtn.onclick = () => {
  points = [];
  updateAxisDistanceInfo(null);
  clearLathe();
  setDrawMode(false);
  draw();
};
importBtn.onclick = () => importInput.click();
importInput.onchange = async e => {
  const file = e.target.files?.[0];
  if(!file) return;
  try{
    const txt = await file.text();
    const data = JSON.parse(txt);
    if(!importFromJsonData(data)) flashWarn(importBtn);
  }catch(err){
    flashWarn(importBtn);
    console.error("Import JSON failed:", err);
  }finally{
    importInput.value = "";
  }
};

pasteBtn.onclick = async () => {
  if(!navigator.clipboard || !navigator.clipboard.readText){
    flashWarn(pasteBtn);
    return;
  }

  try{
    const txt = await navigator.clipboard.readText();
    const data = JSON.parse(txt);
    if(!importFromJsonData(data)) flashWarn(pasteBtn);
  }catch(err){
    flashWarn(pasteBtn);
    console.error("Paste JSON failed:", err);
  }
};

rotateCcwBtn.onclick = () => rotatePointsAroundMiddle(1);
rotateCwBtn.onclick = () => rotatePointsAroundMiddle(-1);
zoomOutBtn.onclick = () => set2DViewScale(viewScale2D / 1.2);
zoomInBtn.onclick = () => set2DViewScale(viewScale2D * 1.2);

window.addEventListener("keydown", e => {
  const target = e.target;
  if(
    e.ctrlKey || e.metaKey || e.altKey ||
    (target instanceof HTMLElement && (
      target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT"
    ))
  ){
    return;
  }

  if(e.code === "NumpadAdd"){
    e.preventDefault();
    set2DViewScale(viewScale2D * 1.2);
    return;
  }
  if(e.code === "NumpadSubtract"){
    e.preventDefault();
    set2DViewScale(viewScale2D / 1.2);
    return;
  }

  const key = e.key.toLowerCase();
  const step = getMoveStepPx();
  if(key === "i"){
    e.preventDefault();
    moveAllPoints(0, -step);
  }else if(key === "k"){
    e.preventDefault();
    moveAllPoints(0, step);
  }else if(key === "j"){
    e.preventDefault();
    moveAllPoints(-step, 0);
  }else if(key === "l"){
    e.preventDefault();
    moveAllPoints(step, 0);
  }
});

function restoreSegmentsSetting(){
  try{
    const saved = Number(localStorage.getItem(SEGMENTS_STORAGE_KEY));
    const min = Number(segSlider.min);
    const max = Number(segSlider.max);
    if(Number.isFinite(saved) && saved >= min && saved <= max){
      segSlider.value = String(saved);
    }
  }catch(err){
    console.warn("Segments restore failed:", err);
  }
  segVal.textContent = segSlider.value;
}

segSlider.oninput = () => {
  segVal.textContent = segSlider.value;
  try{
    localStorage.setItem(SEGMENTS_STORAGE_KEY, segSlider.value);
  }catch(err){
    console.warn("Segments save failed:", err);
  }
};
wireSlider.oninput = () => {
  wireVal.textContent = `${wireSlider.value}%`;
  if(wireMat) wireMat.opacity = +wireSlider.value / 100;
};

new ResizeObserver(resize2D).observe(drawCanvas.parentElement);
window.addEventListener("resize", () => { resize2D(); resize3D(); });

const renderer = new THREE.WebGLRenderer({canvas:threeCanvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setClearColor(0x08101d);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x08101d, 7, 18);

const camera = new THREE.PerspectiveCamera(45,1,.05,100);
let target = new THREE.Vector3(0,0,0);
let radius = 6, theta = Math.PI/4, phi = Math.PI/2.4;

scene.add(new THREE.AmbientLight(0xffffff,.42));
const dir = new THREE.DirectionalLight(0xffffff,1.4); dir.position.set(4,6,5); scene.add(dir);
const point = new THREE.PointLight(0x7dd3fc,2.2,20); point.position.set(-3,2,4); scene.add(point);
const gridHelper = new THREE.GridHelper(8,32,0x334155,0x1f2937); scene.add(gridHelper);

let mesh=null, wire=null, wireMat=null;
function updateCamera(){
  phi = Math.max(.15, Math.min(Math.PI-.15, phi));
  radius = Math.max(1.5, Math.min(20, radius));
  camera.position.set(
    target.x + radius * Math.sin(phi) * Math.sin(theta),
    target.y + radius * Math.cos(phi),
    target.z + radius * Math.sin(phi) * Math.cos(theta)
  );
  camera.lookAt(target);
}
function resize3D(){
  const r = threeCanvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width,r.height,false);
  camera.aspect = r.width / Math.max(1,r.height);
  camera.updateProjectionMatrix();
}
function clearLathe(){
  for(const o of [mesh,wire]){
    if(!o) continue;
    scene.remove(o);
    o.geometry?.dispose();
    o.material?.dispose();
  }
  mesh = wire = wireMat = null;
}
function makeLathe(){
  if(points.length < 3){
    createBtn.classList.add("warn");
    setTimeout(()=>createBtn.classList.remove("warn"),450);
    return;
  }

  clearLathe();

  const w = drawCanvas.width / dpr, h = drawCanvas.height / dpr;
  const cx = w / 2;
  const minY = Math.min(...points.map(p=>p.y));
  const maxY = Math.max(...points.map(p=>p.y));
  const maxR = Math.max(...points.map(p=>Math.abs(p.x-cx)), 1);
  const ySpan = Math.max(1, maxY - minY);

  const profile = points.map(p => {
    const r = Math.max(0.015, Math.abs(p.x - cx) / maxR * 1.55);
    const y = (0.5 - (p.y - minY) / ySpan) * 3.2;
    return new THREE.Vector2(r,y);
  });

  const geo = new THREE.LatheGeometry(profile, +segSlider.value);
  geo.computeVertexNormals();

  const pos = geo.attributes.position;
  const colors = [];
  const colorA = new THREE.Color("#38bdf8");
  const colorB = new THREE.Color("#a78bfa");
  const colorC = new THREE.Color("#f472b6");
  let ymin=Infinity,ymax=-Infinity;
  for(let i=0;i<pos.count;i++){ const y=pos.getY(i); ymin=Math.min(ymin,y); ymax=Math.max(ymax,y); }
  for(let i=0;i<pos.count;i++){
    const t = (pos.getY(i)-ymin) / Math.max(.0001,ymax-ymin);
    const c = t < .5 ? colorA.clone().lerp(colorB,t*2) : colorB.clone().lerp(colorC,(t-.5)*2);
    colors.push(c.r,c.g,c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors,3));

  const mat = new THREE.MeshStandardMaterial({
    roughness:.42, metalness:.18, vertexColors:true, side:THREE.DoubleSide
  });
  mesh = new THREE.Mesh(geo,mat);
  scene.add(mesh);

  wireMat = new THREE.LineBasicMaterial({
    color:0xffffff, transparent:true, opacity:+wireSlider.value/100, depthTest:true
  });
  wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), wireMat);
  scene.add(wire);

  applyScaleToCurrentModel();

  updateAxisDistanceStatsSummary();
  setDrawMode(true);
}
createBtn.onclick = makeLathe;

const objExporter = new OBJExporter();
function exportObj(rotateX90=false){
  if(!mesh){
    flashWarn(rotateX90 ? exportX90Btn : exportBtn);
    return;
  }

  // Export identity-transformed geometry so preview auto-rotation is not baked in.
  const scaledGeo = mesh.geometry.clone();
  scaledGeo.scale(appliedScale, appliedScale, appliedScale);
  if(rotateX90){
    scaledGeo.rotateX(Math.PI / 2);
  }
  const temp = new THREE.Mesh(scaledGeo);
  const objText = objExporter.parse(temp);
  scaledGeo.dispose();
  const blob = new Blob([objText], {type:"text/plain;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lathe_model.obj";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
exportBtn.onclick = () => exportObj(false);
exportX90Btn.onclick = () => exportObj(true);

exportScaleInput.addEventListener("keydown", e => {
  if(e.key !== "Enter") return;
  e.preventDefault();
  appliedScale = getScaleValueForApply();
  applyScaleToCurrentModel();
  console.log("Applied export scale:", appliedScale);
});

const active = new Map();
let dragMode="rotate", lastX=0, lastY=0, lastPinch=0, dragging=false;

threeCanvas.addEventListener("contextmenu", e=>e.preventDefault());
threeCanvas.addEventListener("pointerdown", e=>{
  threeCanvas.setPointerCapture(e.pointerId);
  active.set(e.pointerId,{x:e.clientX,y:e.clientY});
  dragging = true;
  dragMode = e.button === 2 ? "pan" : "rotate";
  lastX=e.clientX; lastY=e.clientY;
});
threeCanvas.addEventListener("pointermove", e=>{
  if(!active.has(e.pointerId)) return;
  active.set(e.pointerId,{x:e.clientX,y:e.clientY});

  if(active.size >= 2){
    const a=[...active.values()];
    const d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
    if(lastPinch) radius *= lastPinch / Math.max(1,d);
    lastPinch = d;
    updateCamera();
    return;
  }

  const dx=e.clientX-lastX, dy=e.clientY-lastY;
  lastX=e.clientX; lastY=e.clientY;

  if(dragMode==="pan"){
    const pan = new THREE.Vector3();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix,0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix,1);
    pan.addScaledVector(right,-dx*0.006*radius);
    pan.addScaledVector(up,dy*0.006*radius);
    target.add(pan);
  }else{
    theta -= dx*0.006;
    phi -= dy*0.006;
  }
  updateCamera();
});
function endPointer(e){
  active.delete(e.pointerId);
  dragging = active.size > 0;
  if(active.size < 2) lastPinch = 0;
}
threeCanvas.addEventListener("pointerup", endPointer);
threeCanvas.addEventListener("pointercancel", endPointer);
threeCanvas.addEventListener("wheel", e=>{
  e.preventDefault();
  radius *= Math.exp(e.deltaY * 0.001);
  updateCamera();
},{passive:false});

function animate(){
  requestAnimationFrame(animate);
  if(mesh && !dragging){
    mesh.rotation.y += .0022;
    wire.rotation.y = mesh.rotation.y;
  }
  renderer.render(scene,camera);
}

resize2D();
restoreSegmentsSetting();
updateAxisDistanceInfo(null);
resize3D();
updateCamera();
animate();
