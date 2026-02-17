import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, doc, query, orderBy,
  onSnapshot, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

/** ✅ 1) Firebase 콘솔에서 복사한 firebaseConfig를 여기에 붙여넣어 */
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
const auth = getAuth(app);

// UI
const loginBtn = document.getElementById("loginBtn");
const userText = document.getElementById("userText");
const nameInput = document.getElementById("nameInput");
const refreshBtn = document.getElementById("refreshBtn");
const gridEl = document.getElementById("grid");
const detailEl = document.getElementById("detail");
const statusText = document.getElementById("statusText");
const finalEl = document.getElementById("final");

let uid = null;
let slots = [];
let selectedId = null;

// Firestore 경로: game/season1/slots
const slotsCol = collection(db, "game", "season1", "slots");
const q = query(slotsCol, orderBy("orderIndex", "asc"));

// 로그인
loginBtn.addEventListener("click", async () => {
  try {
    await signInAnonymously(auth);
  } catch (e) {
    alert("로그인 실패: " + (e?.message || e));
  }
});

onAuthStateChanged(auth, (user) => {
  uid = user?.uid || null;
  userText.textContent = uid ? `로그인됨 (uid: ${uid.slice(0, 6)}...)` : "미로그인";
});

// 새로고침 버튼(실시간이라 사실 필요 없지만, 안정용)
refreshBtn.addEventListener("click", () => {
  renderGrid();
  renderDetail();
});

// 실시간 구독
onSnapshot(q, (snap) => {
  slots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderGrid();
  renderDetail();
  renderFinalIfDone();
});

function renderGrid() {
  gridEl.innerHTML = "";
  const unlockedCount = slots.filter(s => !!s.unlocked).length;

  statusText.textContent =
    `해금 ${unlockedCount}/16 · 로그인 후 1칸 점유 → 정답 제출`;

  slots.forEach(s => {
    const tile = document.createElement("div");
    tile.className = `tile ${s.unlocked ? "unlocked" : "locked"} ${s.claimed ? "claimed" : ""}`;
    tile.innerHTML = `
      <div class="meta">#${s.orderIndex ?? "—"}</div>
      <div class="code">${escapeHtml(s.typeCode || s.id)}</div>
      <div class="meta">${s.claimed ? `점유: ${escapeHtml(s.claimerName || "")}` : "미점유"}</div>
      <div class="meta">${s.unlocked ? "해금됨" : "잠김"}</div>
    `;
    tile.onclick = () => { selectedId = s.id; renderDetail(); };
    gridEl.appendChild(tile);
  });
}

function renderDetail() {
  if (!selectedId) {
    detailEl.classList.add("hidden");
    detailEl.innerHTML = "";
    return;
  }

  const s = slots.find(x => x.id === selectedId);
  if (!s) return;

  detailEl.classList.remove("hidden");

  const hasLogin = !!uid;
  const hasName = !!(nameInput.value || "").trim();
  const canClaim = hasLogin && hasName && !s.claimed;
  const canAnswer = hasLogin && s.claimed && !s.unlocked; // 점유된 슬롯만 풀게(원하면 조건 완화 가능)

  detailEl.innerHTML = `
    <h2>${escapeHtml(s.typeCode || s.id)} 상세</h2>

    <div class="row">
      <div class="label">Question</div>
      <div class="box">${escapeHtml(s.question || "")}</div>
    </div>

    <div class="row">
      <div class="label">Hint</div>
      <div class="box">${escapeHtml(s.hint || "")}</div>
    </div>

    <div class="row">
      <div class="label">점유 상태</div>
      <div class="box">${s.claimed ? `이미 점유됨: ${escapeHtml(s.claimerName || "")}` : "미점유"}</div>
      <button id="claimBtn" ${canClaim ? "" : "disabled"}>내가 점유하기</button>
      <div class="muted">※ 1인 1타입 강제는 “자율 신뢰”로 운영 (uid 저장은 안 함)</div>
    </div>

    <div class="row">
      <div class="label">정답 입력</div>
      <input id="ansInput" placeholder="정답 입력" ${canAnswer ? "" : "disabled"} />
      <button id="submitBtn" ${canAnswer ? "" : "disabled"}>정답 제출 → 해금</button>
    </div>

    <div class="row">
      <div class="label">Explanation</div>
      <div class="box">${escapeHtml(s.explanation || "")}</div>
    </div>
  `;

  document.getElementById("claimBtn")?.addEventListener("click", () => claimSlot(s.id));
  document.getElementById("submitBtn")?.addEventListener("click", () => {
    const input = document.getElementById("ansInput").value;
    submitAnswer(s.id, input, s.answer || "");
  });
}

async function claimSlot(slotId) {
  const name = (nameInput.value || "").trim();
  if (!uid) return alert("먼저 로그인해줘.");
  if (!name) return alert("닉네임을 입력해줘.");

  const ref = doc(db, "game", "season1", "slots", slotId);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("슬롯 문서가 없어.");

      const data = snap.data();
      if (data.claimed) throw new Error("이미 누군가 점유했어.");

      tx.update(ref, {
        claimed: true,
        claimerName: name
      });
    });
    alert("점유 완료!");
  } catch (e) {
    alert(e?.message || String(e));
  }
}

async function submitAnswer(slotId, input, correctAnswer) {
  if (!uid) return alert("먼저 로그인해줘.");
  const userAns = (input || "").trim();
  if (!userAns) return alert("정답을 입력해줘.");

  // 자율 신뢰 검증: 공백 제거 + 소문자 비교
  const ok = normalize(userAns) === normalize(correctAnswer);
  if (!ok) return alert("오답!");

  const ref = doc(db, "game", "season1", "slots", slotId);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("슬롯 문서가 없어.");

      const data = snap.data();
      if (data.unlocked) return;

      tx.update(ref, { unlocked: true });
    });
    alert("정답! 해금됨!");
  } catch (e) {
    alert(e?.message || String(e));
  }
}

function renderFinalIfDone() {
  const unlockedCount = slots.filter(s => !!s.unlocked).length;
  if (unlockedCount === 16) {
    finalEl.classList.remove("hidden");
  } else {
    finalEl.classList.add("hidden");
  }
}

function normalize(s) {
  return String(s).toLowerCase().replace(/\s+/g, "");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
