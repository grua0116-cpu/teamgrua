import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, doc, query, orderBy,
  onSnapshot, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** ✅ 여기만 네 값으로 채워넣기 */
const firebaseConfig = {
  apiKey: "AIzaSyAqwSJ7nXC-AsHp5ifllDzzGA_UBCWQhJE",
  authDomain: "teamgrua-f465c.firebaseapp.com",
  projectId: "teamgrua-f465c",
  storageBucket: "teamgrua-f465c.firebasestorage.app",
  messagingSenderId: "1019914743201",
  appId: "1:1019914743201:web:171550946aafb90ab96fe0"
};


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ===== UI refs ===== */
const statusText = document.getElementById("statusText");
const nodesEl = document.getElementById("nodes");
const linesSvg = document.getElementById("campusLines");
const puzzleLayer = document.getElementById("puzzleLayer");
const landmarksEl = document.getElementById("landmarks");
const finalReveal = document.getElementById("finalReveal");

// Modal
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalTitle = document.getElementById("modalTitle");
const mQuestion = document.getElementById("mQuestion");
const mHint = document.getElementById("mHint");
const mExplain = document.getElementById("mExplain");
const mAnswer = document.getElementById("mAnswer");
const mSubmit = document.getElementById("mSubmit");

// ✅ 로드시 모달 절대 자동오픈 금지
modalBackdrop.classList.add("hidden");

let slots = [];
let selectedId = null;

/* ===== 장소(랜드마크 + 노드명) ===== */
const GRUA_META = [
  { idx:1,  type:"IFAP", place:"기록보관관", icon:"🗄️" },
  { idx:2,  type:"IFAB", place:"관측열람실", icon:"👁️" },
  { idx:3,  type:"IFLP", place:"저술연구실", icon:"✍️" },
  { idx:4,  type:"IFLB", place:"정리전시실", icon:"🗂️" },

  { idx:5,  type:"IEAP", place:"분석실",     icon:"🧠" },
  { idx:6,  type:"IEAB", place:"기준실",     icon:"📐" },
  { idx:7,  type:"IELP", place:"전략실",     icon:"♟️" },
  { idx:8,  type:"IELB", place:"추적기록실", icon:"🧾" },

  { idx:9,  type:"OFAP", place:"중앙광장",   icon:"🌿" },
  { idx:10, type:"OFAB", place:"경계초소",   icon:"🛡️" },
  { idx:11, type:"OFLP", place:"공명센터",   icon:"📡" },
  { idx:12, type:"OFLB", place:"기억보존관", icon:"⏳" },

  { idx:13, type:"OEAP", place:"고해실",     icon:"🕯️" },
  { idx:14, type:"OEAB", place:"봉인서고",   icon:"🔒" },
  { idx:15, type:"OELP", place:"전환게이트", icon:"🔁" },
  { idx:16, type:"OELB", place:"사후접근로", icon:"👣" },
];
function metaByIdx(idx){ return GRUA_META.find(m => m.idx === idx) || null; }
function parseType(typeCode){
  const t = String(typeCode || "").trim().toUpperCase();
  return { io: t[0] || "I", fe: t[1] || "F", al: t[2] || "A", pb: t[3] || "P" };
}

/* ===== 랜드마크(요청: 광장/분수/기숙사/학생회관/식당) ===== */
const LANDMARKS = [
  { name:"광장",     icon:"🌿", x:520, y:380, cls:"big" },
  { name:"분수",     icon:"⛲", x:520, y:325, cls:"fountain" },
  { name:"기숙사",   icon:"🛏️", x:300, y:440, cls:"" },
  { name:"학생회관", icon:"🏛️", x:430, y:260, cls:"" },
  { name:"식당",     icon:"🍽️", x:690, y:260, cls:"" },
];

