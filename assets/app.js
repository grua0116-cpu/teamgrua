import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, doc, query, orderBy,
  onSnapshot, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** ✅ 너 Firebase 콘솔에서 복사한 firebaseConfig 붙여넣기 */
const firebaseConfig = {
  // apiKey: "...",
  // authDomain: "...",
  // projectId: "...",
  // storageBucket: "...",
  // messagingSenderId: "...",
  // appId: "..."
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Firestore 경로: game/season1/slots
const slotsCol = collection(db, "game", "season1", "slots");
const q = query(slotsCol, orderBy("orderIndex", "asc"));

// UI
const statusText = document.getElementById("statusText");
const nodesEl = document.getElementById("nodes");
const linesSvg = document.getElementById("campusLines");
const puzzleLayer = document.getElementById("puzzleLayer");

// Modal UI
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalTitle = document.getElementById("modalTitle");
const mQuestion = document.getElementById("mQuestion");
const mHint = document.getElementById("mHint");
const mExplain = document.getElementById("mExplain");
const mAnswer = document.getElementById("mAnswer");
const mSubmit = document.getElementById("mSubmit");

let slots = [];
let selectedId = null;

/** 🎓 대학 지도처럼 보이게 “클러스터” 느낌 배치 */
const NODE_LAYOUT = [
  // 정문/본부 라인
  { idx: 1,  x: 120, y: 95,  label: "GATE" },
  { idx: 2,  x: 250, y: 80,  label: "ADMIN" },
  { idx: 3,  x: 390, y: 110, label: "LIB" },
  { idx: 4,  x: 540, y: 90,  label: "HALL" },

  // 강의/동아리 구역
  { idx: 5,  x: 150, y: 220, label: "LAB" },
  { idx: 6,  x: 290, y: 215, label: "ART" },
  { idx: 7,  x: 430, y: 235, label: "STU" },
  { idx: 8,  x: 590, y: 215, label: "CAFÉ" },

  // 기숙/운동/야외
  { idx: 9,  x: 170, y: 380, label: "GYM" },
  { idx: 10, x: 320, y: 395, label: "DORM" },
  { idx: 11, x: 470, y: 390, label: "STAGE" },
  { idx: 12, x: 640, y: 380, label: "PARK" },

  // 외곽 시설
  { idx: 13, x: 820, y: 110, label: "OBS" },
  { idx: 14, x: 860, y: 225, label: "TOWER" },
  { idx: 15, x: 880, y: 360, label: "PORT" },
  { idx: 16, x: 720, y: 300, label: "ARCH" },
];

const EDGES = [
  [1,2],[2,3],[3,4],
  [2,6],[3,7],[4,8],
  [5,6],[6,7],[7,8],
  [5,9],[6,10],[7,11],[8,12],
  [4,13],[8,14],[12,15],[11,16],
];

modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

onSnapshot(q, (snap) => {
  slots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderStatus();
  renderPuzzleLayer();
  renderLines();
  renderNodes();
  if (selectedId) fillModal(); // 실시간 업데이트 반영
});

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

    const line = document.createElementNS("http://www.w3.org/2000/svg","line");
    line.setAttribute("x1", String(A.x));
    line.setAttribute("y1", String(A.y));
    line.setAttribute("x2", String(B.x));
    line.setAttribute("y2", String(B.y));
    line.setAttribute("stroke", "rgba(255,255,255,0.18)");
    line.setAttribute("stroke-width", "2");
    linesSvg.appendChild(line);
  });
}

function renderNodes(){
  nodesEl.innerHTML = "";
  slots.forEach(s=>{
    const idx = s.orderIndex ?? 1;
    const layout = NODE_LAYOUT.find(n=>n.idx===idx) || { x: 100, y: 100, label: "NODE" };

    const node = document.createElement("div");
    node.className = `node ${s.unlocked ? "unlocked" : ""} ${selectedId===s.id ? "active" : ""}`;
    node.style.left = `${layout.x}px`;
    node.style.top  = `${layout.y}px`;

    node.innerHTML = `
      <div class="n">${idx}</div>
      <div class="t">${escapeHtml(layout.label)}</div>
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

function openModal(){
  // ✅ 노드 선택(=selectedId) 없으면 절대 열지 않기
  if (!selectedId) return;

  modalBackdrop.classList.remove("hidden");
  mAnswer.value = "";
  setTimeout(()=> mAnswer.focus(), 50);
}

function closeModal(){
  modalBackdrop.classList.add("hidden"); // ✅ 최초 로드에서 무조건 닫힘
  selectedId = null;
  renderNodes();
}

function fillModal(){
  const s = slots.find(x=>x.id===selectedId);
  if(!s) return;

  modalTitle.textContent = `${s.typeCode || s.id} · #${s.orderIndex ?? "?"}`;
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

function normalize(s){
  return String(s).toLowerCase().replace(/\s+/g,"");
}
function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
