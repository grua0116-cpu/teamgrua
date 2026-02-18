console.log("🔥 GRUA app.js running (design2 / unlocked-only)");

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

// ===== Helpers =====
const SEASON = "season1";
function roundId(n){ return `R${String(n).padStart(4,"0")}`; }
function normalize(s){ return String(s).trim().toLowerCase().replace(/\s+/g," "); }
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

// ===== Firestore paths =====
function metaRef(db){
  return db.collection("game").doc(SEASON).collection("meta").doc("meta");
}
function slotRef(db, roundIdStr, slotId){
  return db.collection("game").doc(SEASON).collection("rounds").doc(roundIdStr)
           .collection("slots").doc(slotId);
}

// ===== Node spec (16 타입 + 6 랜드마크) =====
// slotId(01~16)는 퍼즐 조각 매핑용으로 유지.
// label은 "타입코드 · 장소"로 표시.
function makeNodesV2(){
  // 임시 좌표(기존 링 유지) + v2 라벨/아이콘 형태
  const ring = [
    [50,18],[66,22],[78,34],[82,50],[78,66],[66,78],[50,82],[34,78],
    [22,66],[18,50],[22,34],[34,22],[50,30],[70,50],[50,70],[30,50]
  ];

  // ⚠️ 여기 typeCode/positionName은 Firestore 값이 우선. (없을 때만 fallback)
  const fallbackType = [
    "IFAP","IFAL","IFBP","IFBL",
    "OFAP","OFAL","OFBP","OFBL",
    "IELP","IELB","IECP","IECB",
    "OELP","OELB","OECP","OECB"
  ];

  const nodes = [];
  for (let i=1;i<=16;i++){
    const slotId = String(i).padStart(2,"0");
    const [x,y] = ring[i-1];
    nodes.push({
      kind:"node",
      slotId,
      x, y,
      fallbackTypeCode: fallbackType[i-1] || ("T"+slotId),
      fallbackPlace: `구역 ${slotId}`,
      icon: "⌬"
    });
  }

  // 랜드마크 6개 (타입 대체 아님)
  nodes.push({ kind:"landmark", label:"광장", x:50, y:54 });
  nodes.push({ kind:"landmark", label:"분수", x:56, y:46 });
  nodes.push({ kind:"landmark", label:"기숙사", x:18, y:78 });
  nodes.push({ kind:"landmark", label:"학생회관", x:82, y:22 });
  nodes.push({ kind:"landmark", label:"식당", x:80, y:78 });
  nodes.push({ kind:"landmark", label:"도서관", x:20, y:22 });

  return nodes;
}

// ===== Puzzle pieces (4x4) =====
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

// ===== 운영자 초기화 도구 (UI 노출 없음 / 콘솔에서 __initSlots()) =====
window.__initSlots = async function(){
  const db = ensureFirebase();
  try{
    const roundIdStr = "R0001";
    for(let i=1;i<=16;i++){
      const id = String(i).padStart(2,"0");
      await slotRef(db, roundIdStr, id).set({
        unlocked:false,
        unlockedAt:null,
        // 아래는 Firestore에서 운영자가 채우는 편집 가능 필드
        typeCode:"",
        positionName:"",
        difficulty:"",
        orderIndex:i,
        question:"",
        hint:"",
        answer:"",
        explanation:""
      }, { merge:true });
    }
    alert("🔥 16개 슬롯 초기화 완료 (unlocked=false)");
  }catch(e){
    console.error(e);
    alert("❌ 초기화 실패: " + (e?.message || e));
  }
};

