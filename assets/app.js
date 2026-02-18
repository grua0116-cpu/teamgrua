console.log("🔥 GRUA app.js running (design2 aligned / unlocked-only)");

window.addEventListener("error", (e)=>{
  alert("❌ JS 에러: " + (e?.message || e));
});
window.addEventListener("unhandledrejection", (e)=>{
  alert("❌ Promise 에러: " + (e?.reason?.message || e?.reason || e));
});

const firebaseConfig = {
  apiKey: "AIzaSyAqwSJ7nXC-AsHp5ifllDzzGA_UBCWQhJE",
  authDomain: "teamgrua-f465c.firebaseapp.com",
  projectId: "teamgrua-f465c",
  storageBucket: "teamgrua-f465c.firebasestorage.app",
  messagingSenderId: "1019914743201",
  appId: "1:1019914743201:web:171550946aafb90ab96fe0"
};

const SEASON = "season1";

function ensureFirebase(){
  if (!window.firebase) throw new Error("firebase SDK not loaded (compat scripts missing)");
  if (!firebase.apps || firebase.apps.length === 0) firebase.initializeApp(firebaseConfig);
  return firebase.firestore();
}
function roundId(n){ return `R${String(n).padStart(4,"0")}`; }
function normalize(s){ return String(s ?? "").trim().toLowerCase().replace(/\s+/g," "); }
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

// Firestore refs
function metaRef(db){
  return db.collection("game").doc(SEASON).collection("meta").doc("meta");
}
function slotRef(db, roundIdStr, slotId){
  return db.collection("game").doc(SEASON).collection("rounds").doc(roundIdStr)
           .collection("slots").doc(slotId);
}

// 16 타입 (표시용) — Firestore 값이 있으면 그걸 우선 사용
const FALLBACK_TYPE = {
  "01": ["IFAP","기록 보관 구역"],
  "02": ["IFAB","관측 구역"],
  "03": ["IFLP","창작 구역"],
  "04": ["IFLB","전시 구역"],
  "05": ["IEAP","분석실"],
  "06": ["IEAB","통제실"],
  "07": ["IELP","전략 회의실"],
  "08": ["IELB","사건 기록 구역"],
  "09": ["OFAP","중앙 광장"],
  "10": ["OFAB","접경 구역"],
  "11": ["OFLP","통신 구역"],
  "12": ["OFLB","시간 기록 구역"],
  "13": ["OEAP","증언실"],
  "14": ["OEAB","봉인 서고"],
  "15": ["OELP","전환 통로"],
  "16": ["OELB","사후 접근 가능 구역"],
};

// Nodes: 16 타입 + 5 랜드마크 (✅ 광장 제거)
function makeNodes(){
  const nodes = [];
  const ring = [
    [50,18],[66,22],[78,34],[82,50],
    [78,66],[66,78],[50,82],[34,78],
    [22,66],[18,50],[22,34],[34,22],
    [50,30],[70,50],[50,70],[30,50]
  ];
  for (let i=1;i<=16;i++){
    const slotId = String(i).padStart(2,"0");
    const [x,y] = ring[i-1];
    nodes.push({ kind:"node", slotId, x, y });
  }

  // 랜드마크 5개 (광장 삭제)
  nodes.push({ kind:"landmark", label:"분수", x:56, y:46 });
  nodes.push({ kind:"landmark", label:"기숙사", x:18, y:78 });
  nodes.push({ kind:"landmark", label:"학생회관", x:82, y:22 });
  nodes.push({ kind:"landmark", label:"식당", x:80, y:78 });
  nodes.push({ kind:"landmark", label:"도서관", x:20, y:22 });

  return nodes;
}

// Puzzle pieces 4x4 (puzzle.png)
function buildPieces(layer){
  layer.innerHTML = "";
  const size = 25;
  for (let r=0;r<4;r++){
    for (let c=0;c<4;c++){
      const idx = r*4 + c + 1;
      const id = String(idx).padStart(2,"0");
      const el = document.createElement("div");
      el.className = "piece";
      el.dataset.slotId = id;
      el.style.left = `${c*size}%`;
      el.style.top = `${r*size}%`;
      el.style.width = `${size}%`;
      el.style.height = `${size}%`;
      el.style.backgroundPosition = `${c * (100/3)}% ${r * (100/3)}%`;
      layer.appendChild(el);
    }
  }
}
function updatePieces(layer, slotsMap){
  layer.querySelectorAll(".piece").forEach(p=>{
    const id = p.dataset.slotId;
    const s = slotsMap.get(id);
    if (s?.unlocked) p.classList.add("unlocked");
    else p.classList.remove("unlocked");
  });
}
function pulsePiece(layer, slotId){
  const p = layer.querySelector(`.piece[data-slot-id="${slotId}"]`);
  if (!p) return;
  p.classList.remove("pulse");
  void p.offsetWidth;
  p.classList.add("pulse");
}

