console.log("🔥 GRUA app.js running (v2 unlocked-only)");

// 에러를 무반응으로 숨기지 않게
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

function ensureFirebase(){
  if (!window.firebase) throw new Error("firebase SDK not loaded (compat scripts missing)");
  if (!firebase.apps || firebase.apps.length === 0) firebase.initializeApp(firebaseConfig);
  return firebase.firestore();
}

// ---------- Helpers ----------
const SEASON = "season1";
function roundId(n){ return `R${String(n).padStart(4,"0")}`; }
function normalize(s){ return String(s).trim().toLowerCase().replace(/\s+/g," "); }
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

// ---------- Nodes (예시 배치: 16 타입 + 6 랜드마크 = 22) ----------
function makeDefaultNodes(){
  const nodes = [];
  const ring = [
    [50,18],[66,22],[78,34],[82,50],[78,66],[66,78],[50,82],[34,78],
    [22,66],[18,50],[22,34],[34,22],[50,30],[70,50],[50,70],[30,50]
  ];
  for (let i=1;i<=16;i++){
    const id = String(i).padStart(2,"0");
    const [x,y] = ring[i-1];
    nodes.push({ kind:"node", slotId:id, label:`${id}`, x, y });
  }
  nodes.push({ kind:"landmark", label:"광장", x:50, y:50 });
  nodes.push({ kind:"landmark", label:"분수", x:56, y:44 });
  nodes.push({ kind:"landmark", label:"기숙사", x:18, y:78 });
  nodes.push({ kind:"landmark", label:"학생회관", x:82, y:22 });
  nodes.push({ kind:"landmark", label:"식당", x:80, y:78 });
  nodes.push({ kind:"landmark", label:"도서관", x:20, y:22 });
  return nodes;
}

// ---------- Puzzle pieces ----------
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
  const pieces = layer.querySelectorAll(".piece");
  pieces.forEach(p=>{
    const id = p.dataset.slotId;
    const s = slotsMap.get(id);
    if (s?.unlocked) p.classList.add("unlocked");
    else p.classList.remove("unlocked");
  });
}

// ---------- Firestore paths ----------
function metaRef(db){
  return db.collection("game").doc(SEASON).collection("meta").doc("meta");
}
function slotRef(db, roundIdStr, slotId){
  return db.collection("game").doc(SEASON).collection("rounds").doc(roundIdStr)
           .collection("slots").doc(slotId);
}

// ---------- Slot auto-create (운영자 도구: UI 노출 없음 / 콘솔에서 __initSlots()로만 사용) ----------
window.__initSlots = async function(){
  const db = ensureFirebase();
  try{
    const roundIdStr = "R0001";
    for(let i=1;i<=16;i++){
      const id = String(i).padStart(2,"0");
      await slotRef(db, roundIdStr, id).set({
        unlocked:false,
        unlockedAt:null,
        typeCode:"T"+id,
        positionName:"Slot "+id,
        difficulty:"easy",
        orderIndex:i,
        question:"",
        hint:"",
        answer:"",
        explanation:""
      }, { merge:true });
    }
    alert("🔥 16개 슬롯 생성/초기화 완료!");
  }catch(e){
    console.error(e);
    alert("❌ 초기화 실패: " + (e?.message || e));
  }
};

