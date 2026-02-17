console.log("🔥 assets/app.js running");

document.addEventListener("DOMContentLoaded", function(){

  const status = document.getElementById("jsStatus");
  if (status) status.textContent = "JS: OK";

  // =========================
  // Firebase 초기화
  // =========================
  const firebaseConfig = {
    apiKey: "AIzaSyAqwSJ7nXC-AsHp5ifllDzzGA_UBCWQhJE",
    authDomain: "teamgrua-f465c.firebaseapp.com",
    projectId: "teamgrua-f465c",
    storageBucket: "teamgrua-f465c.firebasestorage.app",
    messagingSenderId: "1019914743201",
    appId: "1:1019914743201:web:171550946aafb90ab96fe0"
  };

  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();

  // =========================
  // 슬롯 16개 자동 생성
  // =========================
  const initBtn = document.getElementById("initSlotsBtn");

  if(initBtn){
    initBtn.onclick = async function(){

      initBtn.disabled = true;
      initBtn.textContent = "생성 중...";

      try{

        for(let i=1;i<=16;i++){

          const id = String(i).padStart(2,"0");

          await db
            .collection("game")
            .doc("season1")
            .collection("rounds")
            .doc("R0001")
            .collection("slots")
            .doc(id)
            .set({
              claimed:false,
              unlocked:false,
              claimerName:"",
              claimedAt:null,
              unlockedAt:null,
              typeCode:"T"+id,
              positionName:"Slot "+id,
              difficulty:"easy",
              orderIndex:i,
              question:"",
              hint:"",
              answer:"",
              explanation:""
            }, { merge:true });

        }

        alert("🔥 16개 슬롯 생성 완료!");
        location.reload();

      }catch(e){
        console.error(e);
        alert("❌ 생성 실패: " + e.message);
      }

      initBtn.disabled = false;
      initBtn.textContent = "슬롯 16개 자동 생성";
    };
  }

});
