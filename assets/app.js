// app.js (ES Module) - "슬롯 자동 생성 버튼"은 부팅 실패해도 항상 작동

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc,
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
   2) Helpers / Paths
========================= */
const SEASON = "season1";

function roundId(n){
  const s = String(n).padStart(4,"0");
  return `R${s}`;
}
function slotDocRef(roundIdStr, slotId){
  return doc(db, "game", SEASON, "rounds", roundIdStr, "slots", slotId);
}
async function getActiveRoundId(){
  initFirebase();
  // ✅ Firestore 구조: game/season1/meta/meta
  const metaRef = doc(db, "game", SEASON, "meta", "meta");
  const metaSnap = await getDoc(metaRef);
  if (!metaSnap.exists()) throw new Error("meta missing");
  const { activeRound } = metaSnap.data();
  return roundId(activeRound || 1);
}

/* =========================
   3) 슬롯 16개 자동 생성 (복붙 대체)
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
      { merge: true } // ✅ 이미 있으면 필드 보완/덮어쓰기
    );
  }
}

/* =========================
   4) 버튼 연결은 "부팅 전에" 무조건 붙인다
========================= */
function setBadge(id, text){
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function bindInitButton(){
  const btn = document.getElementById("initSlotsBtn");
  if (!btn) return;

  // 이미 연결돼 있으면 중복 방지
  if (btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.onclick = async ()=>{
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = "생성 중...";

    try{
      await createInitialSlots("R0001");
      alert("🔥 16개 슬롯 생성 완료! (R0001)");
      location.reload();
    }catch(e){
      console.error(e);
      alert("슬롯 생성 실패: " + (e?.message || e));
    }finally{
      btn.disabled = false;
      btn.textContent = old;
    }
  };
}

/* =========================
   5) Index 부팅
========================= */
const isIndex = location.pathname.endsWith("index.html") || location.pathname.endsWith("/");
if (isIndex){
  initFirebase();

  // ✅ DOM 로드되면 버튼부터 무조건 연결
  window.addEventListener("DOMContentLoaded", ()=>{
    bindInitButton();
  });

  // 부팅 진행
  bootIndex().catch((e)=>{
    console.error(e);
    // 부팅이 죽어도 버튼은 살아있어야 함
    bindInitButton();
    // 표시만 살짝 남김 (알림은 과도하면 스트레스라 최소화)
    setBadge("roundBadge", "ROUND: -");
  });
}

async function bootIndex(){
  // 요소
  const roundBadge = document.getElementById("roundBadge");
  const progressBadge = document.getElementById("progressBadge");
  const refreshBtn = document.getElementById("refreshBtn");
  const nodesLayer = document.getElementById("nodesLayer");
  const puzzleLayer = document.getElementById("puzzleLayer");

  // 여기서 null이면 페이지 구조가 다름 → 그래도 버튼은 동작해야 하므로 throw
  if (!roundBadge || !progressBadge || !refreshBtn || !nodesLayer || !puzzleLayer){
    throw new Error("index.html 요소(id) 불일치");
  }

  // 버튼 연결(혹시 DOMContentLoaded보다 빨리 도착했을 때)
  bindInitButton();

  refreshBtn.onclick = ()=> location.reload();

  // 퍼즐 조각 생성
  buildPieces(puzzleLayer);

  // 라운드 표시(실패해도 R0001로 운영 가능)
  let activeRound = "R0001";
  try{
    activeRound = await getActiveRoundId();
  }catch(e){
    console.warn("meta read failed, fallback R0001", e);
  }
  roundBadge.textContent = `ROUND: ${activeRound}`;

  // 슬롯 읽어서 진행률 표시 (없으면 0/16)
  const slots = await fetchSlots(activeRound);
  const unlockedCount = [...slots.values()].filter(s=>s.unlocked).length;
  progressBadge.textContent = `UNLOCKED: ${unlockedCount}/16`;

  // 노드 렌더(아주 최소)
  nodesLayer.innerHTML = "";
  for (let i=1;i<=16;i++){
    const id = String(i).padStart(2,"0");
    const el = document.createElement("div");
    el.className = "node";
    el.style.left = `${10 + (i%4)*22}%`;
    el.style.top = `${12 + (Math.floor((i-1)/4))*22}%`;
    el.textContent = id;
    nodesLayer.appendChild(el);
  }
}

async function fetchSlots(roundIdStr){
  const out = new Map();
  for (let i=1;i<=16;i++){
    const id = String(i).padStart(2,"0");
    const snap = await getDoc(slotDocRef(roundIdStr, id));
    if (snap.exists()) out.set(id, snap.data());
    else out.set(id, { claimed:false, unlocked:false });
  }
  return out;
}

/* =========================
   6) Puzzle pieces (최소)
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
      el.style.backgroundImage = `url("puzzle.png")`;
      el.style.backgroundSize = "400% 400%";
      el.style.backgroundPosition = `${c * (100/3)}% ${r * (100/3)}%`;
      layer.appendChild(el);
    }
  }
}
