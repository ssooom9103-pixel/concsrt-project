import * as THREE from "https://esm.sh/three@0.160.0";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, set, onValue, onDisconnect, remove,
  runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ============ 1. 설정 ============ */
const firebaseConfig = {
  apiKey: "AIzaSyArv_07-3kHI0EXRWZ3kWNWfUxMonwi6-M",
  authDomain: "lucy-concert-play-project.firebaseapp.com",
  databaseURL: "https://lucy-concert-play-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lucy-concert-play-project",
  storageBucket: "lucy-concert-play-project.firebasestorage.app",
  messagingSenderId: "373254483778",
  appId: "1:373254483778:web:55794f78f77ce62e5c22db"
};
const VIDEO_ID = "2-P-NIiLiQc";
const ROOM = "main";
const SHOW_DEBUG = true;
const SHOW_BAND_DUMMY = true;
const BAND = [
  { x: -3.9, color: 0xffffff }, { x: -1.3, color: 0xffffff },
  { x: 1.3, color: 0xffffff }, { x: 3.9, color: 0xffffff },
];
const WALK_SPEED = 0.18, RUN_SPEED = 0.36;

/* ============ 2. 공연장 치수 ============ */
const R_FLOOR = 64, ROWS = 16, R_STAND_OUT = 90, ROW_H = 0.55;
const R_WALL = 90.4, WALL_H = 22, DOME_H = 20;
const GATE = 0.06, STEP_UP = 0.6, BACK_HALF = 56;
const STEP_R = (R_STAND_OUT - R_FLOOR) / ROWS;
const MAIN = { cx: 0, cz: -54, hw: 40, hd: 10, top: 3.2 };
const RUNWAY = { cx: 0, cz: -27, hw: 4, hd: 17, top: 3.0 };
const TBAR = { cx: 0, cz: -7, hw: 38, hd: 3, top: 3.0 };
const PLATFORMS = [MAIN, RUNWAY, TBAR];
const SCREEN_W = 37, SCREEN_H = SCREEN_W * 9 / 16;
const SCREEN_POS = [0, MAIN.top + 0.6 + SCREEN_H / 2, -64.3];
const VID_PX_W = 960, VID_PX_H = 540;

const $ = (id) => document.getElementById(id);
const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const hexOf = (s, d) => new THREE.Color(s || d).getHex();
function toast(msg) {
  const d = document.createElement("div");
  d.textContent = msg;
  d.style.cssText = "position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:60;background:rgba(0,0,0,.78);color:#fff;font:600 14px sans-serif;padding:8px 14px;border-radius:10px;";
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3500);
}

/* ============ 3. Firebase (익명 로그인) ============ */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
let timeOffset = 0;
onValue(ref(db, ".info/serverTimeOffset"), (s) => { timeOffset = s.val() || 0; });
const serverNow = () => Date.now() + timeOffset;
const videoRef = ref(db, `rooms/${ROOM}/video`);
const playersRef = ref(db, `rooms/${ROOM}/players`);
let myId = null, myRef = null;
const ready = signInAnonymously(auth).then((cred) => {
  myId = cred.user.uid;
  myRef = ref(db, `rooms/${ROOM}/players/${myId}`);
});
ready.catch(() => {});

/* ============ 4. Three.js 기본 ============ */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
const canvas = renderer.domElement;
canvas.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;z-index:1;touch-action:none;";
document.body.appendChild(canvas);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 700);
camera.rotation.order = "YXZ";

/* 영상 레이어 (WebGL 뒤) */
const layer = document.createElement("div");
layer.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;z-index:0;overflow:hidden;pointer-events:none;";
document.body.appendChild(layer);
const videoBox = document.createElement("div");
videoBox.style.cssText =
  `position:absolute;left:0;top:0;width:${VID_PX_W}px;height:${VID_PX_H}px;background:#000;` +
  "transform-origin:0 0;overflow:hidden;visibility:hidden;";
const holder = document.createElement("div");
holder.style.cssText = `position:absolute;left:0;top:0;width:${VID_PX_W}px;height:${VID_PX_H}px;`;
const ytDiv = document.createElement("div");
ytDiv.id = "ytplayer";
holder.appendChild(ytDiv);
videoBox.appendChild(holder);
layer.appendChild(videoBox);

function mat(c) { return new THREE.MeshBasicMaterial({ color: c }); }
function box(cx, cy, cz, w, h, d, c) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  m.position.set(cx, cy, cz); scene.add(m); return m;
}

/* 바닥 (실내는 어둡게) */
{
  const g1 = new THREE.Mesh(new THREE.CircleGeometry(190, 64), mat(0xcfe3bd));
  g1.rotation.x = -Math.PI / 2; g1.position.y = -0.02; scene.add(g1);
  const g2 = new THREE.Mesh(new THREE.CircleGeometry(R_WALL, 64), mat(0x50535b));
  g2.rotation.x = -Math.PI / 2; g2.position.y = 0; scene.add(g2);
  const g3 = new THREE.Mesh(new THREE.CircleGeometry(R_FLOOR, 64), mat(0x3f424a));
  g3.rotation.x = -Math.PI / 2; g3.position.y = 0.02; scene.add(g3);
}

