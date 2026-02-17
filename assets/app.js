// app.js (ES Module)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =========================
   1) Firebase 설정
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyAqwSJ7nXC-AsHp5ifllDzzGA_UBCWQhJE",
  authDomain: "teamgrua-f465c.firebaseapp.com",
  projectId: "teamgrua-f465c",
  storageBucket: "teamgrua-f465c.firebasestorage.app",
  messagingSenderId: "1019914743201",
  appId: "1:1019914743201:web:171550946aafb90ab96fe0"
};

let app, db;
function initFirebase(){
  if (db) return;
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

/* =========================
   2) Season / Path helpers
========================= */
const SEASON = "season1";

async function getActiveRoundId(){
  initFirebase();
  // ✅ Firestore 구조: game/season1/meta/meta
  const metaRef = doc(db, "game", SEASON, "meta", "meta");
  const metaSnap = await getDoc(metaRef);
  if (!metaSnap.exists()) throw new Error("meta missing");
  const { activeRound } = metaSnap.data();
  return roundId(activeRound || 1);
}
function roundId(n){
  const s = String(n).padStart(4,"0");
  return `R${s}`;
}
function slotDocRef(roundIdStr, slotId){
  return doc(db, "game", SEASON, "rounds", roundIdStr, "slots", slotId);
}

/* =========================
   3) Boot index page
========================= */
const isIndex = location.pathname.endsWith("index.html") || location.pathname.endsWith("/");
if (isIndex){
  initFirebase();
  bootIndex().catch((e)=>{
    console.error(e);
    alert("부팅 실패: " + (e?.message || e));
  });
}

async function bootIndex(){
  const nodesLayer = document.getElementById("nodesLayer");
  const puzzleLayer = document.getElementById("puzzleLayer");
  const roundBadge = document.getElementById("roundBadge");
  const progressBadge = document.getElementById("progressBadge");
  const refreshBtn = document.getElementById("refreshBtn");
  const initSlotsBtn = document.getElementById("initSlotsBtn");

  // modal
  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalTitle = document.getElementById("modalTitle");
  const modalMeta = document.getElementById("modalMeta");
  const nameInput = document.getElementById("nameInput");
  const answerInput = document.getElementById("answerInput");
  const claimBtn = document.getElementById("claimBtn");
  const submitBtn = document.getElementById("submitBtn");
  const closeBtn = document.getElementById("closeBtn");
  const modalHint = document.getElementById("modalHint");

  // final sequence
  const finalOverlay = document.getElementById("finalOverlay");
  const finalDim = document.getElementById("finalDim");
  const finalTitle = document.getElementById("finalTitle");
  const finalSub = document.getElementById("finalSub");
  const mapWrap = document.getElementById("mapWrap");

  refreshBtn.onclick = async () => location.reload();

  // 🔥 초보용: 버튼 클릭으로 슬롯 16개 자동 생성
  initSlotsBtn.onclick = async () => {
    initSlotsBtn.disabled = true;
    initSlotsBtn.textContent = "생성 중...";
    try{
      await createInitialSlots("R0001");
      alert("🔥 16개 슬롯 생성 완료!");
      location.reload();
    }catch(e){
      console.error(e);
      alert("슬롯 생성 실패: " + (e?.message || e));
    }finally{
      initSlotsBtn.disabled = false;
      initSlotsBtn.textContent = "슬롯 16개 자동 생성";
    }
  };

  // Build 16 puzzle pieces overlay
  buildPieces(puzzleLayer);

  const NODES = makeDefaultNodes();

  // round + slot load
  let activeRound = "R0001";
  try{
    activeRound = await getActiveRoundId();
  }catch(e){
    // meta가 안 읽혀도 슬롯 생성 버튼은 쓸 수 있게 R0001 fallback
    console.warn("meta read failed, fallback R0001", e);
  }
  roundBadge.textContent = `ROUND: ${activeRound}`;

  const slots = await fetchSlots(activeRound);
  renderAll(slots);

  // Modal handlers
  let currentSlotId = null;
  let currentSlot = null;
  let isFinalSequencePlaying = false;

  function openModal(slotId){
    currentSlotId = slotId;
    currentSlot = slots.get(slotId);
    if (!currentSlot) return;

    modalTitle.textContent = `SLOT ${slotId} · ${currentSlot.positionName || ""}`;
    modalMeta.textContent = `${currentSlot.typeCode || ""} · 난이도: ${currentSlot.difficulty || "-"}`;
    modalHint.textContent = currentSlot.hint ? `HINT: ${currentSlot.hint}` : "";
    answerInput.value = "";
    nameInput.value = (localStorage.getItem("grua_name") || "");

    const claimed = !!currentSlot.claimed;
    const unlocked = !!currentSlot.unlocked;
    claimBtn.disabled = unlocked || claimed;
    submitBtn.disabled = unlocked || !claimed;

    modalBackdrop.style.display = "flex";
  }
  function closeModal(){ modalBackdrop.style.display = "none"; }
  closeBtn.onclick = closeModal;
  modalBackdrop.addEventListener("click", (e)=>{ if (e.target === modalBackdrop) closeModal(); });

  // Claim
  claimBtn.onclick = async ()=>{
    const nm = (nameInput.value || "").trim();
    if (!nm){ alert("닉네임을 입력해줘."); return; }
    localStorage.setItem("grua_name", nm);
    if (!currentSlotId) return;

    try{
      await claimSlot(activeRound, currentSlotId, nm);
      const updated = await getDoc(slotDocRef(activeRound, currentSlotId));
      slots.set(currentSlotId, updated.data());
      renderAll(slots);
      openModal(currentSlotId);
    }catch(e){
      console.error(e);
      alert("이미 누군가 점유했거나 오류가 발생했어.");
    }
  };

  // Submit answer
  submitBtn.onclick = async ()=>{
    const ans = (answerInput.value || "").trim();
    if (!ans){ alert("정답을 입력해줘."); return; }
    if (!currentSlotId) return;

    try{
      await submitAnswer(activeRound, currentSlotId, ans);
      const updated = await getDoc(slotDocRef(activeRound, currentSlotId));
      slots.set(currentSlotId, updated.data());
      renderAll(slots);
      openModal(currentSlotId);

      const unlockedCount = [...slots.values()].filter(s=>s.unlocked).length;
      if (unlockedCount === 16 && !isFinalSequencePlaying){
        isFinalSequencePlaying = true;
        closeModal();
        await playFinalSequence({ mapWrap, nodesLayer, finalOverlay, finalDim, finalTitle, finalSub, puzzleLayer });
        location.href = "world.html";
      }
    }catch(e){
      console.error(e);
      alert("오답이거나 제출 실패. 힌트를 다시 확인해줘.");
    }
  };

  function renderAll(slotsMap){
    nodesLayer.innerHTML = "";
    const unlockedCount = [...slotsMap.values()].filter(s=>s.unlocked).length;
    progressBadge.textContent = `UNLOCKED: ${unlockedCount}/16`;

    for (const n of NODES){
      const slot = slotsMap.get(n.slotId);
      const el = document.createElement("div");
      el.className = n.kind === "landmark" ? "landmark" : "node";
      el.style.left = `${n.x}%`;
      el.style.top = `${n.y}%`;
      el.textContent = n.label;

      if (n.kind !== "landmark"){
        const state = slot?.unlocked ? "unlocked" : slot?.claimed ? "claimed" : "idle";
        el.dataset.state = state;
        el.onclick = ()=> openModal(n.slotId);
      }else{
        el.onclick = ()=>{};
      }
      nodesLayer.appendChild(el);
    }
    updatePieces(puzzleLayer, slotsMap);
  }

  async function fetchSlots(roundIdStr){
    const out = new Map();
    for (let i=1;i<=16;i++){
      const id = String(i).padStart(2,"0");
      const snap = await getDoc(slotDocRef(roundIdStr, id));
      if (snap.exists()) out.set(id, snap.data());
      else out.set(id, { claimed:false, unlocked:false, positionName:`Slot ${id}` });
    }
    return out;
  }
}

/* =========================
   4) Nodes (예시)
========================= */
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

/* =========================
   5) Puzzle pieces
========================= */
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

/* =========================
   6) Slot auto-create (복붙 대체)
   - 문서 01~16 + 필드 전부 생성
========================= */
async function createInitialSlots(roundIdStr){
  initFirebase();
  for (let i=1;i<=16;i++){
    const id = String(i).padStart(2,"0");
    await setDoc(
      slotDocRef(roundIdStr, id),
      {
        claimed: false,
        unlocked: false,
        claimerName: "",
        claimedAt: null,
        unlockedAt: null,

        typeCode: "T" + id,
        positionName: "Slot " + id,
        difficulty: "easy",
        orderIndex: i,

        question: "",
        hint: "",
        answer: "",
        explanation: ""
      },
      { merge: true } // ✅ 이미 있으면 덮어쓰기/보완
    );
  }
}

/* =========================
   7) Claim + Submit
========================= */
async function claimSlot(roundIdStr, slotId, claimerName){
  initFirebase();
  const ref = slotDocRef(roundIdStr, slotId);
  await runTransaction(db, async (tx)=>{
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("slot missing");
    const data = snap.data();
    if (data.unlocked) throw new Error("already unlocked");
    if (data.claimed) throw new Error("already claimed");
    tx.update(ref, { claimed:true, claimerName, claimedAt: serverTimestamp() });
  });
}

async function submitAnswer(roundIdStr, slotId, answerInput){
  initFirebase();
  const ref = slotDocRef(roundIdStr, slotId);
  await runTransaction(db, async (tx)=>{
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("slot missing");
    const data = snap.data();
    if (!data.claimed) throw new Error("not claimed");
    if (data.unlocked) return;

    const correct = normalize(answerInput) === normalize(data.answer || "");
    if (!correct) throw new Error("wrong");

    tx.update(ref, { unlocked:true, unlockedAt: serverTimestamp() });
  });
}
function normalize(s){
  return String(s).trim().toLowerCase().replace(/\s+/g," ");
}

/* =========================
   8) Final sequence (단계 연출)
========================= */
async function playFinalSequence({ mapWrap, nodesLayer, finalOverlay, finalDim, finalTitle, finalSub, puzzleLayer }){
  nodesLayer.style.pointerEvents = "none";

  await sleep(150);
  nodesLayer.style.opacity = "0";
  const svg = mapWrap.querySelector(".map-svg");
  if (svg) svg.style.opacity = "0";
  puzzleLayer.classList.add("puzzle-sharpen");

  await sleep(650);
  finalTitle.textContent = "ACCESS GRANTED";
  finalSub.textContent = "CLEARANCE LEVEL: 01";
  finalOverlay.classList.add("on");
  finalDim.classList.add("on");

  await sleep(600);
  mapWrap.classList.add("fade-out");
  await sleep(200);
}
function sleep(ms){ return new Promise(res=>setTimeout(res, ms)); }
