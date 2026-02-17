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

/* ===== INTRO (영화 오프닝) ===== */
const intro = document.getElementById("intro");
const introType = document.getElementById("introType");
const enterBtn = document.getElementById("enterBtn");
const skipBtn = document.getElementById("skipBtn");

const introScript =
  "당신이 세계의 진실을 알고 싶다면,\n" +
  "16개의 노드를 해금해야 합니다.\n" +
  "한 사람은 한 개의 열쇠만 가질 수 있습니다.\n" +
  "— GRUA CAMPUS ARCHIVE";

typeWriter(introScript, introType, 18);

function typeWriter(text, el, speed=18){
  let i=0;
  const tick=()=>{
    el.textContent = text.slice(0,i++);
    if(i<=text.length) setTimeout(tick, speed);
  };
  tick();
}

function closeIntro(){
  intro.style.opacity = "0";
  intro.style.pointerEvents = "none";
  setTimeout(()=> intro.remove(), 450);
}
enterBtn.addEventListener("click", closeIntro);
skipBtn.addEventListener("click", closeIntro);
window.addEventListener("click", (e)=> { if (intro && e.target === intro) closeIntro(); });
window.addEventListener("keydown", (e)=> {
  if(e.key === "Enter" && intro) closeIntro();
});

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

// ✅ 로드시 모달 자동오픈 금지
modalBackdrop.classList.add("hidden");

let slots = [];
let selectedId = null;

/* ===== 타입 16개: 기존 장소/구역(너가 이미 쓰던 값 유지) =====
   여기의 place는 “타입별 기존 장소”로 유지해.
   (추가 장소 6개는 아래 LANDMARKS로 별도 존재 → 총 22개)
*/
const GRUA_META = [
  { idx:1,  type:"IFAP", place:"기록 보관 구역", icon:"🗄️", axis:"Inner–Faith–Anchor–Participant" },
  { idx:2,  type:"IFAB", place:"관측 구역",     icon:"👁️", axis:"Inner–Faith–Anchor–Observer" },
  { idx:3,  type:"IFLP", place:"창작 구역",     icon:"✍️", axis:"Inner–Faith–Flow–Participant" },
  { idx:4,  type:"IFLB", place:"전시 구역",     icon:"🗂️", axis:"Inner–Faith–Flow–Observer" },

  { idx:5,  type:"IEAP", place:"분석실",       icon:"🧠", axis:"Inner–Evidence–Anchor–Participant" },
  { idx:6,  type:"IEAB", place:"통계실",       icon:"📐", axis:"Inner–Evidence–Anchor–Observer" },
  { idx:7,  type:"IELP", place:"전략 회의실",   icon:"♟️", axis:"Inner–Evidence–Flow–Participant" },
  { idx:8,  type:"IELB", place:"사건 기록구역", icon:"🧾", axis:"Inner–Evidence–Flow–Observer" },

  { idx:9,  type:"OFAP", place:"중앙 광장 구역", icon:"💞", axis:"Outer–Faith–Anchor–Participant" },
  { idx:10, type:"OFAB", place:"접경 구역",     icon:"🛡️", axis:"Outer–Faith–Anchor–Observer" },
  { idx:11, type:"OFLP", place:"통신 구역",     icon:"📡", axis:"Outer–Faith–Flow–Participant" },
  { idx:12, type:"OFLB", place:"시간 기록 구역", icon:"⏳", axis:"Outer–Faith–Flow–Observer" },

  { idx:13, type:"OEAP", place:"증언실",       icon:"🕯️", axis:"Outer–Evidence–Anchor–Participant" },
  { idx:14, type:"OEAB", place:"봉인 서고",     icon:"🔒", axis:"Outer–Evidence–Anchor–Observer" },
  { idx:15, type:"OELP", place:"전환 통로",     icon:"🔁", axis:"Outer–Evidence–Flow–Participant" },
  { idx:16, type:"OELB", place:"사후 접근 가능 구역", icon:"👣", axis:"Outer–Evidence–Flow–Observer" },
];