/* 관객석 */
function standExists(th) {
  const a = Math.abs(th);
  return !(a < GATE + 0.03 || a > Math.PI - 0.75);
}
const SEG_N = 360, SEG_D = (2 * Math.PI) / SEG_N;
function segTheta(th) {
  const k = Math.min(SEG_N - 1, Math.max(0, Math.floor((th + Math.PI) / SEG_D)));
  return -Math.PI + (k + 0.5) * SEG_D;
}
{
  const pos = [], col = [];
  const P = (r, th, y) => [r * Math.sin(th), y, r * Math.cos(th)];
  const quad = (a, b, c, d, color) => {
    for (const p of [a, b, c, a, c, d]) { pos.push(...p); col.push(color[0], color[1], color[2]); }
  };
  const tread = new THREE.Color(0xa8841a), tread2 = new THREE.Color(0x967418), riser = new THREE.Color(0x5e4a0e);
  for (let i = 0; i < ROWS; i++) {
    const r0 = R_FLOOR + i * STEP_R, r1 = r0 + STEP_R, h = (i + 1) * ROW_H;
    for (let k = 0; k < SEG_N; k++) {
      const a0 = -Math.PI + k * SEG_D, a1 = a0 + SEG_D;
      if (!standExists(a0 + SEG_D / 2)) continue;
      const tc = (k % 4 === 0) ? tread2 : tread;
      quad(P(r0, a0, h), P(r1, a0, h), P(r1, a1, h), P(r0, a1, h), [tc.r, tc.g, tc.b]);
      quad(P(r0, a0, h - ROW_H), P(r0, a1, h - ROW_H), P(r0, a1, h), P(r0, a0, h), [riser.r, riser.g, riser.b]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
}

/* 벽 + 돔 (바깥은 밝게, 안쪽은 어둡게) + 핀 */
{
  const wallGeo = (r) => new THREE.CylinderGeometry(r, r, WALL_H, 96, 1, true, GATE, 2 * Math.PI - 2 * GATE);
  const wallOut = new THREE.Mesh(wallGeo(R_WALL), new THREE.MeshBasicMaterial({ color: 0xe8eef5, side: THREE.FrontSide }));
  wallOut.position.y = WALL_H / 2; scene.add(wallOut);
  const wallIn = new THREE.Mesh(wallGeo(R_WALL - 0.15), new THREE.MeshBasicMaterial({ color: 0x23262d, side: THREE.BackSide }));
  wallIn.position.y = WALL_H / 2; scene.add(wallIn);

  const domeGeo = (r) => new THREE.SphereGeometry(r, 64, 24, 0, 2 * Math.PI, 0, Math.PI / 2);
  const domeOut = new THREE.Mesh(domeGeo(R_WALL), new THREE.MeshBasicMaterial({ color: 0xf3f6fa, side: THREE.FrontSide }));
  domeOut.scale.y = DOME_H / R_WALL; domeOut.position.y = WALL_H; scene.add(domeOut);
  const domeIn = new THREE.Mesh(domeGeo(R_WALL - 0.15), new THREE.MeshBasicMaterial({ color: 0x1b1d23, side: THREE.BackSide }));
  domeIn.scale.y = DOME_H / R_WALL; domeIn.position.y = WALL_H; scene.add(domeIn);

  const N = 72;
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, WALL_H, 0.8), mat(0xcfd6de), N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let n = 0;
  for (let i = 0; i < N; i++) {
    const th = -Math.PI + (i + 0.5) * (2 * Math.PI / N);
    if (Math.abs(th) < GATE + 0.05) continue;
    e.set(0, th, 0); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(Math.sin(th) * (R_WALL + 0.6), WALL_H / 2, Math.cos(th) * (R_WALL + 0.6)), q, new THREE.Vector3(1, 1, 1));
    fins.setMatrixAt(n++, m4);
  }
  fins.count = n; scene.add(fins);
}

/* 무대 / 런웨이 / T바 + 회색 펜스(보이는 용) */
for (const p of PLATFORMS) {
  box(p.cx, p.top / 2, p.cz, p.hw * 2, p.top, p.hd * 2, 0x1c1d22);
  box(p.cx, p.top + 0.02, p.cz, p.hw * 2 - 0.3, 0.05, p.hd * 2 - 0.3, 0x30333b);
  const m = 0.8, fh = 1.1, c = 0x7d838b;
  box(p.cx, fh / 2, p.cz - p.hd - m, p.hw * 2 + m * 2, fh, 0.12, c);
  box(p.cx, fh / 2, p.cz + p.hd + m, p.hw * 2 + m * 2, fh, 0.12, c);
  box(p.cx - p.hw - m, fh / 2, p.cz, 0.12, fh, p.hd * 2 + m * 2, c);
  box(p.cx + p.hw + m, fh / 2, p.cz, 0.12, fh, p.hd * 2 + m * 2, c);
}
/* 트러스 */
for (const z of [-62, -56, -50, -46]) box(0, 32.5, z, 80, 1, 1, 0x5b6068);
for (const x of [-38, -19, 0, 19, 38]) box(x, 34, -54, 1, 1, 20, 0x5b6068);

/* 스크린 */
const screenDark = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W + 0.6, SCREEN_H + 0.6), mat(0x050505));
screenDark.position.set(SCREEN_POS[0], SCREEN_POS[1], SCREEN_POS[2] - 0.05);
scene.add(screenDark);
{
  const pw = 16;
  for (const s of [-1, 1]) {
    box(s * (SCREEN_W / 2 + 0.3 + pw / 2), SCREEN_POS[1], SCREEN_POS[2] - 0.05, pw, SCREEN_H + 0.6, 0.4, 0x0b0b0e);
  }
}
const hole = new THREE.Mesh(
  new THREE.PlaneGeometry(SCREEN_W, SCREEN_H),
  new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, transparent: true, blending: THREE.NoBlending }));
hole.position.set(SCREEN_POS[0], SCREEN_POS[1], SCREEN_POS[2] + 0.02);
scene.add(hole);

