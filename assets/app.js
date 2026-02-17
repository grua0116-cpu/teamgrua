// app.js (NO MODULE VERSION)

// ===== 1) JS 로드 확인 =====
console.log("🔥 app.js loaded");

document.addEventListener("DOMContentLoaded", function(){

  const jsBtn = document.getElementById("jsBtn");
  if(jsBtn){
    jsBtn.onclick = function(){
      alert("✅ app.js 정상 실행됨");
    };
  }

  const initBtn = document.getElementById("initSlotsBtn");
  if(initBtn){
    initBtn.onclick = function(){
      alert("🔥 버튼 정상 연결됨 (이제 Firestore 붙이면 됨)");
    };
  }

});
