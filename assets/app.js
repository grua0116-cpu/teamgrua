console.log("🔥 assets/app.js running");
window.jsTest = () => alert("✅ JS 실행 OK");
document.addEventListener("DOMContentLoaded", ()=>{
  const s = document.getElementById("jsStatus");
  if (s) s.textContent = "JS: OK";
});


// app.js (NO MODULE) - 무조건 화면에 "JS: OK" 찍고, jsTest 함수 제공

console.log("🔥 app.js loaded");

window.jsTest = function(){
  alert("✅ 2번: JS 함수 호출 OK (app.js 실행 중)");
};

document.addEventListener("DOMContentLoaded", function(){
  const s = document.getElementById("jsStatus");
  if (s) s.textContent = "JS: OK";
});