/* ============ 5. 영상: 2D 투영(호모그래피) ============ */
const _c = [
  new THREE.Vector3(-SCREEN_W / 2, SCREEN_H / 2, 0.05),
  new THREE.Vector3(SCREEN_W / 2, SCREEN_H / 2, 0.05),
  new THREE.Vector3(SCREEN_W / 2, -SCREEN_H / 2, 0.05),
  new THREE.Vector3(-SCREEN_W / 2, -SCREEN_H / 2, 0.05),
].map((v) => v.add(new THREE.Vector3(SCREEN_POS[0], SCREEN_POS[1], SCREEN_POS[2])));
let _shown = null;
function updateVideoQuad() {
  camera.updateMatrixWorld();
  const W = innerWidth, H = innerHeight;
  const P = [];
  let ok = true, allL = true, allR = true, allT = true, allB = true;
  for (const c of _c) {
    const v = c.clone().applyMatrix4(camera.matrixWorldInverse);
    if (-v.z < 0.3) { ok = false; break; }
    v.applyMatrix4(camera.projectionMatrix);
    const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
    P.push([x, y]);
    if (x > 0) allL = false; if (x < W) allR = false;
    if (y > 0) allT = false; if (y < H) allB = false;
  }
  if (ok && (allL || allR || allT || allB)) ok = false;
  if (!ok) {
    if (_shown !== false) { videoBox.style.visibility = "hidden"; hole.visible = false; _shown = false; }
    return;
  }
  const [p0, p1, p2, p3] = P;
  const dx1 = p1[0] - p2[0], dx2 = p3[0] - p2[0], dx3 = p0[0] - p1[0] + p2[0] - p3[0];
  const dy1 = p1[1] - p2[1], dy2 = p3[1] - p2[1], dy3 = p0[1] - p1[1] + p2[1] - p3[1];
  const den = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(den) < 1e-6) return;
  const g = (dx3 * dy2 - dy3 * dx2) / den;
  const h = (dx1 * dy3 - dy1 * dx3) / den;
  const a = p1[0] - p0[0] + g * p1[0], b = p3[0] - p0[0] + h * p3[0];
  const d = p1[1] - p0[1] + g * p1[1], e = p3[1] - p0[1] + h * p3[1];
  const w = VID_PX_W, hh = VID_PX_H;
  videoBox.style.transform =
    `matrix3d(${a / w},${d / w},0,${g / w},${b / hh},${e / hh},0,${h / hh},0,0,1,0,${p0[0]},${p0[1]},0,1)`;
  if (_shown !== true) { videoBox.style.visibility = "visible"; hole.visible = true; _shown = true; }
}

/* ============ 6. 유튜브 + 동기화 ============ */
let yt = null, ytReady = false, videoStart = null, inGame = false;
let ctl = false, ctlTimer = null;
window.onYouTubeIframeAPIReady = () => {
  yt = new YT.Player("ytplayer", {
    width: VID_PX_W, height: VID_PX_H, videoId: VIDEO_ID,
    playerVars: { controls: 0, disablekb: 1, cc_load_policy: 0, fs: 0, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3 },
    events: {
      onReady: () => { ytReady = true; try { yt.unloadModule("captions"); } catch (e) {} if (inGame) syncVideo(); },
      onStateChange: (ev) => {
        try { yt.unloadModule("captions"); } catch (e) {}
        if (!inGame) return;
        if (ev.data === 0) syncVideo();
        if (ev.data === 2 && !ctl) setTimeout(() => { if (inGame && !ctl) try { yt.playVideo(); } catch (e) {} }, 300);
      },
    },
  });
};
{ const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s); }

async function ensureVideoStart() {
  const res = await runTransaction(videoRef, (cur) => {
    if (cur && cur.id === VIDEO_ID && cur.startAt) return cur;
    return { id: VIDEO_ID, startAt: serverNow() };
  });
  videoStart = res.snapshot.val().startAt;
}
function expectedPos() {
  const dur = yt.getDuration();
  if (!dur) return null;
  return (((serverNow() - videoStart) / 1000) % dur + dur) % dur;
}
function syncVideo() {
  if (!ytReady || videoStart == null) return;
  const p = expectedPos();
  if (p == null) return;
  try { yt.seekTo(p, true); yt.playVideo(); } catch (e) {}
}
setInterval(() => {
  if (!inGame || !ytReady || videoStart == null || ctl) return;
  try {
    const st = yt.getPlayerState(), p = expectedPos();
    if (p == null) return;
    if (st === 1) { if (Math.abs(yt.getCurrentTime() - p) > 3) syncVideo(); }
  } catch (e) {}
}, 10000);
setInterval(() => {
  if (!inGame || !ytReady || videoStart == null || ctl) return;
  try { const st = yt.getPlayerState(); if ([-1, 0, 2, 5].includes(st)) syncVideo(); } catch (e) {}
}, 2000);

/* 화면 조작 모드 */
function setCtl(on) {
  ctl = on;
  canvas.style.pointerEvents = on ? "none" : "auto";
  layer.style.pointerEvents = on ? "auto" : "none";
  $("ctlBtn").textContent = on ? "화면 조작 ON" : "화면 조작 OFF";
  clearTimeout(ctlTimer);
  if (on) ctlTimer = setTimeout(() => setCtl(false), 60000);
  else syncVideo();
}
$("ctlBtn").addEventListener("click", () => setCtl(!ctl));
$("syncBtn").addEventListener("click", () => syncVideo());

/* 디버그 */
let dbg = null;
if (SHOW_DEBUG) {
  dbg = document.createElement("div");
  dbg.style.cssText = "position:fixed;left:8px;bottom:6px;z-index:25;font:11px sans-serif;color:#fff;background:rgba(0,0,0,.45);padding:2px 6px;border-radius:6px;pointer-events:none;";
  document.body.appendChild(dbg);
  setInterval(() => {
    let st = "-", diff = "-";
    try {
      if (ytReady) { st = yt.getPlayerState(); const p = videoStart == null ? null : expectedPos(); if (p != null) diff = (yt.getCurrentTime() - p).toFixed(1); }
    } catch (e) {}
    dbg.textContent = `영상 ${_shown ? "표시" : "숨김(뒤쪽)"} | 상태 ${st} | 차이 ${diff}`;
  }, 500);
}

