import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, doc, query, orderBy,
  onSnapshot, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** ✅ 너 Firebase 콘솔에서 복사한 firebaseConfig를 여기에 그대로 붙여넣기 */
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

// Modal
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalTitle = document.getElementById("modalTitle");
const mQuestion = document.getElementById("mQuestion");
const mHint = document.getElementById("mHint");
const mExplain = document.getElementById("mExplain");
const mAnswer = document.getElementById("mAnswer");
const mSubmit = document.getElementById("mSubmit");

// ✅ 안전: 로드 시 무조건 모달 닫기
modalBackdrop.classList.add("hidden");

let slots = [];
let selectedId = null;

/* ===== GRUA META (카드 기반 표시) =====
   ※ 너 카드 레퍼런스 기반으로 “아이콘/한글 POSITION/GROUND/TYPE”를 여기서 고정 */
const GRUA_META = [
  { idx:1,  type:"IFAP", pos:"기록 보관자", ground:"기록 보관 구역", icon:"🗄️", axis:"Inner–Faith–Anchor–Participant" },
  { idx:2,  type:"IFAB", pos:"증인",       ground:"관측 구역",       icon:"👁️", axis:"Inner–Faith–Anchor–Observer" },
  { idx:3,  type:"IFLP", pos:"저자",       ground:"창작 구역",       icon:"✍️", axis:"Inner–Faith–Flow–Participant" },
  { idx:4,  type:"IFLB", pos:"정리자",     ground:"전시 구역",       icon:"🗂️", axis:"Inner–Faith–Flow–Observer" },

  { idx:5,  type:"IEAP", pos:"분석가",       ground:"분석실",       icon:"🧠", axis:"Inner–Evidence–Anchor–Participant" },
  { idx:6,  type:"IEAB", pos:"기준 관찰자", ground:"통계실",       icon:"📐", axis:"Inner–Evidence–Anchor–Observer" },
  { idx:7,  type:"IELP", pos:"전략가",      ground:"전략 회의실",   icon:"♟️", axis:"Inner–Evidence–Flow–Participant" },
  { idx:8,  type:"IELB", pos:"추적자",      ground:"사건 기록구역", icon:"🧾", axis:"Inner–Evidence–Flow–Observer" },

  { idx:9,  type:"OFAP", pos:"애호가",     ground:"중앙 광장",     icon:"💞", axis:"Outer–Faith–Anchor–Participant" },
  { idx:10, type:"OFAB", pos:"파수",       ground:"접경 구역",     icon:"🛡️", axis:"Outer–Faith–Anchor–Observer" },
  { idx:11, type:"OFLP", pos:"공명자",     ground:"통신 구역",     icon:"📡", axis:"Outer–Faith–Flow–Participant" },
  { idx:12, type:"OFLB", pos:"기억자",     ground:"시간 기록 구역", icon:"⏳", axis:"Outer–Faith–Flow–Observer" },

  { idx:13, type:"OEAP", pos:"고해자",        ground:"증언실",     icon:"🕯️", axis:"Outer–Evidence–Anchor–Participant" },
  { idx:14, type:"OEAB", pos:"종결 기록자",   ground:"봉인 서고",   icon:"🔒", axis:"Outer–Evidence–Anchor–Observer" },
  { idx:15, type:"OELP", pos:"호환자",        ground:"전환 통로",   icon:"🔁", axis:"Outer–Evidence–Flow–Participant" },
  { idx:16, type:"OELB", pos:"목격자",        ground:"사후 접근 가능 구역", icon:"👣", axis:"Outer–Evidence–Flow–Observer" },
];
function metaByIdx(idx){ return GRUA_META.find(m => m.idx === idx) || null; }
function parseType(typeCode){
  const t = String(typeCode || "").trim().toUpperCase();
  return { io: t[0] || "I", fe: t[1] || "F", al: t[2] || "A", pb: t[3] || "P" };
}

/* ===== 대학 지도 배치 (좌표만 바꾸면 됨) ===== */
const NODE_LAYOUT = [
  { idx:1,  x:130, y:95 }, { idx:2,  x:290, y:80 }, { idx:3,  x:440, y:110 }, { idx:4,  x:600, y:90 },
  { idx:5,  x:160, y:220 },{ idx:6,  x:320, y:215 },{ idx:7,  x:480, y:235 },{ idx:8,  x:650, y:215 },
  { idx:9,  x:190, y:380 },{ idx:10, x:350, y:395 },{ idx:11, x:510, y:390 },{ idx:12, x:700, y:380 },
  { idx:13, x:860, y:110 },{ idx:14, x:890, y:225 },{ idx:15, x:900, y:360 },{ idx:16, x:770, y:300 },
];

/* 맵 연결선(대학 동선 느낌) */
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
  if (!selectedId) return; // ✅ 노드 선택 전에는 절대 열지 않기
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

  modalTitle.textContent = `${meta?.pos || (s.positionName || "노드")} · ${typeCode} · #${idx}`;
  mQuestion.textContent = s.question || "";
  mHint.textContent = s.hint || "";
  mExplain.textContent = `${meta?.ground ? `GROUND: ${meta.ground}\n` : ""}${meta?.axis ? `AXIS: ${meta.axis}\n\n` : ""}${s.explanation || ""}`;

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
  renderNodes();
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

function renderNodes(){
  nodesEl.innerHTML = "";
  slots.forEach(s=>{
    const idx = s.orderIndex ?? 1;
    const layout = NODE_LAYOUT.find(n=>n.idx===idx) || { x: 100, y: 100 };
    const meta = metaByIdx(idx);
    const typeCode = (s.typeCode || meta?.type || s.id || "").toUpperCase();
    const p = parseType(typeCode);

    const node = document.createElement("div");
    node.className = `node ${s.unlocked ? "unlocked" : ""} ${selectedId===s.id ? "active" : ""}`;
    node.style.left = `${layout.x}px`;
    node.style.top  = `${layout.y}px`;

    node.dataset.fe = p.fe;
    node.dataset.al = p.al;
    node.dataset.io = p.io;

    node.innerHTML = `
      <div class="ico">${escapeHtml(meta?.icon || "●")}</div>
      <div class="pos">${escapeHtml(meta?.pos || (s.positionName || "노드"))}</div>
      <div class="type">${escapeHtml(typeCode)}</div>
      <div class="ground">${escapeHtml(meta?.ground || "")}</div>
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
