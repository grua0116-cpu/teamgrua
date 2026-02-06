import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getFirestore, doc, onSnapshot, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

/**
 * ✅ 너가 바꿔야 하는 유일한 부분: firebaseConfig
 * Firebase 콘솔 → Project settings → Your apps(Web) → SDK setup and configuration에서 복사
 */
const firebaseConfig = {
  // apiKey: "…",
  // authDomain: "…",
  // projectId: "…",
  // storageBucket: "…",
  // messagingSenderId: "…",
  // appId: "…"
};

const SLOT_COUNT = 16;
const PATH = (id) => doc(db, "game/season1/slots", id);

const pad2 = (n) => String(n).padStart(2, "0");

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const grid = document.getElementById("grid");
const msg = document.getElementById("msg");
const openBtn = document.getElementById("open");
const progress = document.getElementById("progress");

const slotStates = {}; // {"01":{claimed...}, ...}

function log(line) {
  msg.textContent = line;
}

function updateUI() {
  grid.innerHTML = "";

  let claimedCount = 0;

  for (let i = 1; i <= SLOT_COUNT; i++) {
    const id = pad2(i);
    const data = slotStates[id];

    const claimed = !!data?.claimed;
    if (claimed) claimedCount++;

    const btn = document.createElement("button");
    btn.className = "slot" + (claimed ? " locked" : "");
    btn.disabled = claimed;

    const title = claimed ? `FRAGMENT ${id} — LOCKED` : `FRAGMENT ${id}`;
    const sub = claimed
      ? `already claimed · irreversible`
      : `tap to claim · first come, first served`;

    btn.innerHTML = `<div class="t">${title}</div><div class="s">${sub}</div>`;

    btn.onclick = async () => {
      log(`SYSTEM: attempting claim FRAGMENT ${id}…`);
      try {
        await claimSlot(id);
        log(`SYSTEM: FRAGMENT ${id} CLAIMED.\nThis action is irreversible.`);
      } catch (e) {
        log(`SYSTEM: denied.\nReason: already claimed (or rule blocked).`);
      }
    };

    grid.appendChild(btn);
  }

  progress.textContent = `${String(claimedCount).padStart(2, "0")}/16 CLAIMED`;

  const complete = claimedCount === SLOT_COUNT;
  openBtn.disabled = !complete;
  openBtn.onclick = () => (location.href = "./scenario/");
}

async function claimSlot(id) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("no-auth");

  const ref = doc(db, "game/season1/slots", id);

  // ✅ 선착순 핵심: 트랜잭션
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data();
    if (!cur) throw new Error("missing-doc");
    if (cur.claimed) throw new Error("claimed");

    tx.update(ref, {
      claimed: true,
      claimedBy: uid,
      claimedAt: Date.now()
    });
  });
}

function subscribeSlots() {
  for (let i = 1; i <= SLOT_COUNT; i++) {
    const id = pad2(i);
    const ref = doc(db, "game/season1/slots", id);

    onSnapshot(ref, (snap) => {
      slotStates[id] = snap.data();
      updateUI();
    });
  }
  log("SYSTEM: connected.\nWaiting for claims…");
}

onAuthStateChanged(auth, (user) => {
  if (user) subscribeSlots();
});

signInAnonymously(auth).catch(() => {
  log("SYSTEM: auth failed.\nCheck: Firebase Auth → Anonymous enabled AND authorized domain set.");
});
