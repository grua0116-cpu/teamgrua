// app.js - JS 로드 여부만 확인하는 초간단 파일

window.__APP_LOADED__ = true;

window.addEventListener("DOMContentLoaded", ()=>{
  const jsBtn = document.getElementById("jsBtn");
  if (jsBtn){
    jsBtn.onclick = ()=> alert("✅ app.js 로드/실행됨 (JS 클릭 인식)");
  }
});