/* ===== 대학 지도 배치(스샷 기준 보정) ===== */
const NODE_LAYOUT = [
  { idx:1,  x:155, y:135 },
  { idx:2,  x:320, y:120 },
  { idx:3,  x:500, y:140 },
  { idx:4,  x:670, y:125 },

  { idx:5,  x:170, y:265 },
  { idx:6,  x:350, y:275 },
  { idx:7,  x:520, y:295 },
  { idx:8,  x:700, y:275 },

  { idx:9,  x:210, y:395 },
  { idx:10, x:365, y:420 },
  { idx:11, x:560, y:418 },
  { idx:12, x:705, y:395 },

  { idx:13, x:845, y:170 },
  { idx:14, x:875, y:285 },
  { idx:16, x:805, y:345 },
  { idx:15, x:875, y:410 },
];

/* 선 연결(동선 느낌) */
const EDGES = [
  [1,2],[2,3],[3,4],
  [2,6],[3,7],[4,8],
  [5,6],[6,7],[7,8],
  [5,9],[6,10],[7,11],[8,12],
  [4,13],[8,14],[12,15],[11,16],
];

/* ===== Firestore ===== */
const slotsCol = collection(db, "game", "season1", "slots");
const q = query(slotsCol, orderBy("orderIndex", "asc"));

function makeFallbackSlots(){
  return Array.from({ length: 16 }, (_, i) => ({
    id: String(i + 1).padStart(2, "0"),
    orderIndex: i + 1,
    typeCode: metaByIdx(i + 1)?.type || "",
    question: "",
    hint: "",
    answer: "",
    explanation: "",
    unlocked: false,
  }));
}

onSnapshot(
  q,
  (snap) => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    slots = (data && data.length) ? data : makeFallbackSlots();
    renderAll();
    if (selectedId) fillModal();
  },
  (err) => {
    console.error("🔥 Firestore onSnapshot error:", err);
    slots = makeFallbackSlots();
    renderAll();
  }
);

/* ===== Modal handlers ===== */
modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

function openModal(){
  if (!selectedId) return;
  modalBackdrop.classList.remove("hidden");
  mAnswer.value = "";
  setTimeout(()=> mAnswer.focus(), 50);
}
function closeModal(){
  modalBackdrop.classList.add("hidden");
  selectedId = null;
  renderNodes();
}

function fillModal(){
  const s = slots.find(x=>x.id===selectedId);
  if(!s) return;

  const idx = s.orderIndex ?? 1;
  const meta = metaByIdx(idx);
  const typeCode = (s.typeCode || meta?.type || s.id || "").toUpperCase();

  modalTitle.textContent = `${meta?.place || "NODE"} · ${typeCode} · #${idx}`;
  mQuestion.textContent = s.question || "";
  mHint.textContent = s.hint || "";
  mExplain.textContent = s.explanation || "";

  if (s.unlocked) {
    mAnswer.disabled = true;
    mSubmit.disabled = true;
    mSubmit.textContent = "이미 해금됨";
  } else {
    mAnswer.disabled = false;
    mSubmit.disabled = false;
    mSubmit.textContent = "정답 제출 → 조각 열기";
  }
  mSubmit.onclick = () => submitAnswer(s.id, mAnswer.value, s.answer || "");
}

async function submitAnswer(slotId, input, correctAnswer){
  const userAns = (input || "").trim();
  if(!userAns) return alert("정답을 입력해줘.");
  if(!correctAnswer) return alert("이 슬롯의 answer가 비어 있어.");

  const ok = normalize(userAns) === normalize(correctAnswer);
  if(!ok) return alert("오답!");

  const ref = doc(db, "game", "season1", "slots", slotId);

  try{
    await runTransaction(db, async (tx)=>{
      const snap = await tx.get(ref);
      if(!snap.exists()) throw new Error("문서가 없어.");
      const data = snap.data();
      if(data.unlocked) return;
      tx.update(ref, { unlocked: true });
    });
    alert("정답! 해당 퍼즐 조각이 열렸어.");
  }catch(e){
    alert(e?.message || String(e));
  }
}

/* ===== Render ===== */
function renderAll(){
  renderStatus();
  renderPuzzleLayer();
  renderLines();
  renderLandmarks();
  renderNodes();
  renderFinalIfAllUnlocked();
}

function renderStatus(){
  const unlockedCount = slots.filter(s => !!s.unlocked).length;
  statusText.textContent = `해금 ${unlockedCount}/16 · 노드를 눌러 문제를 풀면 해당 조각이 열립니다.`;
}