/* ============ 7. 아바타 (마시멜로형: 머리+몸이 하나로 이어진 둥근 몸) ============ */
const EMOTE_DUR = { clap: 3, wave: 2.5, cheer: 2.5 };
const FACES = ["😊", "^ ^", "😮", "😴", "ω", "😉"];
const HAIRS = ["짧은", "단발", "긴머리", "포니", "양갈래", "똥머리"];
const SHIRT_COLORS = ["#ffffff", "#ff6b6b", "#ff9f1c", "#ffd93d", "#6bcb77", "#4ecdc4", "#4d96ff", "#c77dff", "#ff8fc7", "#3a3f4b"];
const HAIR_COLORS = ["#222222", "#4a3426", "#8a5a3b", "#e0b04a", "#f0e6c8", "#c8453b", "#ff8fc7", "#9b6bd6", "#4d7fd6", "#4ecdc4"];
const BODY = { cy: 0.95, rx: 0.6, ry: 0.72, rz: 0.55 };   /* 둥근 몸(타원체) 크기 */
const LINE_M = new THREE.MeshBasicMaterial({ color: 0x4a4048, side: THREE.BackSide });
const ARM_X = 0.56, ARM_Y = 0.95, LEG_X = 0.2, LEG_Y = 0.3;

function makeLabel(text) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64;
  const x = c.getContext("2d");
  x.fillStyle = "rgba(0,0,0,0.55)";
  x.beginPath(); if (x.roundRect) x.roundRect(4, 8, 248, 48, 20); else x.rect(4, 8, 248, 48); x.fill();
  x.fillStyle = "#fff"; x.font = "bold 30px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(text, 128, 33, 230);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  sp.scale.set(2.4, 0.6, 1); sp.position.y = 2.5;
  return sp;
}

