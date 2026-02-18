console.log("🔥 GRUA app.js (NO MAP) running");

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

function metaRef(db){
  return db.collection("game").doc(SEASON).collection("meta").doc("meta");
}
function slotRef(db, roundIdStr, slotId){
  return db.collection("game").doc(SEASON).collection("rounds").doc(roundIdStr)
           .collection("slots").doc(slotId);
}

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

// ✅ 광장 랜드마크 없음 (타입 OFAP “중앙 광장”은 유지)
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

  // 랜드마크 5개
  nodes.push({ kind:"landmark", label:"분수", x:56, y:46 });
  nodes.push({ kind:"landmark", label:"기숙사", x:18, y:78 });
  nodes.push({ kind:"landmark", label:"학생회관", x:82, y:22 });
  nodes.push({ kind:"landmark", label:"식당", x:80, y:78 });
  nodes.push({ kind:"landmark", label:"도서관", x:20, y:22 });

  return nodes;
}

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
    if (typed !== expected) throw new Error("wrong");

    tx.update(ref, {
      unlocked: true,
      unlockedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
}

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
}

document.addEventListener("DOMContentLoaded", async ()=>{
  const db = ensureFirebase();

  // ENTER
  const intro = document.getElementById("intro");
  const enterBtn = document.getElementById("enterBtn");
  enterBtn.onclick = ()=> intro.classList.add("off");

  // HUD
  const roundBadge = document.getElementById("roundBadge");
  const progressBadge = document.getElementById("progressBadge");
  document.getElementById("refreshBtn").onclick = ()=> location.reload();

  // Help
  const helpBackdrop = document.getElementById("helpBackdrop");
  document.getElementById("helpBtn").onclick = ()=> helpBackdrop.style.display = "flex";
  document.getElementById("helpCloseBtn").onclick = ()=> helpBackdrop.style.display = "none";
  helpBackdrop.addEventListener("click", (e)=>{ if (e.target === helpBackdrop) helpBackdrop.style.display = "none"; });

  // Stage
  const nodesLayer = document.getElementById("nodesLayer");
  const puzzleLayer = document.getElementById("puzzleLayer");
  const mapWrap = document.getElementById("mapWrap");

  // Modal
  const answerBackdrop = document.getElementById("answerBackdrop");
  const modalTitle = document.getElementById("modalTitle");
  const modalMeta = document.getElementById("modalMeta");
  const modalQuestion = document.getElementById("modalQuestion");
  const modalHint = document.getElementById("modalHint");
  const modalExplanation = document.getElementById("modalExplanation");
  const answerInput = document.getElementById("answerInput");
  const submitBtn = document.getElementById("submitBtn");
  document.getElementById("closeBtn").onclick = ()=> answerBackdrop.style.display = "none";
  answerBackdrop.addEventListener("click", (e)=>{ if (e.target === answerBackdrop) answerBackdrop.style.display = "none"; });

  // Final
  const finalOverlay = document.getElementById("finalOverlay");
  const finalDim = document.getElementById("finalDim");
  const finalTitle = document.getElementById("finalTitle");
  const finalSub = document.getElementById("finalSub");

  buildPieces(puzzleLayer);
  const NODES = makeNodes();

  // active round
  let activeRoundStr = "R0001";
  try{
    const metaSnap = await metaRef(db).get();
    const data = metaSnap.exists ? metaSnap.data() : null;
    const ar = data?.activeRound || 1;
    activeRoundStr = roundId(ar);
  }catch(e){}
  roundBadge.textContent = `ROUND: ${activeRoundStr}`;

  const slots = await fetchSlots(db, activeRoundStr);

  let currentSlotId = null;
  let isFinalPlaying = false;

  function openModal(slotId){
    currentSlotId = slotId;
    const slot = slots.get(slotId) || {};
    const fallback = FALLBACK_TYPE[slotId] || ["",""];
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

  submitBtn.onclick = async ()=>{
    const ans = (answerInput.value || "").trim();
    if (!ans){ alert("정답을 입력해줘."); return; }
    if (!currentSlotId) return;

    try{
      await submitAnswer(db, activeRoundStr, currentSlotId, ans);
      const snap = await slotRef(db, activeRoundStr, currentSlotId).get();
      if (snap.exists) slots.set(currentSlotId, snap.data());

      renderAll();
      answerBackdrop.style.display = "none";

      const unlockedCount = [...slots.values()].filter(s=>s.unlocked).length;
     if (unlockedCount === 16 && !isFinalPlaying){
  isFinalPlaying = true;

  // 연출 실행(노드/선/랜드마크 숨기고 퍼즐 선명하게)
  await playFinalSequence({ mapWrap, nodesLayer, puzzleLayer, finalOverlay, finalDim, finalTitle, finalSub });

  // ✅ 합의대로: 퍼즐 전체를 클릭하면 WORLD로 이동
  puzzleLayer.style.pointerEvents = "auto";
  puzzleLayer.style.cursor = "pointer";

  // 혹시 퍼즐 조각 div들이 클릭을 먹는 경우 대비해서 "캡처"로 받기
  const goWorld = () => { location.href = "world.html"; };

  // 중복 등록 방지
  puzzleLayer.onclick = goWorld;

  // 안내(원하면 빼도 됨)
  alert("퍼즐이 완성되었습니다. 퍼즐 이미지를 클릭하면 다음 단계로 이동합니다.");
}


  function renderAll(){
    nodesLayer.innerHTML = "";
    const unlockedCount = [...slots.values()].filter(s=>s.unlocked).length;
    progressBadge.textContent = `UNLOCKED: ${unlockedCount}/16`;

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
      const fallback = FALLBACK_TYPE[n.slotId] || ["",""];
      const tc = slot.typeCode || fallback[0] || n.slotId;
      const pn = slot.positionName || fallback[1] || "";

      el.className = "node";
      el.dataset.state = slot.unlocked ? "unlocked" : "idle";
      el.innerHTML = `<span class="tc">${tc}</span><span class="pn">${pn || "구역"}</span>`;
      el.onclick = ()=> openModal(n.slotId);

      nodesLayer.appendChild(el);
    }

    updatePieces(puzzleLayer, slots);
  }

  renderAll();
});
