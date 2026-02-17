import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, doc, query, orderBy,
  onSnapshot, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** ✅ Firebase 콘솔에서 복사한 firebaseConfig를 여기에 붙여넣기 */
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

// Firestore 경로: game/season1/slots (01~16)
const slotsCol = collection(db, "game", "season1", "slots");
const q = query(slotsCol, orderBy("orderIndex", "asc"));

// UI
const statusText = document.getElementById("statusText");
const boardEl = document.getElementById("board");
const detailEl = document.getElementById("detail");
const nodesEl = document.getElementById("nodes");
const linesSvg = document.getElementById("campusLines");

let slots = [];
let selectedId = null;

/**
 * 🎓 캠퍼스맵 노드 배치 좌표
 * - x,y: 0~1000 / 0~520 (svg viewBox 기준)
 * - label은 “건물 약자” 느낌 (원하면 변경)
 */
const NODE_LAYOUT = [
  { idx: 1,  x: 110, y: 120, label: "GATE" },
  { idx: 2,  x: 220, y: 95,  label: "ADMIN" },
  { idx: 3,  x: 345, y: 140, label: "LIB" },
  { idx: 4,  x: 470, y: 110, label: "HALL" },

  { idx: 5,  x: 140, y: 260, label: "LAB" },
  { idx: 6,  x: 280, y: 240, label: "ART" },
  { idx: 7,  x: 420, y: 260, label: "STU" },
  { idx: 8,  x: 560, y: 235, label: "CAFÉ" },

  { idx: 9,  x: 170, y: 395, label: "GYM" },
  { idx: 10, x: 320, y: 390, label: "DORM" },
  { idx: 11, x: 470, y: 400, label: "STAGE" },
  { idx: 12, x: 620, y: 385, label: "PARK" },

  { idx: 13, x: 760, y: 120, label: "OBS" },
  { idx: 14, x: 820, y: 245, label: "TOWER" },
  { idx: 15, x: 880, y: 380, label: "PORT" },
  { idx: 16, x: 700, y: 320, label: "ARCH" },
];

// “캠퍼스 동선” 느낌 연결선 (원하면 수정)
const EDGES = [
  [1,2],[2,3],[3,4],
  [1,5],[2,6],[3,7],[4,8],
  [5,6],[6,7],[7,8],
  [5,9],[6,10],[7,11],[8,12],
  [4,13],[8,14],[12,15],[11,16],
];

// 실시간 구독
onSnapshot(q, (snap) => {
  slots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderStatus();
  renderBoard();
  renderNodes();
  renderDetail();
});

function renderStatus(){
  const unlockedCount = slots.filter(s => !!s.unlocked).length;
  statusText.textContent = `해금 ${unlockedCount}/16 · 노드를 클릭해서 문제를 풀면 퍼즐 조각이 열립니다.`;
}

function renderBoard(){
  boardEl.innerHTML = "";
  slots.forEach(s => {
    const piece = document.createElement("div");
    piece.className = `piece ${s.unlocked ? "unlocked" : "locked"}`;

    // orderIndex(1~16) → 4x4 행/열
    const i = (s.orderIndex ?? 1) - 1;
    const row = Math.floor(i / 4);
    const col = i % 4;

    // background-position: 0, 33.333, 66.666, 100
    const x = (col * 100) / 3;
    const y = (row * 100) / 3;

    piece.style.backgroundPosition = `${x}% ${y}%`;
    piece.innerHTML = `<div class="tag">${s.orderIndex ?? "?"}</div>`;
    boardEl.appendChild(piece);
  });
}

function renderNodes(){
  nodesEl.innerHTML = "";
  linesSvg.innerHTML = "";

  // 선 그리기
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

  // 노드 생성
  slots.forEach(s=>{
    const idx = s.orderIndex ?? 1;
    const layout = NODE_LAYOUT.find(n=>n.idx===idx) || { x: 100, y: 100, label: "NODE" };

    const node = document.createElement("div");
    node.className = `node ${s.unlocked ? "unlocked" : ""} ${selectedId===s.id ? "active" : ""}`;
    node.style.left = `${layout.x}px`;
    node.style.top  = `${layout.y}px`;
    node.title = `${idx} · ${s.typeCode || s.id}`;

    node.innerHTML = `
      <div class="n">${idx}</div>
      <div class="t">${escapeHtml(layout.label)}</div>
    `;

    node.onclick = ()=>{
      selectedId = s.id;
      renderNodes();
      renderDetail();
      // 상세 섹션이 화면 아래면 자연스럽게 이동
      window.scrollTo({ top: detailEl.offsetTop - 20, behavior: "smooth" });
    };

    nodesEl.appendChild(node);
  });
}

function renderDetail(){
  if(!selectedId){
    detailEl.classList.add("hidden");
    detailEl.innerHTML = "";
    return;
  }

  const s = slots.find(x=>x.id===selectedId);
  if(!s) return;

  detailEl.classList.remove("hidden");

  detailEl.innerHTML = `
    <h2>${escapeHtml(s.typeCode || s.id)} · #${s.orderIndex ?? "?"}</h2>

    <div class="row">
      <div class="label">Question</div>
      <div class="box">${escapeHtml(s.question || "")}</div>
    </div>

    <div class="row">
      <div class="label">Hint</div>
      <div class="box">${escapeHtml(s.hint || "")}</div>
    </div>

    <div class="row">
      <div class="label">정답 입력</div>
      <input id="ansInput" placeholder="정답 입력" ${s.unlocked ? "disabled" : ""} />
      <button id="submitBtn" ${s.unlocked ? "disabled" : ""}>정답 제출 → 조각 열기</button>
      <div class="muted">자율 신뢰 버전: 정답은 Firestore에 저장되어 있어요.</div>
    </div>

    <div class="row">
      <div class="label">Explanation</div>
      <div class="box">${escapeHtml(s.explanation || "")}</div>
    </div>
  `;

  document.getElementById("submitBtn")?.addEventListener("click", ()=>{
    const input = document.getElementById("ansInput").value;
    submitAnswer(s.id, input, s.answer || "");
  });
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
    alert("정답! 조각이 열렸어.");
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