/* o = { shirt, hair, face, blush, hs }  (색은 숫자 hex) */
function makeAvatar(name, o) {
  const g = new THREE.Group(), rig = new THREE.Group();
  g.add(rig);
  const B = BODY;
  const white = mat(0xffffff), shirtM = mat(o.shirt), black = mat(0x2a2a30), blushM = mat(0xff9aa8), tieM = mat(0xe05050);
  const hairM = new THREE.MeshBasicMaterial({ color: o.hair, side: THREE.DoubleSide });
  const add = (geo, m, x, y, z, parent = rig) => {
    const o3 = new THREE.Mesh(geo, m); o3.position.set(x, y, z); parent.add(o3); return o3;
  };
  const outlined = (geo, m, x, y, z, parent, k) => {
    const o3 = add(geo, m, x, y, z, parent);
    const ol = new THREE.Mesh(geo, LINE_M); ol.scale.setScalar(k); o3.add(ol);
    return o3;
  };
  /* 몸 타원체의 일부(껍질). k=크기 배율, thS/thL=위에서부터 각도, phS/phL=둘레 각도 */
  const shell = (k, thS, thL, phS, phL, m) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20, phS, phL, thS, thL), m);
    s.scale.set(B.rx * k, B.ry * k, B.rz * k);
    s.position.set(0, B.cy, 0);
    rig.add(s); return s;
  };
  const FULL = 2 * Math.PI;

  /* 몸 + 윤곽선 + 티셔츠(아래쪽을 덮음) */
  shell(1, 0, Math.PI, 0, FULL, white);
  shell(1.045, 0, Math.PI, 0, FULL, LINE_M);
  shell(1.012, 1.78, Math.PI - 1.78, 0, FULL, shirtM);

  /* 얼굴: 몸 앞면(-z)의 곡면에 맞춰 붙임. dy = 몸 중심 기준 높이 */
  const fz = (x, dy) => {
    const t = 1 - (x / B.rx) * (x / B.rx) - (dy / B.ry) * (dy / B.ry);
    return -B.rz * Math.sqrt(Math.max(0.02, t)) - 0.004;
  };
  const dot = (x, dy, r) => {
    const d = add(new THREE.SphereGeometry(r, 10, 8), black, x, B.cy + dy, fz(x, dy)); d.scale.z = 0.35; return d;
  };
  const arc = (x, dy, r, smile) => {
    const t = add(new THREE.TorusGeometry(r, 0.013, 6, 14, Math.PI), black, x, B.cy + dy, fz(x, dy));
    if (smile) t.rotation.z = Math.PI;
    return t;
  };
  const bar = (x, dy, w) => add(new THREE.BoxGeometry(w, 0.016, 0.012), black, x, B.cy + dy, fz(x, dy));
  const EX = 0.17, EY = 0.2;
  const f = o.face | 0;
  if (f === 0) { dot(-EX, EY, 0.05); dot(EX, EY, 0.05); arc(0, 0.13, 0.07, true); }
  else if (f === 1) { arc(-EX, EY - 0.01, 0.055, false); arc(EX, EY - 0.01, 0.055, false); arc(0, 0.13, 0.07, true); }
  else if (f === 2) { dot(-EX, EY, 0.06); dot(EX, EY, 0.06); dot(0, 0.06, 0.04); }
  else if (f === 3) { bar(-EX, EY, 0.12); bar(EX, EY, 0.12); bar(0, 0.07, 0.06); }
  else if (f === 4) { dot(-EX, EY, 0.05); dot(EX, EY, 0.05); arc(-0.04, 0.115, 0.04, true); arc(0.04, 0.115, 0.04, true); }
  else { dot(-EX, EY, 0.05); arc(EX, EY - 0.01, 0.055, false); arc(0, 0.13, 0.07, true); }
  if (o.blush) {
    for (const s of [-1, 1]) {
      const b = add(new THREE.SphereGeometry(0.07, 10, 8), blushM, s * 0.34, B.cy + 0.09, fz(s * 0.34, 0.09));
      b.scale.set(1.3, 0.75, 0.3);
    }
  }

  /* 머리카락: 몸 윗부분의 곡면을 따라 덮음 */
  const FRONT = 1.5 * Math.PI;                                  /* 얼굴 쪽 방향 */
  const top = (th) => shell(1.035, 0, th, 0, FULL, hairM);       /* 정수리 덮개 */
  const sideBack = (k, th, gap) => shell(k, 0, th, FRONT + gap / 2, FULL - gap, hairM);  /* 옆/뒤 (앞은 비움) */
  const hs = o.hs | 0;
  if (hs === 0) {                                               /* 짧은 머리 */
    top(0.95); sideBack(1.035, 1.25, 2.6);
    const t = add(new THREE.CapsuleGeometry(0.03, 0.14, 4, 8), hairM, 0.02, 1.76, -0.06); t.rotation.z = 0.45;
  } else if (hs === 1) {                                        /* 단발 + 앞머리 */
    top(1.0);
    shell(1.045, 0, 1.15, FRONT - 0.85, 1.7, hairM);
    sideBack(1.06, 1.8, 1.9);
  } else if (hs === 2) {                                        /* 푼 긴 머리 */
    top(1.0); sideBack(1.07, 2.5, 1.9);
  } else if (hs === 3) {                                        /* 포니테일 */
    top(1.0); sideBack(1.04, 1.45, 2.3);
    add(new THREE.SphereGeometry(0.07, 10, 8), tieM, 0, 1.5, 0.4);
    const tail = add(new THREE.CapsuleGeometry(0.11, 0.5, 4, 10), hairM, 0, 1.18, 0.57);
    tail.rotation.x = -0.5;
  } else if (hs === 4) {                                        /* 양갈래 */
    top(1.0); sideBack(1.04, 1.45, 2.3);
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(0.065, 10, 8), tieM, s * 0.47, 1.42, 0.12);
      const t = add(new THREE.CapsuleGeometry(0.1, 0.3, 4, 10), hairM, s * 0.544, 1.18, 0.12);
      t.rotation.z = s * 0.3;
    }
  } else {                                                      /* 똥머리 */
    top(1.0); sideBack(1.04, 1.45, 2.3);
    const bun = add(new THREE.SphereGeometry(0.2, 14, 10), hairM, 0, 1.86, 0.04);
    bun.scale.set(1, 0.9, 1);
  }

  /* 팔 / 다리: 작고 통통하게 몸 가장자리에 바로 붙음 (어깨/엉덩이 축이 몸 안쪽 표면에 있음) */
  const mk = (x, y, r, len) => {
    const p = new THREE.Group(); p.position.set(x, y, 0); rig.add(p);
    outlined(new THREE.CapsuleGeometry(r, len, 4, 10), white, 0, -(len / 2 + r), 0, p, 1.25);
    return p;
  };
  g.userData = {
    rig,
    armL: mk(-ARM_X, ARM_Y, 0.08, 0.18), armR: mk(ARM_X, ARM_Y, 0.08, 0.18),
    legL: mk(-LEG_X, LEG_Y, 0.11, 0.08), legR: mk(LEG_X, LEG_Y, 0.11, 0.08),
  };
  if (name) g.add(makeLabel(name));
  return g;
}
function animateAvatar(g, t, speed, emote, et, run) {
  const u = g.userData;
  u.rig.position.y = 0; u.rig.rotation.z = 0;
  u.armL.position.set(-ARM_X, ARM_Y, 0); u.armR.position.set(ARM_X, ARM_Y, 0);
  u.armL.rotation.set(0, 0, -0.45); u.armR.rotation.set(0, 0, 0.45);   /* 팔은 살짝 바깥으로 */
  u.legL.rotation.x = 0; u.legR.rotation.x = 0;
  const ep = (serverNow() - et) / 1000;
  if (emote && EMOTE_DUR[emote] && ep >= 0 && ep < EMOTE_DUR[emote]) {
    if (emote === "clap") {
      const ph = (Math.sin(ep * 14) + 1) / 2;
      u.armL.position.set(-(0.08 + 0.14 * ph), ARM_Y, -0.45);
      u.armR.position.set(0.08 + 0.14 * ph, ARM_Y, -0.45);
      u.armL.rotation.set(Math.PI * 0.5, 0, 0); u.armR.rotation.set(Math.PI * 0.5, 0, 0);
    } else if (emote === "wave") {
      u.armR.rotation.set(Math.PI * 0.95, 0, 0.5 + Math.sin(ep * 10) * 0.4);
    } else {
      u.armL.rotation.x = u.armR.rotation.x = Math.PI * 0.95 + Math.sin(ep * 12) * 0.2;
      u.rig.position.y = Math.abs(Math.sin(ep * 8)) * 0.25;
    }
    return;
  }
  const amp = Math.min(1, speed / 0.1) * (run ? 0.9 : 0.6);
  const w = Math.sin(t * (run ? 14 : 9));
  const s = w * amp;
  u.legL.rotation.x = s; u.legR.rotation.x = -s;
  u.armL.rotation.x = -s; u.armR.rotation.x = s;
  u.rig.rotation.z = w * 0.05 * amp;                 /* 뒤뚱뒤뚱 */
  u.rig.position.y = Math.abs(w) * 0.04 * amp;
}

