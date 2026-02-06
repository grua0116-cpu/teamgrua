import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAqwSJ7nXC-AsHp5ifllDzzGA_UBCWQhJE",
  authDomain: "teamgrua-f465c.firebaseapp.com",
  projectId: "teamgrua-f465c",
  storageBucket: "teamgrua-f465c.firebasestorage.app",
  messagingSenderId: "1019914743201",
  appId: "1:1019914743201:web:171550946aafb90ab96fe0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ====== UI refs ======
const gridEl = document.getElementById("grid");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");

// Modal refs
const lockModal = document.getElementById("lockModal");
const lockInput = document.getElementById("lockInput");
const modalMsg = document.getElementById("modalMsg");
const modalSub = document.getElementById("modalSub");
const modalCancel = document.getElementById("modalCancel");
const modalConfirm = document.getElementById("modalConfirm");
const modalX = document.getElementById("modalX");

// 선택 상태
let selectedSlotId = null;   // "01"~"16"
let selectedSlotRef = null;  // doc ref
let selectedClaimed = false;

// ====== helpers ======
const slotPath = (id) => `game/season1/slots/${id}`;
const pad2 = (n) => String(n).padStart(2, "0");

function setStatus(msg){
  statusEl.textContent = msg;
}

function openLockModal({ slotId, slotRef, claimed }) {
  selectedSlotId = slotId;
  selectedSlotRef = slotRef;
  selectedClaimed = !!claimed;

  modalMsg.textContent = "";
  lockInput.value = "";

  lockModal.classList.remove("hidden");
  lockModal.setAttribute("aria-hidden", "false");

  if (selectedClaimed) {
    modalSub.textContent = `FRAGMENT ${slotId} 는 이미 잠겨있어요.`;
    lockInput.disabled = true;
    modalConfirm.disabled = true;
  } else {
    modalSub.textContent = `FRAGMENT ${slotId} 를 잠그려면 암호를 입력하세요.`;
    lockInput.disabled = false;
    modalConfirm.disabled = false;
    setTimeout(() => lockInput.focus(), 0);
  }
}

function closeLockModal(){
  lockModal.classList.add("hidden");
  lockModal.setAttribute("aria-hidden", "true");
  selectedSlotId = null;
  selectedSlotRef = null;
  selectedClaimed = false;
}

// 모달 닫기 핸들러
lockModal.addEventListener("click", (e) => {
  if (e.target?.dataset?.close) closeLockModal();
});
modalCancel.addEventListener("click", closeLockModal);
modalX.addEventListener("click", closeLockModal);

lockInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") modalConfirm.click();
});

// ====== core logic ======
async function validateAnswer(slotRef, userCode) {
  const snap = await getDoc(slotRef);
  if (!snap.exists()) return false;

  const data = snap.data();
  const answer = (data.answer ?? "").toString();

  // 아주 단순 비교: 공백 trim + 대소문자 무시
  const a = answer.trim().toLowerCase();
  const u = userCode.trim().toLowerCase();
  return a.length > 0 && a === u;
}

async function claimSlot(slotRef) {
  // claimed=true 업데이트
  await updateDoc(slotRef, { claimed: true });
}

// ====== rendering ======
function makeTile(slotId, claimed){
  const tile = document.createElement("button");
  tile.className = `tile ${claimed ? "locked" : ""}`;
  tile.type = "button";
  tile.dataset.slotId = slotId;
  tile.setAttribute("aria-label", `Fragment ${slotId}`);

  tile.innerHTML = `
    <div class="tile-top">
      <div class="tile-id">FRAGMENT ${slotId}</div>
      <div class="badge ${claimed ? "locked" : "open"}">${claimed ? "LOCKED" : "OPEN"}</div>
    </div>
    <div class="tile-sub">${claimed ? "This fragment is locked." : "Click to lock with a code."}</div>
  `;

  // 이미 잠겼으면 클릭해도 “안내만” (원하면 아예 비활성화 가능)
  tile.addEventListener("click", async () => {
    const ref = doc(db, slotPath(slotId));
    // 최신 상태를 한번 더 보고 모달 띄움(동기화)
    try{
      const snap = await getDoc(ref);
      const nowClaimed = snap.exists() ? !!snap.data().claimed : false;
      openLockModal({ slotId, slotRef: ref, claimed: nowClaimed });
    }catch(e){
      console.error(e);
      setStatus("Fetch error.");
    }
  });

  return tile;
}

async function loadGrid(){
  setStatus("Loading...");
  gridEl.innerHTML = "";

  // 01~16 생성하면서 each getDoc
  // (최적화는 나중에: 지금은 단순 우선)
  const ids = Array.from({ length: 16 }, (_, i) => pad2(i + 1));

  for (const id of ids){
    const ref = doc(db, slotPath(id));
    try{
      const snap = await getDoc(ref);
      const claimed = snap.exists() ? !!snap.data().claimed : false;
      gridEl.appendChild(makeTile(id, claimed));
    }catch(e){
      console.error(e);
      gridEl.appendChild(makeTile(id, false));
    }
  }

  setStatus("Ready.");
}

refreshBtn.addEventListener("click", loadGrid);

// 모달 LOCK 버튼
modalConfirm.addEventListener("click", async () => {
  const userCode = (lockInput.value || "").trim();
  if (!userCode) {
    modalMsg.textContent = "암호를 입력해줘.";
    return;
  }
  if (!selectedSlotRef || !selectedSlotId) return;

  modalConfirm.disabled = true;
  modalMsg.textContent = "검증 중...";

  try{
    // 최신 상태 확인: 이미 claimed면 막기
    const latest = await getDoc(selectedSlotRef);
    const latestClaimed = latest.exists() ? !!latest.data().claimed : false;

    if (latestClaimed) {
      modalMsg.textContent = "이미 누가 잠갔어.";
      return;
    }

    const ok = await validateAnswer(selectedSlotRef, userCode);
    if (!ok) {
      modalMsg.textContent = "틀렸어. 다시 시도!";
      modalConfirm.disabled = false;
      lockInput.focus();
      return;
    }

    await claimSlot(selectedSlotRef);
    modalMsg.textContent = "LOCK 완료.";

    // 그리드 즉시 갱신
    await loadGrid();
    setTimeout(closeLockModal, 350);

  }catch(e){
    console.error(e);
    modalMsg.textContent = "에러. 잠시 후 다시.";
    modalConfirm.disabled = false;
  } finally {
    // claimed된 상태거나 닫히면 버튼은 어차피 못 누르지만, 안전하게 복구
    setTimeout(() => { modalConfirm.disabled = false; }, 400);
  }
});

// 초기 로드
loadGrid();