function metaByIdx(idx){ return GRUA_META.find(m => m.idx === idx) || null; }
function parseType(typeCode){
  const t = String(typeCode || "").trim().toUpperCase();
  return { io: t[0] || "I", fe: t[1] || "F", al: t[2] || "A", pb: t[3] || "P" };
}

/* ✅ 추가 장소 6개(랜드마크) */
const LANDMARKS = [
  { name:"광장",     icon:"🌿", x:520, y:355, cls:"big" },
  { name:"분수",     icon:"⛲", x:520, y:300, cls:"fountain" },
  { name:"기숙사",   icon:"🛏️", x:260, y:438, cls:"" },
  { name:"학생회관", icon:"🏛️", x:410, y:235, cls:"" },
  { name:"식당",     icon:"🍽️", x:720, y:235, cls:"" },
  { name:"도서관",   icon:"📚", x:780, y:438, cls:"" },
];

/* ===== 캠퍼스형 배치(대학지도 느낌) ===== */
const NODE_LAYOUT = [
  // 상단: 기록/관측/창작/전시
  { idx:1,  x:170, y:140 },
  { idx:2,  x:330, y:120 },
  { idx:3,  x:500, y:145 },
  { idx:4,  x:660, y:125 },

  // 중앙: 분석/통계/전략/기록
  { idx:5,  x:210, y:280 },
  { idx:6,  x:360, y:290 },
  { idx:7,  x:520, y:305 },
  { idx:8,  x:690, y:290 },

  // 하단: 교류/경계/통신/시간
  { idx:9,  x:260, y:395 },
  { idx:10, x:380, y:430 },
  { idx:11, x:560, y:430 },
  { idx:12, x:720, y:395 },

  // 우측 외곽: 증언/봉인/전환/사후
  { idx:13, x:840, y:175 },
  { idx:14, x:875, y:285 },
  { idx:16, x:805, y:340 },
  { idx:15, x:875, y:410 },
];

/* 곡선 동선(지나가는 길) */
const EDGES = [
  [1,2],[2,3],[3,4],
  [2,6],[3,7],[4,8],
  [5,6],[6,7],[7,8],
  [5,9],[6,10],[7,11],[8,12],
  [4,13],[8,14],[11,16],[12,15],
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
  puzzleLayer.classList.add("dim"); // ✅ 모달 중 배경 덜 보이게
  mAnswer.value = "";
  setTimeout(()=> mAnswer.focus(), 50);
}
function closeModal(){
  modalBackdrop.classList.add("hidden");
  puzzleLayer.classList.remove("dim");
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
  renderPaths();
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

function renderPaths(){
  linesSvg.innerHTML = "";
  EDGES.forEach(([a,b])=>{
    const A = NODE_LAYOUT.find(n=>n.idx===a);
    const B = NODE_LAYOUT.find(n=>n.idx===b);
    if(!A || !B) return;

    const meta = metaByIdx(a);
    const p = parseType(meta?.type || "IFAP");

    // 곡선: 중간 제어점(캠퍼스 길처럼 살짝 휘게)
    const mx = (A.x + B.x) / 2;
    const my = (A.y + B.y) / 2;
    const bend = 28;
    const cx = mx + (A.y - B.y) / 520 * bend;
    const cy = my + (B.x - A.x) / 1000 * bend;

    const path = document.createElementNS("http://www.w3.org/2000/svg","path");
    path.setAttribute("d", `M ${A.x} ${A.y} Q ${cx} ${cy} ${B.x} ${B.y}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-width", "2");

    path.setAttribute("data-fe", p.fe);
    path.setAttribute("data-io", p.io);

    linesSvg.appendChild(path);
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
    nodesEl.style.display = "none";
    linesSvg.style.display = "none";
    if(landmarksEl) landmarksEl.style.display = "none";
    finalReveal.classList.remove("hidden");
    modalBackdrop.classList.add("hidden");
    puzzleLayer.classList.remove("dim");
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