/* 밴드 더미 */
if (SHOW_BAND_DUMMY) {
  for (const b of BAND) {
    const a = makeAvatar("", { shirt: b.color, hair: 0x222222, face: 0, blush: false, hs: 0 });
    a.position.set(b.x, MAIN.top, MAIN.cz + 2); a.rotation.y = Math.PI; scene.add(a);
  }
}

/* ============ 8. 충돌 / 높이 ============ */
function inPlatform(x, z, m) {
  for (const p of PLATFORMS)
    if (Math.abs(x - p.cx) < p.hw + m && Math.abs(z - p.cz) < p.hd + m) return true;
  return false;
}
function blocked(x, z) {
  const r = Math.hypot(x, z);
  if (r > 190) return true;
  const th = Math.atan2(x, z);
  if (Math.abs(r - R_WALL - 0.2) < 0.7 && Math.abs(th) >= GATE) return true;
  if (inPlatform(x, z, 0.8)) return true;
  if (z < -BACK_HALF && Math.abs(x) < 46) return true;
  return false;
}
function heightAt(x, z) {
  const r = Math.hypot(x, z);
  if (r < R_FLOOR || r >= R_STAND_OUT) return 0;
  if (!standExists(segTheta(Math.atan2(x, z)))) return 0;
  return Math.min(ROWS, Math.floor((r - R_FLOOR) / STEP_R) + 1) * ROW_H;
}

/* ============ 9. 플레이어 상태 / 입력 ============ */
const me = { x: 0, y: 0, z: 128, vy: 0, ry: 0, speed: 0, onGround: true };
let yaw = 0, pitch = 0, firstPerson = false, running = false;
let myName = "", myEm = "", myEt = 0;
const JUMP_POWER = 0.23, GRAV = 0.01;
const avatar = { g: null };

/* 꾸미기 값 (face 0~5, hs 머리모양 0~5, blush 볼터치) */
const cust = { shirt: "#ffffff", hair: "#4a3426", face: 0, hs: 0, blush: false };
try {
  const s = JSON.parse(localStorage.getItem("lucyCust2") || "null");
  if (s) {
    if (SHIRT_COLORS.includes(s.shirt)) cust.shirt = s.shirt;
    if (HAIR_COLORS.includes(s.hair)) cust.hair = s.hair;
    if (Number.isInteger(s.face) && s.face >= 0 && s.face < FACES.length) cust.face = s.face;
    if (Number.isInteger(s.hs) && s.hs >= 0 && s.hs < HAIRS.length) cust.hs = s.hs;
    cust.blush = !!s.blush;
  }
} catch (e) {}
const saveCust = () => { try { localStorage.setItem("lucyCust2", JSON.stringify(cust)); } catch (e) {} };
const avatarOpts = () => ({ shirt: hexOf(cust.shirt), hair: hexOf(cust.hair), face: cust.face, blush: cust.blush, hs: cust.hs });

