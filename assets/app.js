import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** 1) 너 프로젝트 설정값으로 교체 */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

/** 2) Firestore 경로 고정 */
const PATH = {
  game: "game",
  season: "season1",
  slots: "slots",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM
const board = document.getElementById("board");
const statusEl = document.getElementById("status");

const backdrop = document.getElementById("modalBackdrop");
const modalTitle = document.getElementById("modalTitle");
const modalSub = document.getElementById("modalSub");
const modalClose = document.getElementById("modalClose");
const answerInput = document.getElementById("answerInput");
const submitBtn = document.getElementById("submitBtn");
const modalMsg = document.getElementById("modalMsg");

// state
let currentTileId = null;
let currentDocRef = null;
let currentAnswer = null;
let currentClaimed = false;

function slotDocRef(tileId2) {
  // tileId2: "01"~"16"
  return doc(db, PATH.game, PATH.season, PATH.slots, tileId2);
}

function id2(i) {
  return String(i).padStart(2, "0");
}

function tilePosition(i) {
  // i: 1~16, 01 = 좌상단
  const idx = i - 1;
  const r = Math.floor(idx / 4);
  const c = idx % 4;
  return { top: `${r * 25}%`, left: `${c * 25}%` };
}

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.style.color = kind === "bad" ? "var(--bad)"
                     : kind === "good" ? "var(--good)"
                     : "var(--text)";
}

function openModal(tileId2, docRef, answer, claimed) {
  currentTileId = tileId2;
  currentDocRef = docRef;
  currentAnswer = (answer ?? "").trim();
  currentClaimed = !!claimed;

  modalTitle.textContent = `TILE ${tileId2}`;
  modalSub.textContent = claimed ? "이미 열린 타일입니다." : "정답을 입력하세요";
  modalMsg.textContent = "";
  modalMsg.className = "msg";

  answerInput.value = "";
  answerInput.disabled = claimed;
  submitBtn.disabled = claimed;

  backdrop.classList.remove("hidden");
  if (!claimed) answerInput.focus();
}

function closeModal() {
  backdrop.classList.add("hidden");
  currentTileId = null;
  currentDocRef = null;
  currentAnswer = null;
  currentClaimed = false;
}

function markRevealed(tileId2) {
  const el = document.querySelector(`.tileMask[data-id="${tileId2}"]`);
  if (el) el.classList.add("revealed");
}

async function ensureDocExists(tileId2) {
  // 문서 없으면 기본값으로 생성(개발 편의)
  const ref = slotDocRef(tileId2);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { answer: "", claimed: false });
    return { answer: "", claimed: false, _created: true };
  }
  return snap.data();
}

async function buildBoard() {
  board.innerHTML = "";

  // 16개 마스크 생성
  for (let i = 1; i <= 16; i++) {
    const tileId2 = id2(i);
    const pos = tilePosition(i);

    const mask = document.createElement("div");
    mask.className = "tileMask";
    mask.dataset.id = tileId2;
    mask.style.top = pos.top;
    mask.style.left = pos.left;

    mask.addEventListener("click", async () => {
      try {
        setStatus(`타일 ${tileId2} 확인 중…`);
        const ref = slotDocRef(tileId2);
        const data = await ensureDocExists(tileId2);

        // claimed true면 바로 열림 처리
        if (data.claimed) markRevealed(tileId2);

        openModal(tileId2, ref, data.answer, data.claimed);
        setStatus(`타일 ${tileId2} 준비됨`);
      } catch (e) {
        console.error(e);
        setStatus("에러: Firestore 연결/권한 확인 필요", "bad");
      }
    });

    board.appendChild(mask);
  }

  // 초기 로딩: claimed 상태 반영
  await refreshClaimed();
}

async function refreshClaimed() {
  let opened = 0;

  for (let i = 1; i <= 16; i++) {
    const tileId2 = id2(i);
    try {
      const ref = slotDocRef(tileId2);
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data()?.claimed) {
        opened++;
        markRevealed(tileId2);
      }
    } catch (e) {
      // 일부 실패해도 계속 진행
      console.warn("refreshClaimed fail:", tileId2, e);
    }
  }

  setStatus(`열림 ${opened}/16`);
}

function normalize(s) {
  return String(s ?? "").trim();
}

async function submitAnswer() {
  if (!currentDocRef || !currentTileId) return;

  const input = normalize(answerInput.value);
  if (!input) {
    modalMsg.textContent = "정답을 입력해줘.";
    modalMsg.className = "msg bad";
    return;
  }

  // 정답 비교(대소문자/공백만 처리: 필요하면 여기서 더 완화 가능)
  const ok = normalize(input).toLowerCase() === normalize(currentAnswer).toLowerCase();

  if (!ok) {
    modalMsg.textContent = "틀림. 다시 시도!";
    modalMsg.className = "msg bad";
    return;
  }

  try {
    submitBtn.disabled = true;
    answerInput.disabled = true;
    modalMsg.textContent = "정답! 타일을 여는 중…";
    modalMsg.className = "msg good";

    await updateDoc(currentDocRef, { claimed: true });

    markRevealed(currentTileId);
    setStatus(`타일 ${currentTileId} 열림!`, "good");

    setTimeout(closeModal, 450);
    await refreshClaimed();
  } catch (e) {
    console.error(e);
    modalMsg.textContent = "업데이트 실패(권한/규칙 확인 필요)";
    modalMsg.className = "msg bad";
    submitBtn.disabled = false;
    answerInput.disabled = false;
  }
}

// modal events
modalClose.addEventListener("click", closeModal);
backdrop.addEventListener("click", (e) => {
  if (e.target === backdrop) closeModal();
});
submitBtn.addEventListener("click", submitAnswer);
answerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitAnswer();
});

// start
(async () => {
  try {
    setStatus("초기화 중…");
    await buildBoard();
    setStatus("준비 완료");
  } catch (e) {
    console.error(e);
    setStatus("초기화 실패: 설정값/권한 확인", "bad");
  }
})();
