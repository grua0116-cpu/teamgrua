import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, doc, query, orderBy,
  onSnapshot, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** ✅ Firebase 콘솔에서 복사한 firebaseConfig를 여기에 붙여넣기 */
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

// Firestore 경로: game/season1/slots (01~16)
const slotsCol = collection(db, "game", "season1", "slots");
const q = query(slotsCol, orderBy("orderIndex", "asc"));

// UI
const statusText = document.getElementById("statusText");
const boardEl = document.getElementById("board");
const detailEl = document.getElementById("detail");
const nodesEl = document.getElementById("nodes");
const linesSvg = document.getElementById("campusLines");

let slots = [];
let selectedId = null;

/**
 * 🎓 캠퍼스맵 노드 배치 좌표
 * - x,y: 0~1000 / 0~520 (svg viewBox 기준)
 * - label은 “건물 약자” 느낌 (원하면 변경)
 */
const NODE_LAYOUT = [
  { idx: 1,  x: 110, y: 120, label: "GATE" },
  { idx: 2,  x: 220, y: 95,  label: "ADMIN" },
  { idx: 3,  x: 345, y: 140, label: "LIB" },
  { idx: 4,  x: 470, y: 110, label: "HALL" },

  { idx: 5,  x: 140, y: 260, label: "LAB" },
  { idx: 6,  x: 280, y: 240, label: "ART" },
  { idx: 7,  x: 420, y: 260, label: "STU" },
  { idx: 8,  x: 560, y: 235, label: "CAFÉ" },

  { idx: 9,  x: 170, y: 395, label: "GYM" },
  { idx: 10, x: 320, y: 390, label: "DORM" },
  { idx: 11, x: 470, y: 400, label: "STAGE" },
  { idx: 12, x: 620, y: 385, label: "PARK" },

  { idx: 13, x: 760, y: 120, label: "OBS" },
  { idx: 14, x: 820, y: 245, label: "TOWER" },
  { idx: 15, x: 880, y: 380, label: "PORT" },
  { idx: 16, x: 700, y: 320, label: "ARCH" },
];

// “캠퍼스 동선” 느낌 연결선 (원하면 수정)
const EDGES = [
  [1,2],[2,3],[3,4],
  [1,5],[2,6],[3,7],[4,8],
  [5,6],[6,7],[7,8],
  [5,9],[6,10],[7,11],[8,12],
  [4,13],[8,14],[12,15],[11,16],
];

// 실시간 구독
onSnapshot(q, (snap) => {
  slots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
