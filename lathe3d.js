import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";
import { OBJExporter } from "https://unpkg.com/three@0.165.0/examples/jsm/exporters/OBJExporter.js?module";
import { GLTFExporter } from "https://unpkg.com/three@0.165.0/examples/jsm/exporters/GLTFExporter.js?module";

const drawCanvas = document.getElementById("drawCanvas");
const ctx = drawCanvas.getContext("2d");
const threeCanvas = document.getElementById("threeCanvas");
const exportScaleInput = document.getElementById("exportScaleInput");
const exportBtn = document.getElementById("exportBtn");
const exportGlbBtn = document.getElementById("exportGlbBtn");
const exportX90Btn = document.getElementById("exportX90Btn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const ptCount = document.getElementById("ptCount");
const modeBadge = document.getElementById("modeBadge");
const axisDistInfo = document.getElementById("axisDistInfo");
const compressSpacingBtn = document.getElementById("compressSpacingBtn");
const expandSpacingBtn = document.getElementById("expandSpacingBtn");
const undoBtn = document.getElementById("undoBtn");
const clearBtn = document.getElementById("clearBtn");
const importBtn = document.getElementById("importBtn");
const pasteBtn = document.getElementById("pasteBtn");
const importInput = document.getElementById("importInput");
const createBtn = document.getElementById("createBtn");
const rotateCcwBtn = document.getElementById("rotateCcwBtn");
const rotateCwBtn = document.getElementById("rotateCwBtn");
const moveNearAxisBtn = document.getElementById("moveNearAxisBtn");
const moveFarAxisBtn = document.getElementById("moveFarAxisBtn");
const rotateStepInput = document.getElementById("rotateStepInput");
const moveStepInput = document.getElementById("moveStepInput");
const segSlider = document.getElementById("segSlider");
const wireSlider = document.getElementById("wireSlider");
const segVal = document.getElementById("segVal");
const wireVal = document.getElementById("wireVal");
const SEGMENTS_STORAGE_KEY = "lathe3d.segments";

let points = [];
let dpr = Math.max(1, window.devicePixelRatio || 1);
let appliedScale = 1;
let viewScale2D = 1;
let viewOffsetX2D = 0;
let viewOffsetY2D = 0;
const selectedPointIndices = new Set();
let rangeAnchorIndex = null;
const undoStack = [];
const MAX_UNDO_STEPS = 100;

function isValidPoint(p){
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function clonePoint(p){
  return {x: p.x, y: p.y};
}

function getValidPoints(source = points){
  return source.filter(isValidPoint);
}

function getPointRuns(source = points){
  const runs = [];
  let current = [];

  for(const p of source){
    if(isValidPoint(p)){
      current.push(p);
    }else if(current.length){
      runs.push(current);
      current = [];
    }
  }

  if(current.length) runs.push(current);
  return runs;
}

function getLastValidPoint(source = points){
  for(let i = source.length - 1; i >= 0; i--){
    if(isValidPoint(source[i])) return source[i];
  }
  return null;
}

function normalizePointBreaks(source){
  const normalized = [];
  let lastWasBreak = true;

  for(const p of source){
    if(isValidPoint(p)){
      normalized.push(clonePoint(p));
      lastWasBreak = false;
    }else if(!lastWasBreak && normalized.length){
      normalized.push(null);
      lastWasBreak = true;
    }
  }

  while(normalized.length && !isValidPoint(normalized[normalized.length - 1])){
    normalized.pop();
  }

  return normalized;
}

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
function getHitPointIndex(point){
  const hitRadius = 8 / Math.max(0.3, viewScale2D);
  const hitRadiusSq = hitRadius * hitRadius;
  for(let i = points.length - 1; i >= 0; i--){
    if(!isValidPoint(points[i])) continue;
    const dx = point.x - points[i].x;
    const dy = point.y - points[i].y;
    if(dx * dx + dy * dy <= hitRadiusSq) return i;
  }
  return -1;
}
function selectPoint(index, additive){
  if(index < 0 || index >= points.length || !isValidPoint(points[index])) return;
  if(additive){
    if(selectedPointIndices.has(index)) selectedPointIndices.delete(index);
    else selectedPointIndices.add(index);
    return;
  }
  selectedPointIndices.clear();
  selectedPointIndices.add(index);
}
function selectRangeBetween(anchorIndex, endIndex){
  if(anchorIndex == null || endIndex < 0 || endIndex >= points.length) return;
  const start = Math.min(anchorIndex, endIndex);
  const end = Math.max(anchorIndex, endIndex);
  selectedPointIndices.clear();
  for(let i = start; i <= end; i++){
    if(isValidPoint(points[i])) selectedPointIndices.add(i);
  }
}
function clearSelection(){
  selectedPointIndices.clear();
}
function normalizeSelection(){
  for(const index of [...selectedPointIndices]){
    if(index < 0 || index >= points.length || !isValidPoint(points[index])) selectedPointIndices.delete(index);
  }
  if(rangeAnchorIndex != null && (rangeAnchorIndex < 0 || rangeAnchorIndex >= points.length)){
    rangeAnchorIndex = null;
  }
}
function captureStateSnapshot(){
  return {
    points: points.map(p => isValidPoint(p) ? clonePoint(p) : null),
    selected: [...selectedPointIndices]
  };
}
function pushUndoState(){
  undoStack.push(captureStateSnapshot());
  if(undoStack.length > MAX_UNDO_STEPS) undoStack.shift();
}
function restoreStateSnapshot(snapshot){
  points = snapshot.points.map(p => isValidPoint(p) ? clonePoint(p) : null);
  clearSelection();
  for(const idx of snapshot.selected){
    if(idx >= 0 && idx < points.length && isValidPoint(points[idx])) selectedPointIndices.add(idx);
  }
  rangeAnchorIndex = selectedPointIndices.size > 0 ? Math.min(...selectedPointIndices) : null;
  clearLathe();
  setDrawMode(false);
  updateAxisDistanceInfo(getLastValidPoint(points));
  draw();
}
function undoLastAction(){
  const snapshot = undoStack.pop();
  if(!snapshot) return false;
  restoreStateSnapshot(snapshot);
  return true;
}
function deleteSelectedPoints(){
  if(selectedPointIndices.size === 0) return false;
  pushUndoState();
  points = normalizePointBreaks(points.filter((_, idx) => !selectedPointIndices.has(idx)));
  clearSelection();
  rangeAnchorIndex = null;
  clearLathe();
  setDrawMode(false);
  updateAxisDistanceInfo(getLastValidPoint(points));
  draw();
  return true;
}
function updateAxisDistanceInfo(point){
  if(!axisDistInfo) return;
  const activePoint = isValidPoint(point) ? point : getLastValidPoint(points);
  if(!activePoint){
    axisDistInfo.textContent = "축거리: -";
    return;
  }
  const w = drawCanvas.width / dpr;
  const cx = w / 2;
  const dist = Math.abs(activePoint.x - cx);
  axisDistInfo.textContent = `축거리: ${dist.toFixed(1)} px`;
}
function updateAxisDistanceStatsSummary(){
  const validPoints = getValidPoints(points);
  if(!axisDistInfo || validPoints.length === 0){
    updateAxisDistanceInfo(null);
    return;
  }

  const w = drawCanvas.width / dpr;
  const cx = w / 2;
  const distances = validPoints.map(p => Math.abs(p.x - cx));
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
    for(const run of getPointRuns(points)){
      if(run.length === 0) continue;
      ctx.beginPath();
      run.forEach((p,i)=> i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
      ctx.stroke();
    }

    points.forEach((p, i) => {
      if(!isValidPoint(p)) return;
      ctx.beginPath();
      ctx.arc(p.x,p.y,3.7,0,Math.PI*2);
      ctx.fillStyle = selectedPointIndices.has(i) ? "#f59e0b" : "#38bdf8";
      ctx.fill();
      ctx.strokeStyle = selectedPointIndices.has(i) ? "#7c2d12" : "#082f49";
      ctx.stroke();
    });
  }
  ctx.restore();
  ptCount.textContent = `${getValidPoints(points).length} pts`;
}
function addPoint(p, insertIndex = null){
  const last = insertIndex == null ? getLastValidPoint(points) : points[Math.max(0, insertIndex - 1)];
  const minSpacing = 2 / Math.max(0.3, viewScale2D);
  if(!isValidPoint(last) || Math.hypot(p.x-last.x,p.y-last.y) > minSpacing){
    if(insertIndex == null){
      points.push(p);
      normalizeSelection();
      rangeAnchorIndex = null;
    }else{
      pushUndoState();
      const safeIndex = Math.max(0, Math.min(points.length, insertIndex));
      points.splice(safeIndex, 0, p);
      clearSelection();
      selectedPointIndices.add(safeIndex);
      rangeAnchorIndex = safeIndex;
    }
    updateAxisDistanceInfo(p);
    setDrawMode(false);
    draw();
  }
}

function extractImportPoints(data){
  if(!data || !Array.isArray(data.groups)) return [];
  const out = [];
  let wroteAnySegment = false;
  for(const group of data.groups){
    if(!group || !Array.isArray(group.segments)) continue;
    for(const seg of group.segments){
      if(!seg || !Array.isArray(seg.points)) continue;
      const segmentPoints = [];
      for(const p of seg.points){
        const x = Number(p?.x), y = Number(p?.y);
        if(Number.isFinite(x) && Number.isFinite(y)) segmentPoints.push({x,y});
      }
      if(segmentPoints.length){
        if(wroteAnySegment) out.push(null);
        out.push(...segmentPoints);
        wroteAnySegment = true;
      }
    }
  }
  return out;
}

function mapImportPoints(raw, data){
  const w = drawCanvas.width / dpr;
  const h = drawCanvas.height / dpr;
  const pad = 24;

  const validRaw = raw.filter(isValidPoint);
  const xs = validRaw.map(p=>p.x);
  const ys = validRaw.map(p=>p.y);
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

  return raw.map(p => isValidPoint(p) ? ({
    x: (p.x - minX) * scale + offX,
    y: (p.y - minY) * scale + offY
  }) : null);
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
  const validPoints = getValidPoints(points);
  if(validPoints.length < 2){
    flashWarn(direction > 0 ? rotateCcwBtn : rotateCwBtn);
    return;
  }

  const pivot = validPoints[Math.floor(validPoints.length / 2)];
  const angle = (getRotateStepDeg() * Math.PI / 180) * direction;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  points = points.map((p) => {
    if(!isValidPoint(p)) return null;
    const dx = p.x - pivot.x;
    const dy = p.y - pivot.y;
    return {
      x: pivot.x + dx * cosA - dy * sinA,
      y: pivot.y + dx * sinA + dy * cosA
    };
  });

  clearLathe();
  normalizeSelection();
  setDrawMode(false);
  updateAxisDistanceInfo(getLastValidPoint(points));
  draw();
}

function moveAllPoints(dx, dy){
  if(getValidPoints(points).length === 0) return;

  points = points.map(p => isValidPoint(p) ? ({
    x: p.x + dx,
    y: p.y + dy
  }) : null);

  clearLathe();
  normalizeSelection();
  setDrawMode(false);
  updateAxisDistanceInfo(getLastValidPoint(points));
  draw();
}

function scaleAllPointsFromAxis(scaleFactor, warnBtn){
  const validPoints = getValidPoints(points);
  if(validPoints.length === 0){
    if(warnBtn) flashWarn(warnBtn);
    return;
  }

  const anchor = validPoints[0];

  points = points.map(p => isValidPoint(p) ? ({
    x: anchor.x + (p.x - anchor.x) * scaleFactor,
    y: anchor.y + (p.y - anchor.y) * scaleFactor
  }) : null);

  clearLathe();
  normalizeSelection();
  setDrawMode(false);
  updateAxisDistanceInfo(getLastValidPoint(points));
  draw();
}

function adjustPointSpacing(scaleFactor, warnBtn){
  scaleAllPointsFromAxis(scaleFactor, warnBtn);
}

function importFromJsonData(data){
  const raw = extractImportPoints(data);
  if(raw.length === 0) return false;
  points = normalizePointBreaks(mapImportPoints(raw, data));
  clearSelection();
  rangeAnchorIndex = null;
  updateAxisDistanceInfo(getLastValidPoint(points));

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
  const point = getCanvasPoint(e);
  const hitIndex = getHitPointIndex(point);

  if(hitIndex >= 0){
    if(e.shiftKey){
      if(rangeAnchorIndex == null){
        rangeAnchorIndex = hitIndex;
        selectPoint(hitIndex, false);
      }else{
        selectRangeBetween(rangeAnchorIndex, hitIndex);
      }
    }else{
      rangeAnchorIndex = hitIndex;
      selectPoint(hitIndex, false);
    }
    setDrawMode(false);
    draw();
    return;
  }

  if(selectedPointIndices.size > 0){
    const anchorIndex = rangeAnchorIndex != null
      ? rangeAnchorIndex
      : Math.min(...selectedPointIndices);

    if(anchorIndex === 0){
      // If point A is index 0, prepend as the new first point.
      addPoint(point, 0);
    }else if(anchorIndex === points.length - 1){
      addPoint(point, points.length);
    }
  }else{
    clearSelection();
    rangeAnchorIndex = null;
    addPoint(point);
  }
});
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
  if(undoLastAction()) return;
  points.pop();
  normalizeSelection();
  updateAxisDistanceInfo(getLastValidPoint(points));
  setDrawMode(false);
  draw();
};
clearBtn.onclick = () => {
  points = [];
  clearSelection();
  rangeAnchorIndex = null;
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
moveNearAxisBtn.onclick = () => scaleAllPointsFromAxis(0.9, moveNearAxisBtn);
moveFarAxisBtn.onclick = () => scaleAllPointsFromAxis(1.1, moveFarAxisBtn);
compressSpacingBtn.onclick = () => adjustPointSpacing(0.8, compressSpacingBtn);
expandSpacingBtn.onclick = () => adjustPointSpacing(1.2, expandSpacingBtn);
zoomOutBtn.onclick = () => set2DViewScale(viewScale2D / 1.2);
zoomInBtn.onclick = () => set2DViewScale(viewScale2D * 1.2);

window.addEventListener("keydown", e => {
  const target = e.target;
  const isEditable = target instanceof HTMLElement && (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
  if(isEditable) return;

  const key = e.key.toLowerCase();
  const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && key === "z";
  if(isUndo){
    e.preventDefault();
    if(undoLastAction()) return;
    points.pop();
    normalizeSelection();
    updateAxisDistanceInfo(getLastValidPoint(points));
    setDrawMode(false);
    draw();
    return;
  }

  if(e.key === "Delete"){
    e.preventDefault();
    deleteSelectedPoints();
    return;
  }

  if(
    e.ctrlKey || e.metaKey || e.altKey
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
function disposeObject3D(root, disposeMaterials = true){
  root.traverse(obj => {
    obj.geometry?.dispose();
    if(!disposeMaterials) return;
    if(Array.isArray(obj.material)){
      obj.material.forEach(material => material?.dispose?.());
    }else{
      obj.material?.dispose?.();
    }
  });
}
function clearLathe(){
  for(const o of [mesh,wire]){
    if(!o) continue;
    scene.remove(o);
    disposeObject3D(o, o !== wire);
  }
  if(wireMat) wireMat.dispose();
  mesh = wire = wireMat = null;
}
function makeLathe(){
  const runs = getPointRuns(points).filter(run => run.length >= 3);
  if(runs.length === 0){
    createBtn.classList.add("warn");
    setTimeout(()=>createBtn.classList.remove("warn"),450);
    return;
  }

  clearLathe();

  const validPoints = getValidPoints(points);
  const w = drawCanvas.width / dpr, h = drawCanvas.height / dpr;
  const cx = w / 2;
  const minY = Math.min(...validPoints.map(p=>p.y));
  const maxY = Math.max(...validPoints.map(p=>p.y));
  const ySpan = Math.max(1, maxY - minY);
  const worldUnitsPerPixel = 3.2 / Math.max(1, h);
  mesh = new THREE.Group();
  wire = new THREE.Group();
  wireMat = new THREE.LineBasicMaterial({
    color:0xffffff, transparent:true, opacity:+wireSlider.value/100, depthTest:true
  });

  const colorA = new THREE.Color("#38bdf8");
  const colorB = new THREE.Color("#a78bfa");
  const colorC = new THREE.Color("#f472b6");

  for(const run of runs){
    const profile = run.map(p => {
      const r = Math.max(0.015, Math.abs(p.x - cx) * worldUnitsPerPixel);
      const y = (0.5 - (p.y - minY) / ySpan) * 3.2;
      return new THREE.Vector2(r,y);
    });

    const geo = new THREE.LatheGeometry(profile, +segSlider.value);
    geo.computeVertexNormals();

    const pos = geo.attributes.position;
    const colors = [];
    let ymin=Infinity,ymax=-Infinity;
    for(let i=0;i<pos.count;i++){
      const y = pos.getY(i);
      ymin = Math.min(ymin, y);
      ymax = Math.max(ymax, y);
    }
    for(let i=0;i<pos.count;i++){
      const t = (pos.getY(i)-ymin) / Math.max(.0001,ymax-ymin);
      const c = t < .5 ? colorA.clone().lerp(colorB,t*2) : colorB.clone().lerp(colorC,(t-.5)*2);
      colors.push(c.r,c.g,c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors,3));

    const mat = new THREE.MeshStandardMaterial({
      roughness:.42, metalness:.18, vertexColors:true, side:THREE.DoubleSide
    });
    const solid = new THREE.Mesh(geo,mat);
    mesh.add(solid);

    const wireGeo = new THREE.WireframeGeometry(geo);
    const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    wire.add(wireMesh);
  }

  scene.add(wire);
  scene.add(mesh);

  applyScaleToCurrentModel();

  updateAxisDistanceStatsSummary();
  setDrawMode(true);
}
createBtn.onclick = makeLathe;

const objExporter = new OBJExporter();
const glbExporter = new GLTFExporter();
function exportObj(rotateX90=false){
  if(!mesh){
    flashWarn(rotateX90 ? exportX90Btn : exportBtn);
    return;
  }

  // Export identity-transformed geometry so preview auto-rotation is not baked in.
  const temp = mesh.clone(true);
  temp.scale.setScalar(appliedScale);
  if(rotateX90){
    temp.rotateX(Math.PI / 2);
  }
  const objText = objExporter.parse(temp);
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

function exportGlb(){
  if(!mesh){
    flashWarn(exportGlbBtn);
    return;
  }

  // Export identity-transformed geometry so preview auto-rotation is not baked in.
  const temp = mesh.clone(true);
  temp.scale.setScalar(appliedScale);

  glbExporter.parse(
    temp,
    glbData => {
      const blob = new Blob([glbData], {type:"model/gltf-binary"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lathe_model.glb";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    err => {
      console.error("Export GLB failed:", err);
      flashWarn(exportGlbBtn);
    },
    {binary:true}
  );
}
exportBtn.onclick = () => exportObj(false);
exportGlbBtn.onclick = () => exportGlb();
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