/* 조이스틱 */
let jx = 0, jy = 0, joyId = null;
{
  const joy = $("joy"), knob = $("knob");
  joy.style.touchAction = "none";
  const R = 40;
  const upd = (e) => {
    const r = joy.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    jx = dx / R; jy = -dy / R;
  };
  joy.addEventListener("pointerdown", (e) => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); upd(e); e.preventDefault(); });
  joy.addEventListener("pointermove", (e) => { if (e.pointerId === joyId) upd(e); });
  const end = (e) => { if (e.pointerId === joyId) { joyId = null; jx = jy = 0; knob.style.transform = "translate(0,0)"; } };
  joy.addEventListener("pointerup", end); joy.addEventListener("pointercancel", end);
}
/* 시점 드래그 */
{
  let id = null, lx = 0, ly = 0;
  canvas.addEventListener("pointerdown", (e) => {
    id = e.pointerId; lx = e.clientX; ly = e.clientY;
    try { canvas.setPointerCapture(id); } catch (err) {}
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
    const flip = Math.cos(pitch) < 0 ? -1 : 1;
    yaw -= dx * 0.005 * flip;
    pitch = wrapAngle(pitch - dy * 0.005);
  });
  const end = (e) => { if (e.pointerId === id) id = null; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("lostpointercapture", end);
  addEventListener("pointerup", end);
  addEventListener("pointercancel", end);
  addEventListener("blur", () => { id = null; });
  document.addEventListener("visibilitychange", () => { id = null; });
}
/* 버튼 */
$("jumpBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); if (me.onGround) { me.vy = JUMP_POWER; me.onGround = false; } });
$("viewBtn").addEventListener("click", () => {
  firstPerson = !firstPerson;
  $("viewBtn").textContent = firstPerson ? "1인칭" : "3인칭";
});
$("runBtn").addEventListener("click", () => {
  running = !running;
  $("runBtn").textContent = running ? "달리기 ON" : "달리기";
  $("runBtn").style.background = running ? "rgba(255,120,60,.8)" : "";
});
document.querySelectorAll("#emotes [data-emote]").forEach((b) => {
  b.addEventListener("click", () => {
    if (!inGame) return;
    myEm = b.dataset.emote; myEt = serverNow(); sendState(true);
  });
});

/* ============ 10. 온라인 플레이어 ============ */
const remotes = {};
let lastPlayers = {};
const sigOf = (d) => [d.name, d.c, d.hc, d.f, d.b, d.h].join("|");
function spawnRemote(d) {
  const g = makeAvatar(d.name || "관객", {
    shirt: hexOf(d.c, "#ffffff"), hair: hexOf(d.hc, "#4a3426"),
    face: d.f | 0, blush: !!d.b, hs: d.h | 0
  });
  g.position.set(d.x || 0, d.y || 0, d.z || 0);
  scene.add(g);
  return { g, sig: sigOf(d), speed: 0 };
}
function applyPlayers(v) {
  for (const id of Object.keys(remotes)) {
    if (!v[id]) { scene.remove(remotes[id].g); delete remotes[id]; }
  }
  if (!inGame) return;
  for (const id of Object.keys(v)) {
    if (id === myId) continue;
    const d = v[id];
    if (!d) continue;
    let r = remotes[id];
    if (!r || r.sig !== sigOf(d)) {
      if (r) scene.remove(r.g);
      r = remotes[id] = spawnRemote(d);
    }
    Object.assign(r, { tx: d.x || 0, ty: d.y || 0, tz: d.z || 0, try_: d.ry || 0, em: d.em || "", et: d.et || 0, t: d.t || serverNow() });
  }
}
ready.then(() => {
  onValue(playersRef, (snap) => { lastPlayers = snap.val() || {}; applyPlayers(lastPlayers); });
});

let lastSend = 0, lastForce = 0, lastSent = "";
function sendState(force) {
  if (!inGame || !myRef) return;
  const n = performance.now();
  if (!force && n - lastSend < 100) return;
  const key = [me.x.toFixed(2), me.y.toFixed(2), me.z.toFixed(2), me.ry.toFixed(2), myEm, myEt].join();
  if (!force && key === lastSent && n - lastForce < 5000) return;
  lastSend = n; lastSent = key; if (n - lastForce >= 5000) lastForce = n;
  set(myRef, {
    name: myName, c: cust.shirt, hc: cust.hair, f: cust.face, h: cust.hs, b: cust.blush ? 1 : 0,
    x: me.x, y: me.y, z: me.z, ry: me.ry, em: myEm, et: myEt, t: serverTimestamp()
  }).catch((e) => { console.log("저장 실패", e); });
}
function leave() { if (myRef) { try { remove(myRef); } catch (e) {} } }
addEventListener("pagehide", leave);

/* ============ 10.5 꾸미기 화면 (이름 입력 화면에 자동 추가) ============ */
let pRenderer = null, pScene = null, pCam = null, pAvatar = null;
function rebuildPreview() {
  if (!pScene) return;
  if (pAvatar) pScene.remove(pAvatar);
  pAvatar = makeAvatar("", avatarOpts());
  pScene.add(pAvatar);
}
function buildCustomUI() {
  const enterBtn = $("enterBtn");
  if (!enterBtn || !enterBtn.parentNode) return;
  const panel = document.createElement("div");
  panel.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;margin:10px auto;color:#fff;font:600 13px sans-serif;max-width:520px;";

  const pc = document.createElement("canvas");
  pc.style.cssText = "width:150px;height:190px;border-radius:14px;background:rgba(255,255,255,.12);flex:none;";
  panel.appendChild(pc);
  pRenderer = new THREE.WebGLRenderer({ canvas: pc, alpha: true, antialias: true });
  pRenderer.setPixelRatio(2);
  pRenderer.setSize(150, 190, false);
  pScene = new THREE.Scene();
  pCam = new THREE.PerspectiveCamera(35, 150 / 190, 0.1, 50);
  pCam.position.set(0, 1.05, 5.0);
  pCam.lookAt(0, 1.0, 0);
  rebuildPreview();

  const col = document.createElement("div");
  col.style.cssText = "display:flex;flex-direction:column;gap:6px;align-items:flex-start;";
  panel.appendChild(col);
  const row = (label) => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:5px;flex-wrap:wrap;max-width:330px;";
    const l = document.createElement("span"); l.textContent = label; l.style.cssText = "min-width:44px;opacity:.85;";
    wrap.appendChild(l); col.appendChild(wrap); return wrap;
  };
  const faceRow = row("표정");
  const blushRow = row("볼터치");
  const hairRow = row("머리");
  const hcRow = row("머리색");
  const shirtRow = row("옷 색");
  const faceBtns = [], hairBtns = [], hcBtns = [], shirtBtns = [];
  const blushBtn = document.createElement("button");
  const OFF = "rgba(255,255,255,.25)";
  const mark = () => {
    faceBtns.forEach((b, i) => b.style.borderColor = i === cust.face ? "#fff" : OFF);
    hairBtns.forEach((b, i) => b.style.borderColor = i === cust.hs ? "#fff" : OFF);
    hcBtns.forEach((b, i) => b.style.borderColor = HAIR_COLORS[i] === cust.hair ? "#fff" : OFF);
    shirtBtns.forEach((b, i) => b.style.borderColor = SHIRT_COLORS[i] === cust.shirt ? "#fff" : OFF);
    blushBtn.style.borderColor = cust.blush ? "#fff" : OFF;
    blushBtn.textContent = cust.blush ? "있음" : "없음";
  };
  const changed = () => { saveCust(); rebuildPreview(); mark(); };
  const textBtn = (label, arr, rowEl, onClick) => {
    const b = document.createElement("button");
    b.textContent = label; b.type = "button";
    b.style.cssText = "min-width:40px;height:32px;padding:0 8px;border-radius:10px;border:3px solid;background:rgba(0,0,0,.35);color:#fff;font:600 13px sans-serif;";
    b.addEventListener("click", onClick);
    rowEl.appendChild(b); if (arr) arr.push(b); return b;
  };
  FACES.forEach((f, i) => textBtn(f, faceBtns, faceRow, () => { cust.face = i; changed(); }));
  HAIRS.forEach((h, i) => textBtn(h, hairBtns, hairRow, () => { cust.hs = i; changed(); }));
  blushBtn.type = "button";
  blushBtn.style.cssText = "min-width:56px;height:32px;padding:0 8px;border-radius:10px;border:3px solid;background:rgba(0,0,0,.35);color:#fff;font:600 13px sans-serif;";
  blushBtn.addEventListener("click", () => { cust.blush = !cust.blush; changed(); });
  blushRow.appendChild(blushBtn);
  const sw = (arr, list, key, rowEl) => list.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.style.cssText = `width:26px;height:26px;border-radius:50%;border:3px solid;background:${c};padding:0;`;
    b.addEventListener("click", () => { cust[key] = c; changed(); });
    rowEl.appendChild(b); arr.push(b);
  });
  sw(hcBtns, HAIR_COLORS, "hair", hcRow);
  sw(shirtBtns, SHIRT_COLORS, "shirt", shirtRow);
  mark();
  enterBtn.parentNode.insertBefore(panel, enterBtn);
}
try { buildCustomUI(); } catch (e) { console.log("꾸미기 UI 오류", e); }

