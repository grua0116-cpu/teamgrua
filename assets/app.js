console.log("🔥 GRUA FINAL BUILD running");

// Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAqwSJ7nXC-AsHp5ifllDzzGA_UBCWQhJE",
  authDomain: "teamgrua-f465c.firebaseapp.com",
  projectId: "teamgrua-f465c",
  storageBucket: "teamgrua-f465c.firebasestorage.app",
  messagingSenderId: "1019914743201",
  appId: "1:1019914743201:web:171550946aafb90ab96fe0"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const SEASON = "season1";
const ROUND = "R0001";

function normalize(s){
  return String(s).trim().toLowerCase().replace(/\s+/g," ");
}

function slotRef(id){
  return db.collection("game").doc(SEASON)
    .collection("rounds").doc(ROUND)
    .collection("slots").doc(id);
}

// ---------- 타입 정의 ----------
const TYPE_MAP = {
  "01": ["IFAP", "기록 보관 구역"],
  "02": ["IFAB", "관측 구역"],
  "03": ["IFLP", "창작 구역"],
  "04": ["IFLB", "전시 구역"],
  "05": ["IEAP", "분석실"],
  "06": ["IEAB", "통제실"],
  "07": ["IELP", "전략 회의실"],
  "08": ["IELB", "사건 기록 구역"],
  "09": ["OFAP", "중앙 광장"],
  "10": ["OFAB", "접경 구역"],
  "11": ["OFLP", "통신 구역"],
  "12": ["OFLB", "시간 기록 구역"],
  "13": ["OEAP", "증언실"],
  "14": ["OEAB", "봉인 서고"],
  "15": ["OELP", "전환 통로"],
  "16": ["OELB", "사후 접근 가능 구역"]
};

// ---------- 노드 배치 ----------
function makeNodes(){
  const nodes = [];
  const ring = [
    [50,18],[66,22],[78,34],[82,50],[78,66],[66,78],[50,82],[34,78],
    [22,66],[18,50],[22,34],[34,22],[50,30],[70,50],[50,70],[30,50]
  ];
  for (let i=1;i<=16;i++){
    const id = String(i).padStart(2,"0");
    const [x,y] = ring[i-1];
    const [code,name] = TYPE_MAP[id];
    nodes.push({ slotId:id, label:`${code}\n${name}`, x,y });
  }
  return nodes;
}

// ---------- 퍼즐 ----------
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
      el.style.backgroundPosition = `${c*(100/3)}% ${r*(100/3)}%`;
      layer.appendChild(el);
    }
  }
}

function updatePieces(layer, slots){
  layer.querySelectorAll(".piece").forEach(p=>{
    const id = p.dataset.slotId;
    if (slots.get(id)?.unlocked) p.classList.add("unlocked");
    else p.classList.remove("unlocked");
  });
}

// ---------- 슬롯 불러오기 ----------
async function fetchSlots(){
  const map = new Map();
  for (let i=1;i<=16;i++){
    const id = String(i).padStart(2,"0");
    const snap = await slotRef(id).get();
    map.set(id, snap.exists ? snap.data() : { unlocked:false });
  }
  return map;
}

// ---------- 메인 ----------
document.addEventListener("DOMContentLoaded", async ()=>{

  const nodesLayer = document.getElementById("nodesLayer");
  const puzzleLayer = document.getElementById("puzzleLayer");
  const progressBadge = document.getElementById("progressBadge");
  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalTitle = document.getElementById("modalTitle");
  const modalHint = document.getElementById("modalHint");
  const answerInput = document.getElementById("answerInput");
  const submitBtn = document.getElementById("submitBtn");
  const closeBtn = document.getElementById("closeBtn");

  buildPieces(puzzleLayer);
  const NODES = makeNodes();
  let slots = await fetchSlots();

  function render(){
    nodesLayer.innerHTML = "";
    let unlockedCount = 0;

    for (const n of NODES){
      const el = document.createElement("div");
      el.className = "node";
      el.style.left = `${n.x}%`;
      el.style.top = `${n.y}%`;
      el.style.whiteSpace = "pre-line";
      el.textContent = n.label;

      const slot = slots.get(n.slotId);
      if (slot?.unlocked){
        el.dataset.state = "unlocked";
        unlockedCount++;
      }

      el.onclick = ()=>{
        modalTitle.textContent = n.label;
        modalHint.textContent = slot?.hint ? `HINT: ${slot.hint}` : "";
        answerInput.value = "";
        modalBackdrop.style.display = "flex";

        submitBtn.onclick = async ()=>{
          const typed = normalize(answerInput.value);
          if (!slot?.answer){
            alert("아직 정답이 설정되지 않았습니다.");
            return;
          }
          if (typed !== normalize(slot.answer)){
            alert("오답입니다.");
            return;
          }
          await slotRef(n.slotId).update({
            unlocked:true,
            unlockedAt:firebase.firestore.FieldValue.serverTimestamp()
          });
          slots = await fetchSlots();
          render();
          modalBackdrop.style.display = "none";

          if ([...slots.values()].filter(s=>s.unlocked).length === 16){
            location.href = "world.html";
          }
        };
      };

      nodesLayer.appendChild(el);
    }

    progressBadge.textContent = `UNLOCKED: ${unlockedCount}/16`;
    updatePieces(puzzleLayer, slots);
  }

  closeBtn.onclick = ()=> modalBackdrop.style.display = "none";
  render();
});