// ===== Main =====
document.addEventListener("DOMContentLoaded", async ()=>{
  const db = ensureFirebase();

  const nodesLayer = document.getElementById("nodesLayer");
  const puzzleLayer = document.getElementById("puzzleLayer");
  const roundBadge = document.getElementById("roundBadge");
  const progressBadge = document.getElementById("progressBadge");

  const intro = document.getElementById("intro");
  const enterBtn = document.getElementById("enterBtn");

  const helpBtn = document.getElementById("helpBtn");
  const helpBackdrop = document.getElementById("helpBackdrop");
  const helpCloseBtn = document.getElementById("helpCloseBtn");

  const refreshBtn = document.getElementById("refreshBtn");

  const answerBackdrop = document.getElementById("answerBackdrop");
  const modalTitle = document.getElementById("modalTitle");
  const modalMeta = document.getElementById("modalMeta");
  const modalQuestion = document.getElementById("modalQuestion");
  const modalHint = document.getElementById("modalHint");
  const modalExplanation = document.getElementById("modalExplanation");
  const answerInput = document.getElementById("answerInput");
  const submitBtn = document.getElementById("submitBtn");
  const closeBtn = document.getElementById("closeBtn");

  const finalOverlay = document.getElementById("finalOverlay");
  const finalDim = document.getElementById("finalDim");
  const finalTitle = document.getElementById("finalTitle");
  const finalSub = document.getElementById("finalSub");
  const mapWrap = document.getElementById("mapWrap");

  // UI bindings
  enterBtn.onclick = ()=> intro.classList.add("off");
  refreshBtn.onclick = ()=> location.reload();

  helpBtn.onclick = ()=> helpBackdrop.style.display = "flex";
  helpCloseBtn.onclick = ()=> helpBackdrop.style.display = "none";
  helpBackdrop.addEventListener("click", (e)=>{ if (e.target === helpBackdrop) helpBackdrop.style.display = "none"; });

  function openAnswerModal(slotId, slot){
    modalTitle.textContent = `NODE ${slotId} · ${slot.typeCode || ""}`;
    modalMeta.textContent = `${slot.positionName || ""}${slot.difficulty ? ` · 난이도: ${slot.difficulty}` : ""}`;

    // Firestore 편집 가능 필드 표시
    modalQuestion.textContent = slot.question ? `Q. ${slot.question}` : "";
    modalHint.textContent = slot.hint ? `HINT. ${slot.hint}` : "";
    modalExplanation.textContent = ""; // 정답 후에만 보여주려면 여기 유지

    answerInput.value = "";
    submitBtn.disabled = !!slot.unlocked;

    answerBackdrop.style.display = "flex";
  }
  function closeAnswerModal(){ answerBackdrop.style.display = "none"; }
  closeBtn.onclick = closeAnswerModal;
  answerBackdrop.addEventListener("click", (e)=>{ if (e.target === answerBackdrop) closeAnswerModal(); });

  buildPieces(puzzleLayer);

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
  roundBadge.textContent = `ROUND: ${activeRoundStr}`;

  // load slots
  const slots = await fetchSlots(db, activeRoundStr);

  // nodes data
  const NODES = makeNodesV2();

  // state
  let currentSlotId = null;
  let isFinalReady = false;

  // render
  function renderAll(){
    nodesLayer.innerHTML = "";

    const unlockedCount = [...slots.values()].filter(s=>s.unlocked).length;
    progressBadge.textContent = `UNLOCKED: ${unlockedCount}/16`;

    for (const n of NODES){
      const el = document.createElement("div");
      el.className = (n.kind === "landmark") ? "landmark" : "node";
      el.style.left = `${n.x}%`;
      el.style.top = `${n.y}%`;

      if (n.kind === "landmark"){
        el.innerHTML = `<span class="tag"><span class="dot"></span><b>${n.label}</b></span>`;
        nodesLayer.appendChild(el);
        continue;
      }

      const slot = slots.get(n.slotId) || {};
      const typeCode = slot.typeCode || n.fallbackTypeCode;
      const place = slot.positionName || n.fallbackPlace;

      el.dataset.state = slot.unlocked ? "unlocked" : "idle";
      el.innerHTML = `<span class="tag"><span class="dot"></span><b>${typeCode}</b> · ${place}</span>`;
      el.onclick = ()=>{
        currentSlotId = n.slotId;
        openAnswerModal(n.slotId, slot);
      };
      nodesLayer.appendChild(el);
    }

    updatePieces(puzzleLayer, slots);
  }

  renderAll();

  // submit (unlocked-only)
  submitBtn.onclick = async ()=>{
    const ans = (answerInput.value || "").trim();
    if (!ans){ alert("정답을 입력해줘."); return; }
    if (!currentSlotId) return;

    try{
      await submitAnswer(db, activeRoundStr, currentSlotId, ans);

      const snap = await slotRef(db, activeRoundStr, currentSlotId).get();
      if (snap.exists) slots.set(currentSlotId, snap.data());

      renderAll();

      // 잠깐 해설 보여주고 닫고 싶으면 여기서 처리 가능 (현재는 닫기만)
      closeAnswerModal();

      const unlockedCount = [...slots.values()].filter(s=>s.unlocked).length;
      if (unlockedCount === 16 && !isFinalReady){
        isFinalReady = true;
        await playFinalSequence({ mapWrap, nodesLayer, finalOverlay, finalDim, finalTitle, finalSub, puzzleLayer });

        // v2 합의: 클릭 시 world.html 이동
        finalOverlay.addEventListener("click", ()=>{ location.href = "world.html"; }, { once:true });
      }
    }catch(e){
      console.error(e);
      alert("오답이거나 제출 실패. 힌트를 다시 확인해줘.");
    }
  };
});

// ===== data =====
async function fetchSlots(db, roundIdStr){
  const out = new Map();
  for(let i=1;i<=16;i++){
    const id = String(i).padStart(2,"0");
    const snap = await slotRef(db, roundIdStr, id).get();
    if (snap.exists) out.set(id, snap.data());
    else out.set(id, { unlocked:false, question:"", hint:"", answer:"", explanation:"" });
  }
  return out;
}

// ===== transactions (unlocked-only) =====
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

// ===== final sequence =====
async function playFinalSequence({ mapWrap, nodesLayer, finalOverlay, finalDim, finalTitle, finalSub, puzzleLayer }){
  nodesLayer.style.pointerEvents = "none";

  await sleep(150);
  nodesLayer.style.opacity = "0";
  const svg = mapWrap.querySelector(".map-svg");
  if (svg) svg.style.opacity = "0";
  puzzleLayer.classList.add("puzzle-sharpen");

  await sleep(650);
  finalTitle.textContent = "ACCESS GRANTED";
  finalSub.innerHTML = "퍼즐이 전면 공개되었습니다.<br/>클릭하여 기관 브리핑으로 이동";
  finalOverlay.classList.add("on");
  finalDim.classList.add("on");

  // 자동 이동 없음
}

function normalize(s){ return String(s).trim().toLowerCase().replace(/\s+/g," "); }
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
