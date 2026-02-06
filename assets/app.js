// assets/app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";


const firebaseConfig = {
  apiKey: "AIzaSyAqwSJ7nXC-AsHp5ifllDzzGA_UBCWQhJE",
  authDomain: "teamgrua-f465c.firebaseapp.com",
  projectId: "teamgrua-f465c",
  storageBucket: "teamgrua-f465c.firebasestorage.app",
  messagingSenderId: "1019914743201",
  appId: "1:1019914743201:web:171550946aafb90ab96fe0"
};


const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function slotRef(slot) {
  return doc(db, "game", "season1", "slots", slot);
}

export async function fetchSlot(slot) {
  const snap = await getDoc(slotRef(slot));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function fetchAllSlots() {
  const snaps = await getDocs(collection(db, "game", "season1", "slots"));
  const map = {};
  snaps.forEach(s => (map[s.id] = { id: s.id, ...s.data() }));
  return map;
}

export async function claimSlot(slot) {
  await updateDoc(slotRef(slot), { claimed: true });
}