// Load 16 slots
async function fetchSlots(db, roundIdStr){
  const out = new Map();
  for(let i=1;i<=16;i++){
    const id = String(i).padStart(2,"0");
    const snap = await slotRef(db, roundIdStr, id).get();
    if (snap.exists) out.set(id, snap.data());
    else {
      const [tc,pn] = FALLBACK_TYPE[id];
      out.set(id, { unlocked:false, typeCode:tc, positionName:pn });
    }
  }
  return out;
}

// unlocked-only submit
async function submitAnswer(db, roundIdStr, slotId, answerInput){
  const ref = slotRef(db, roundIdStr, slotId);
  await db.runTransaction(async (tx)=>{
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("slot missing");
    const data = snap.data();

    if (data.unlocked) return;

    const expected = normalize(data.answer || "");
    if (!expected) throw new Error("noanswer");

    const typed = normalize(answerInput);
    const correct = (typed === expected);
    if (!correct) throw new Error("wrong");

    tx.update(ref, {
      unlocked: true,
      unlockedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
}

// Final sequence (영화 오프닝 강) + 자동 이동
async function playFinalSequence({ mapWrap, nodesLayer, puzzleLayer, finalOverlay, finalDim, finalTitle, finalSub }){
  nodesLayer.style.pointerEvents = "none";

  await sleep(200);
  nodesLayer.style.opacity = "0";
  const svg = mapWrap.querySelector(".map-svg");
  if (svg) svg.style.opacity = "0";

  await sleep(500);
  puzzleLayer.classList.add("puzzle-sharpen");

  await sleep(500);
  finalTitle.textContent = "ACCESS GRANTED";
  finalSub.textContent = "CLEARANCE LEVEL: 01";
  finalOverlay.classList.add("on");
  finalDim.classList.add("on");

  await sleep(800);
  mapWrap.classList.add("fade-out");
  await sleep(200);
  location.href = "world.html";
}

document.addEventListener("DOMContentLoaded", async ()=>{
  const db = ensureFirebase();

  // Intro (ENTER)
  const intro = document.getElementById("intro");
  const enterBtn = document.getElementById("enterBtn");
  if (enterBtn && intro){
    enterBtn.onclick = ()=> intro.classList.add("off");
  }

  // HUD
  const roundBadge = document.getElementById("roundBadge");
  const progressBadge = document.getElementById("progressBadge");
  const refreshBtn = document.getElementById("refreshBtn");

  // Help
  const helpBtn = document.getElementById("helpBtn");
  const helpBackdrop = document.getElementById("helpBackdrop");
  const helpCloseBtn = document.getElementById("helpCloseBtn");

  // Stage
  const nodesLayer = document.getElementById("nodesLayer");
  const puzzleLayer = document.getElementById("puzzleLayer");
  const mapWrap = document.getElementById("mapWrap");

  // Answer modal (design2)
  const answerBackdrop = document.getElementById("answerBackdrop");
  const modalTitle = document.getElementById("modalTitle");
  const modalMeta = document.getElementById("modalMeta");
  const modalQuestion = document.getElementById("modalQuestion");
  const modalHint = document.getElementById("modalHint");
  const modalExplanation = document.getElementById("modalExplanation");
  const answerInput = document.getElementById("answerInput");
  const submitBtn = document.getElementById("submitBtn");
  const closeBtn = document.getElementById("closeBtn");

  // Final
  const finalOverlay = document.getElementById("finalOverlay");
  const finalDim = document.getElementById("finalDim");
  const finalTitle = document.getElementById("finalTitle");
  const finalSub = document.getElementById("finalSub");

  // Bindings
  if (refreshBtn) refreshBtn.onclick = ()=> location.reload();

  if (helpBtn && helpBackdrop) helpBtn.onclick = ()=> helpBackdrop.style.display = "flex";
  if (helpCloseBtn && helpBackdrop) helpCloseBtn.onclick = ()=> helpBackdrop.style.display = "none";
  if (helpBackdrop) helpBackdrop.addEventListener("click", (e)=>{ if (e.target === helpBackdrop) helpBackdrop.style.display = "none"; });

  if (closeBtn && answerBackdrop) closeBtn.onclick = ()=> answerBackdrop.style.display = "none";
  if (answerBackdrop) answerBackdrop.addEventListener("click", (e)=>{ if (e.target === answerBackdrop) answerBackdrop.style.display = "none"; });

  // Build puzzle
  buildPieces(puzzleLayer);
  const NODES = makeNodes();

  // active round
  let activeRoundStr = "R0001";
  try{
    const metaSnap = await metaRef(db).get();
    const data = metaSnap.exists ? metaSnap.data() : null;
    const ar = data?.activeRound || 1;
    activeRoundStr = roundId(ar);
  }catch(e){
    console.warn("meta read failed, fallback R0001", e);
  }
  if (roundBadge) roundBadge.textContent = `ROUND: ${activeRoundStr}`;

  // data
  const slots = await fetchSlots(db, activeRoundStr);

  // state
  let currentSlotId = null;
  let isFinalPlaying = false;

  function openModal(slotId){
    currentSlotId = slotId;
    const slot = slots.get(slotId) || {};
    const fallback = FALLBACK_TYPE[slotId] || ["", ""];
    const tc = slot.typeCode || fallback[0];
    const pn = slot.positionName || fallback[1];

    modalTitle.textContent = `NODE ${slotId}`;
    modalMeta.textContent = `${tc}${pn ? ` · ${pn}` : ""}`;
    modalQuestion.textContent = slot.question ? `Q. ${slot.question}` : "";
    modalHint.textContent = slot.hint ? `HINT. ${slot.hint}` : "";
    modalExplanation.textContent = "";
    answerInput.value = "";
    submitBtn.disabled = !!slot.unlocked;

    answerBackdrop.style.display = "flex";
  }

  async function handleSubmit(){
    const ans = (answerInput.value || "").trim();
    if (!ans){ alert("정답을 입력해줘."); return; }
    if (!currentSlotId) return;

    try{
      await submitAnswer(db, activeRoundStr, currentSlotId, ans);

      const snap = await slotRef(db, activeRoundStr, currentSlotId).get();
      if (snap.exists) slots.set(currentSlotId, snap.data());

      pulsePiece(puzzleLayer, currentSlotId);
      renderAll();

      answerBackdrop.style.display = "none";

      const unlockedCount = [...slots.values()].filter(s=>s.unlocked).length;
      if (unlockedCount === 16 && !isFinalPlaying){
        isFinalPlaying = true;
        await playFinalSequence({ mapWrap, nodesLayer, puzzleLayer, finalOverlay, finalDim, finalTitle, finalSub });
      }
    }catch(e){
      console.error(e);
      if ((e?.message || "") === "noanswer") {
        alert("아직 이 노드의 정답(answer)이 Firestore에 설정되지 않았습니다.");
      } else {
        alert("오답이거나 제출 실패. 힌트를 다시 확인해줘.");
      }
    }
  }
  submitBtn.onclick = handleSubmit;

  function renderAll(){
    nodesLayer.innerHTML = "";

    const unlockedCount = [...slots.values()].filter(s=>s.unlocked).length;
    if (progressBadge) progressBadge.textContent = `UNLOCKED: ${unlockedCount}/16`;

    for (const n of NODES){
      const el = document.createElement("div");
      el.style.left = `${n.x}%`;
      el.style.top = `${n.y}%`;

      if (n.kind === "landmark"){
        el.className = "landmark";
        el.innerHTML = `<span class="pn">${n.label}</span>`;
        nodesLayer.appendChild(el);
        continue;
      }

      const slot = slots.get(n.slotId) || {};
      const fallback = FALLBACK_TYPE[n.slotId] || ["", ""];
      const tc = slot.typeCode || fallback[0] || n.slotId;
      const pn = slot.positionName || fallback[1] || "";

      el.className = "node";
      el.dataset.state = slot.unlocked ? "unlocked" : "idle";
      el.innerHTML = `<span class="tc mono">${tc}</span><span class="pn">${pn || "구역"}</span>`;
      el.onclick = ()=> openModal(n.slotId);

      nodesLayer.appendChild(el);
    }

    updatePieces(puzzleLayer, slots);
  }

  renderAll();
});