function renderPuzzleLayer(){
  puzzleLayer.innerHTML = "";
  slots.forEach(s => {
    const piece = document.createElement("div");
    piece.className = `piece ${s.unlocked ? "unlocked" : "locked"}`;

    const i = (s.orderIndex ?? 1) - 1;
    const row = Math.floor(i / 4);
    const col = i % 4;
    const x = (col * 100) / 3;
    const y = (row * 100) / 3;

    piece.style.backgroundPosition = `${x}% ${y}%`;
    piece.innerHTML = `<div class="tag">${s.orderIndex ?? "?"}</div>`;
    puzzleLayer.appendChild(piece);
  });
}

function renderLines(){
  linesSvg.innerHTML = "";
  EDGES.forEach(([a,b])=>{
    const A = NODE_LAYOUT.find(n=>n.idx===a);
    const B = NODE_LAYOUT.find(n=>n.idx===b);
    if(!A || !B) return;

    const meta = metaByIdx(a);
    const p = parseType(meta?.type || "IFAP");

    const line = document.createElementNS("http://www.w3.org/2000/svg","line");
    line.setAttribute("x1", String(A.x));
    line.setAttribute("y1", String(A.y));
    line.setAttribute("x2", String(B.x));
    line.setAttribute("y2", String(B.y));
    line.setAttribute("stroke-width", "2");

    line.setAttribute("data-fe", p.fe);
    line.setAttribute("data-io", p.io);

    linesSvg.appendChild(line);
  });
}

function renderLandmarks(){
  if(!landmarksEl) return;
  landmarksEl.innerHTML = "";
  LANDMARKS.forEach(lm=>{
    const d = document.createElement("div");
    d.className = `landmark ${lm.cls || ""}`.trim();
    d.style.left = `${lm.x}px`;
    d.style.top  = `${lm.y}px`;
    d.innerHTML = `<span class="ico">${escapeHtml(lm.icon)}</span>${escapeHtml(lm.name)}`;
    landmarksEl.appendChild(d);
  });
}

function renderNodes(){
  nodesEl.innerHTML = "";
  slots.forEach(s=>{
    const idx = s.orderIndex ?? 1;
    const layout = NODE_LAYOUT.find(n=>n.idx===idx) || { x: 100, y: 100 };
    const meta = metaByIdx(idx);
    const typeCode = (s.typeCode || meta?.type || s.id || "").toUpperCase();
    const p = parseType(typeCode);

    const node = document.createElement("div");
    node.className = `node ${selectedId===s.id ? "active" : ""}`;
    node.style.left = `${layout.x}px`;
    node.style.top  = `${layout.y}px`;

    node.dataset.fe = p.fe;
    node.dataset.io = p.io;

    node.innerHTML = `
      <div class="ico">${escapeHtml(meta?.icon || "●")}</div>
      <div class="place">${escapeHtml(meta?.place || "장소")}</div>
      <div class="mini">${escapeHtml(typeCode)} · ${idx}</div>
    `;

    node.onclick = () => {
      selectedId = s.id;
      renderNodes();
      openModal();
      fillModal();
    };

    nodesEl.appendChild(node);
  });
}

function renderFinalIfAllUnlocked(){
  const unlockedCount = slots.filter(s => !!s.unlocked).length;
  const all = unlockedCount >= 16;

  if(all){
    // 노드/지도는 숨기고, 최종 이미지 앞으로
    nodesEl.style.display = "none";
    linesSvg.style.display = "none";
    if(landmarksEl) landmarksEl.style.display = "none";
    finalReveal.classList.remove("hidden");
    // 모달이 열려있다면 닫기
    modalBackdrop.classList.add("hidden");
    selectedId = null;
  }else{
    nodesEl.style.display = "";
    linesSvg.style.display = "";
    if(landmarksEl) landmarksEl.style.display = "";
    finalReveal.classList.add("hidden");
  }
}

/* ===== Utils ===== */
function normalize(s){ return String(s).toLowerCase().replace(/\s+/g,""); }
function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
