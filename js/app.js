import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/* Firebase config */
const firebaseConfig = {
  apiKey: "AIzaSyAqwSJ7nXC-AsHp5ifllDzzGA_UBCWQhJE",
  authDomain: "teamgrua-f465c.firebaseapp.com",
  projectId: "teamgrua-f465c",
  storageBucket: "teamgrua-f465c.firebasestorage.app",
  messagingSenderId: "1019914743201",
  appId: "1:1019914743201:web:171550946aafb90ab96fe0"
};

/* Initialize Firebase */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* UI */
const grid = document.getElementById("grid");
const status = document.getElementById("status");

const modal = document.getElementById("lockModal");
const lockInput = document.getElementById("lockInput");
const modalMsg = document.getElementById("modalMsg");
const modalSub = document.getElementById("modalSub");
const cancelBtn = document.getElementById("cancelBtn");
const lockBtn = document.getElementById("lockBtn");

let currentId = null;
let currentRef = null;

/* Modal */
function openModal(id, ref, claimed){
  currentId = id;
  currentRef = ref;
  modal.classList.remove("hidden");
  lockInput.value = "";
  modalMsg.textContent = "";

  if(claimed){
    modalSub.textContent = "이미 잠긴 조각입니다.";
    lockInput.disabled = true;
    lockBtn.disabled = true;
  }else{
    modalSub.textContent = "암호를 입력하면 이 조각을 잠급니다.";
    lockInput.disabled = false;
    lockBtn.disabled = false;
    lockInput.focus();
  }
}

cancelBtn.onclick = () => modal.classList.add("hidden");

/* Lock */
lockBtn.onclick = async () => {
  const code = lockInput.value.trim();
  if(!code) return;

  const snap = await getDoc(currentRef);
  if(!snap.exists()) return;

  const { answer, claimed } = snap.data();
  if(claimed){
    modalMsg.textContent = "이미 잠김";
    return;
  }

  if(code.toLowerCase() !== String(answer).toLowerCase()){
    modalMsg.textContent = "틀림";
    return;
  }

  await updateDoc(currentRef, { claimed:true });
  modalMsg.textContent = "LOCKED";
  load();
  setTimeout(()=>modal.classList.add("hidden"), 400);
};

/* Load grid */
async function load(){
  grid.innerHTML = "";
  for(let i=1;i<=16;i++){
    const id = String(i).padStart(2,"0");
    const ref = doc(db, `game/season1/slots/${id}`);
    const snap = await getDoc(ref);
    const claimed = snap.exists() && snap.data().claimed;

    const tile = document.createElement("div");
    tile.className = "tile" + (claimed?" locked":"");
    tile.innerHTML = `
      <div class="tile-id">FRAGMENT ${id}</div>
      <div class="tile-sub">${claimed?"LOCKED":"CLICK TO LOCK"}</div>
    `;
    tile.onclick = () => openModal(id, ref, claimed);
    grid.appendChild(tile);
  }
}

/* Start */
load();