// ---------- Main boot ----------
document.addEventListener("DOMContentLoaded", async ()=>{
  const db = ensureFirebase();

  const nodesLayer = document.getElementById("nodesLayer");
  const puzzleLayer = document.getElementById("puzzleLayer");
  const roundBadge = document.getElementById("roundBadge");
  const progressBadge = document.getElementById("progressBadge");
  const refreshBtn = document.getElementById("refreshBtn");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalTitle = document.getElementById("modalTitle");
  const modalMeta = document.getElementById("modalMeta");
  const modalHint = document.getElementById("modalHint");
  const answerInput = document.getElementById("answerInput");
  const submitBtn = document.getElementById("submitBtn");
  const closeBtn = document.getElementById("closeBtn");

  const finalOverlay = document.getElementById("finalOverlay");
  const finalDim = document.getElementById("finalDim");
  const finalTitle = document.getElementById("finalTitle");
  const finalSub = document.getElementById("finalSub");
  const mapWrap = document.getElementById("mapWrap");

  refreshBtn.onclick = ()=> location.reload();

  buildPieces(puzzleLayer);
  const NODES = makeDefaultNodes();

  // round load
  let activeRoundStr = "R0001";
  try{
    const metaSnap = await metaRef(db).get();
    const data = metaSnap.exists ? metaSnap.data() : null;
    const ar = data?.activeRound || 1;
    activeRoundStr = roundId(ar);
  }catch(e){
    console.warn("meta read failed, fallback R0001", e);
  }
  roundBadge.textContent = `ROUND: ${activeRoundStr}`;

  // slots fetch
  const slots = await fetchSlots(db, activeRoundStr);
  renderAll(slots);

  // modal state
  let currentSlotId = null;
  let currentSlot = null;
  let isFinalSequenceReady = false;

  function openModal(slotId){
    currentSlotId = slotId;
    currentSlot = slots.get(slotId);
    if (!currentSlot) return;

    modalTitle.textContent = `SLOT ${slotId} · ${currentSlot.positionName || ""}`;
    modalMeta.textContent = `${currentSlot.typeCode || ""} · 난이도: ${currentSlot.difficulty || "-"}`;
    modalHint.textContent = currentSlot.hint ? `HINT: ${currentSlot.hint}` : "";

    answerInput.value = "";

    const unlocked = !!currentSlot.unlocked;
    submitBtn.disabled = unlocked;

    modalBackdrop.style.display = "flex";
  }
  function closeModal(){ modalBackdrop.style.display = "none"; }
  closeBtn.onclick = closeModal;
  modalBackdrop.addEventListener("click", (e)=>{ if (e.target === modalBackdrop) closeModal(); });

  // submit (unlocked-only)
  submitBtn.onclick = async ()=>{
    const ans = (answerInput.value || "").trim();
    if (!ans){ alert("정답을 입력해줘."); return; }
    if (!currentSlotId) return;

    try{
      await submitAnswer(db, activeRoundStr, currentSlotId, ans);
      const snap = await slotRef(db, activeRoundStr, currentSlotId).get();
      slots.set(currentSlotId, snap.data());
      renderAll(slots);
      openModal(currentSlotId);

      const unlockedCount = [...slots.values()].filter(s=>s.unlocked).length;
      if (unlockedCount === 16 && !isFinalSequenceReady){
        isFinalSequenceReady = true;
        closeModal();
        await playFinalSequence({ mapWrap, nodesLayer, finalOverlay, finalDim, finalTitle, finalSub, puzzleLayer });

        // v2.0: 자동 이동 금지. 퍼즐(오버레이) 클릭 시 world.html 이동.
        finalOverlay.addEventListener("click", ()=>{ location.href = "world.html"; }, { once:true });
        // 퍼즐 조각 위도 클릭되게(안전)
        finalOverlay.style.pointerEvents = "auto";
      }
    }catch(e){
      console.error(e);
      alert("오답이거나 제출 실패. 힌트를 다시 확인해줘.");
    }
  };

  // render
  function renderAll(slotsMap){
    nodesLayer.innerHTML = "";
    const unlockedCount = [...slotsMap.values()].filter(s=>s.unlocked).length;
    progressBadge.textContent = `UNLOCKED: ${unlockedCount}/16`;

    for (const n of NODES){
      const el = document.createElement("div");
      el.className = n.kind === "landmark" ? "landmark" : "node";
      el.style.left = `${n.x}%`;
      el.style.top = `${n.y}%`;
      el.textContent = n.label;

      if (n.kind !== "landmark"){
        const slot = slotsMap.get(n.slotId);
        const state = slot?.unlocked ? "unlocked" : "idle";
        el.dataset.state = state;
        el.onclick = ()=> openModal(n.slotId);
      }
      nodesLayer.appendChild(el);
    }

    updatePieces(puzzleLayer, slotsMap);
  }
});

async function fetchSlots(db, roundIdStr){
  const out = new Map();
  for(let i=1;i<=16;i++){
    const id = String(i).padStart(2,"0");
    const snap = await slotRef(db, roundIdStr, id).get();
    if (snap.exists) out.set(id, snap.data());
    else out.set(id, { unlocked:false, positionName:`Slot ${id}` });
  }
  return out;
}

// ---------- Transactions (unlocked-only) ----------
async function submitAnswer(db, roundIdStr, slotId, answerInput){
  const ref = slotRef(db, roundIdStr, slotId);
  await db.runTransaction(async (tx)=>{
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("slot missing");
    const data = snap.data();

    if (data.unlocked) return;

    const correct = normalize(answerInput) === normalize(data.answer || "");
    if (!correct) throw new Error("wrong");

    tx.update(ref, {
      unlocked: true,
      unlockedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
}

// ---------- Final sequence ----------
async function playFinalSequence({ mapWrap, nodesLayer, finalOverlay, finalDim, finalTitle, finalSub, puzzleLayer }){
  nodesLayer.style.pointerEvents = "none";

  await sleep(150);
  nodesLayer.style.opacity = "0";
  const svg = mapWrap.querySelector(".map-svg");
  if (svg) svg.style.opacity = "0";
  puzzleLayer.classList.add("puzzle-sharpen");

  await sleep(650);
  finalTitle.textContent = "ACCESS GRANTED";
  finalSub.textContent = "CLICK TO ENTER";
  finalOverlay.classList.add("on");
  finalDim.classList.add("on");

  await sleep(600);
  // 자동 이동 없음
}