/* ============ 11. 입장 / 나가기 ============ */
let entering = false;
$("enterBtn").addEventListener("click", async () => {
  if (entering || inGame) return;
  entering = true;
  try {
    try { await ready; } catch (e) { toast("서버 연결에 실패했어요. 새로고침 해 주세요."); return; }
    let nm = ($("nick").value || "").trim().slice(0, 12);
    if (!nm) nm = "관객" + Math.floor(Math.random() * 900 + 100);
    myName = nm;
    saveCust();
    Object.assign(me, { x: (Math.random() - 0.5) * 8, y: 0, z: 128, vy: 0, ry: Math.PI, speed: 0, onGround: true });
    yaw = 0; pitch = 0; myEm = ""; myEt = 0;
    if (avatar.g) scene.remove(avatar.g);
    avatar.g = makeAvatar("", avatarOpts());
    scene.add(avatar.g);
    inGame = true;
    document.body.classList.add("in");
    $("enter").style.display = "none";
    $("viewBtn").textContent = firstPerson ? "1인칭" : "3인칭";
    $("ctlBtn").textContent = "화면 조작 OFF";
    try { await ensureVideoStart(); } catch (e) { videoStart = serverNow(); }
    try { onDisconnect(myRef).remove(); } catch (e) {}
    sendState(true);
    syncVideo();
    applyPlayers(lastPlayers);
  } finally {
    entering = false;
  }
});
$("exitBtn").addEventListener("click", () => {
  inGame = false;
  setCtl(false);
  try { yt && yt.pauseVideo(); } catch (e) {}
  if (myRef) remove(myRef).catch(() => {});
  for (const id of Object.keys(remotes)) { scene.remove(remotes[id].g); delete remotes[id]; }
  if (avatar.g) { scene.remove(avatar.g); avatar.g = null; }
  running = false; $("runBtn").textContent = "달리기"; $("runBtn").style.background = "";
  document.body.classList.remove("in");
  $("enter").style.display = "";
});

/* ============ 12. 메인 루프 ============ */
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});
let last = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  const k = dt * 60, T = now / 1000;

  if (inGame && avatar.g) {
    const sp = running ? RUN_SPEED : WALK_SPEED;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let mx = fx * jy + rx * jx, mz = fz * jy + rz * jx;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    mx *= sp * k; mz *= sp * k;
    const ox = me.x, oz = me.z;
    const nx = me.x + mx, nz = me.z + mz;
    if (!blocked(nx, me.z) && heightAt(nx, me.z) <= me.y + STEP_UP) me.x = nx;
    if (!blocked(me.x, nz) && heightAt(me.x, nz) <= me.y + STEP_UP) me.z = nz;
    if (ml > 0.05) me.ry = Math.atan2(-mx, -mz);
    me.speed = Math.hypot(me.x - ox, me.z - oz) / Math.max(k, 0.001);

    me.vy -= GRAV * k; me.y += me.vy * k;
    const gh = heightAt(me.x, me.z);
    if (me.y <= gh) { me.y = gh; me.vy = 0; me.onGround = true; } else me.onGround = false;

    const g = avatar.g;
    g.position.set(me.x, me.y, me.z); g.rotation.y = me.ry; g.visible = !firstPerson;
    const em = myEm && (serverNow() - myEt) / 1000 < (EMOTE_DUR[myEm] || 0) ? myEm : "";
    animateAvatar(g, T, me.speed, em, myEt, running);

    const hy = me.y + 1.5;
    if (firstPerson) {
      camera.position.set(me.x, hy + 0.1, me.z);
    } else {
      const f = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const cx = me.x - f.x * 9, cy = hy - f.y * 9, cz = me.z - f.z * 9;
      camera.position.set(cx, Math.max(cy, heightAt(cx, cz) + 0.4), cz);
    }
    camera.rotation.set(pitch, yaw, 0);
    sendState(false);

    for (const id of Object.keys(remotes)) {
      const r = remotes[id];
      if (r.tx === undefined) continue;
      const px = r.g.position.x, pz = r.g.position.z;
      r.g.position.x += (r.tx - px) * 0.2; r.g.position.y += (r.ty - r.g.position.y) * 0.2; r.g.position.z += (r.tz - pz) * 0.2;
      const dr = wrapAngle(r.try_ - r.g.rotation.y); r.g.rotation.y += dr * 0.2;
      const spd = Math.hypot(r.g.position.x - px, r.g.position.z - pz) / Math.max(k, 0.001);
      r.speed += (spd - r.speed) * 0.3;
      r.g.visible = serverNow() - r.t < 30000;   // 30초 넘게 신호 없으면 숨김
      animateAvatar(r.g, T, r.speed, r.em, r.et, r.speed > 0.25);
    }
  } else {
    camera.position.set(0, 12, 150);
    camera.rotation.set(-0.05, Math.sin(T * 0.1) * 0.15, 0);
    if (pRenderer && pAvatar) {
      pAvatar.rotation.y = Math.PI + Math.sin(T * 0.8) * 0.6;
      pRenderer.render(pScene, pCam);
    }
  }

  updateVideoQuad();
  renderer.render(scene, camera);
}
animate();
