// ─────────────────────────────────────────────────────────────────────────
//  GlobalStyles.jsx  —  CivilCheck Partner Portal design system
//  File #1 of the redesign. Poora design system (colors, fonts, buttons,
//  cards, chips, tables, sidebar, modal, toast...) yahan ek hi jagah hai.
//
//  USAGE:
//    src/main.jsx mein sabse upar import + render karo:
//
//      import GlobalStyles from './styles/GlobalStyles'
//      ...
//      <StrictMode>
//        <GlobalStyles />
//        <App />
//      </StrictMode>
//
//  Baaki saari files (Icon, ui, Layout, pages) inhi classes/variables ko
//  use karengi — isliye ye pehli file hai.
// ─────────────────────────────────────────────────────────────────────────

export default function GlobalStyles() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Inter:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap');

:root{
  --ink:#101f33; --ink-2:#1c3049; --ink-3:#33475f;
  --paper:#F4F1EA; --paper-2:#ECE7DA;
  --surface:#FFFFFF; --surface-2:#FAF8F3;
  --seal:#B0812F; --seal-2:#caa04c; --seal-soft:#F4E9CF;
  --verified:#137a56; --verified-soft:#E1F1E9;
  --danger:#B33A28; --danger-soft:#F7E5E1;
  --amber:#B67A12; --amber-soft:#FBEED0;
  --blue:#2b5c8f; --blue-soft:#E4EDF5;
  --muted:#6C7686; --line:#E7E1D3; --line-2:#DCD5C4;
  --sidebar:#12233a;
  --shadow:0 1px 2px rgba(16,31,51,.05),0 10px 30px -16px rgba(16,31,51,.2);
  --shadow-lg:0 30px 70px -30px rgba(16,31,51,.4);
  --r:16px;
  --disp:"Bricolage Grotesque",system-ui,sans-serif;
  --body:"Inter","Noto Sans Devanagari",system-ui,sans-serif;
  --dev:"Noto Sans Devanagari","Inter",sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
body{font-family:var(--body);color:var(--ink);background:var(--paper);line-height:1.45;-webkit-font-smoothing:antialiased}
#root{min-height:100%}
:lang(hi),.dev{font-family:var(--dev)}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
input,select,textarea{font-family:inherit;font-size:14.5px}
a{color:inherit}
h1,h2,h3,h4{font-family:var(--disp);letter-spacing:-.02em;line-height:1.1}
.muted{color:var(--muted)} .small{font-size:13px} .xs{font-size:11.5px}
::selection{background:var(--seal-soft)}
::-webkit-scrollbar{width:9px;height:9px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:99px}

.eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--seal)}

/* ============ SEAL (govt-document logo motif) ============ */
.seal{border-radius:50%;position:relative;display:grid;place-items:center;flex:none;
  background:radial-gradient(circle at 35% 30%,#d8b25f,var(--seal));color:#231402;
  box-shadow:0 8px 22px -8px rgba(176,129,47,.7),inset 0 2px 4px rgba(255,255,255,.4)}
.seal::before{content:"";position:absolute;inset:5px;border-radius:50%;border:1.5px dashed rgba(35,20,2,.45)}
.seal svg{width:44%;height:44%}
.seal.lg{width:72px;height:72px} .seal.sm{width:34px;height:34px} .seal.sm::before{inset:3px}

/* ============ BUTTONS ============ */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;padding:13px 20px;border-radius:12px;font-weight:600;font-size:14.5px;transition:transform .12s,box-shadow .2s,background .2s;white-space:nowrap}
.btn:active{transform:scale(.98)}
.btn-block{display:flex;width:100%}
.btn-primary{background:var(--ink);color:#fff;box-shadow:0 10px 22px -12px rgba(16,31,51,.6)}
.btn-primary:disabled{opacity:.4;cursor:not-allowed}
.btn-seal{background:linear-gradient(180deg,#c8963e,var(--seal));color:#241503;box-shadow:0 10px 22px -12px rgba(176,129,47,.8)}
.btn-ghost{background:var(--surface);border:1.5px solid var(--line-2);color:var(--ink)}
.btn-light{background:var(--paper-2);color:var(--ink)}
.btn-danger{background:var(--danger-soft);color:var(--danger)}
.btn-sm{padding:8px 14px;font-size:13px;border-radius:9px}
.btn-white{background:#fff;color:var(--ink)}

/* ============ FIELDS ============ */
.field{margin-bottom:15px}
.field label{display:block;font-size:12.5px;font-weight:600;margin-bottom:7px;color:var(--ink-2)}
.req{color:var(--danger)} .opt{color:var(--muted);font-weight:500}
.control{width:100%;padding:12px 14px;border-radius:11px;background:var(--surface);border:1.5px solid var(--line-2);color:var(--ink);transition:border .18s,box-shadow .18s}
.control:focus{outline:none;border-color:var(--ink);box-shadow:0 0 0 4px rgba(16,31,51,.08)}
.control::placeholder{color:#aab2bd}
select.control{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' fill='none' stroke='%236C7686' stroke-width='2'%3E%3Cpath d='M6 8l4 4 4-4'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
textarea.control{resize:vertical}
.row{display:flex;gap:14px} .row>*{flex:1}

/* ============ CHIPS / BADGES ============ */
.chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.02em}
.chip.green{background:var(--verified-soft);color:var(--verified)} .chip.amber{background:var(--amber-soft);color:#8a5c0e}
.chip.red{background:var(--danger-soft);color:var(--danger)} .chip.ink{background:var(--paper-2);color:var(--ink-2)}
.chip.seal{background:var(--seal-soft);color:#7d5a15} .chip.blue{background:var(--blue-soft);color:var(--blue)}

.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow)}
.divider{height:1px;background:var(--line);margin:16px 0}

/* ============ OTP ============ */
.otp{display:flex;gap:10px;justify-content:center;margin:6px 0}
.otp input{width:52px;height:60px;text-align:center;font-size:24px;font-weight:700;border-radius:12px;border:1.5px solid var(--line-2);background:var(--surface)}
.otp input:focus{outline:none;border-color:var(--ink);box-shadow:0 0 0 4px rgba(16,31,51,.08)}

/* ============ AUTH (centered pages) ============ */
.auth{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;
  background:radial-gradient(circle at 20% 0%,#1a3050,#0e1c2e 60%);position:relative;overflow:hidden}
.auth::before{content:"";position:absolute;inset:0;opacity:.5;
  background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);
  background-size:30px 30px;-webkit-mask-image:radial-gradient(circle at 50% 20%,#000,transparent 75%);mask-image:radial-gradient(circle at 50% 20%,#000,transparent 75%)}
.auth-card{position:relative;z-index:2;width:100%;max-width:440px;background:var(--surface);border-radius:24px;padding:38px 34px;box-shadow:var(--shadow-lg)}
.auth-wide{max-width:640px}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:26px}
.brand .seal{width:46px;height:46px}
.brand b{font-family:var(--disp);font-size:22px;letter-spacing:-.02em}
.brand .tag{font-size:11px;color:var(--muted);font-weight:600;letter-spacing:.04em}

/* ============ PARTNER OPTION CARD ============ */
.opt-card{display:flex;gap:14px;padding:18px;border:1.5px solid var(--line-2);border-radius:16px;background:var(--surface);text-align:left;width:100%;transition:border .2s,box-shadow .2s;margin-bottom:12px;align-items:center}
.opt-card:hover{border-color:var(--ink-3)}
.opt-card.sel{border-color:var(--ink);box-shadow:0 0 0 4px rgba(16,31,51,.07)}
.opt-card .emo{font-size:26px;flex:none;width:52px;height:52px;border-radius:13px;background:var(--paper-2);display:grid;place-items:center}
.opt-card h3{font-size:16px;margin-bottom:3px}
.opt-card .tick{width:26px;height:26px;flex:none;border-radius:50%;border:2px solid var(--line-2);display:grid;place-items:center}
.opt-card.sel .tick{background:var(--ink);border-color:var(--ink);color:#fff}

/* ============ PORTAL SHELL ============ */
.portal{display:grid;grid-template-columns:256px 1fr;min-height:100dvh}
.sidebar{background:var(--sidebar);color:#cfd8e4;display:flex;flex-direction:column;position:sticky;top:0;height:100dvh}
.sidebar .top{padding:22px 20px 18px;display:flex;align-items:center;gap:11px;border-bottom:1px solid rgba(255,255,255,.07)}
.sidebar .top b{font-family:var(--disp);font-size:18px;color:#fff}
.sidebar .top .tag{font-size:10px;color:#8fa0b5;letter-spacing:.05em}
.role-pill{margin:16px 16px 8px;padding:11px 13px;border-radius:12px;background:rgba(255,255,255,.06);display:flex;align-items:center;gap:10px;cursor:pointer;position:relative}
.role-pill:hover{background:rgba(255,255,255,.1)}
.role-pill .emo{font-size:19px}
.role-pill .nm{flex:1}.role-pill .nm b{color:#fff;font-size:13.5px;display:block}.role-pill .nm span{font-size:10.5px;color:#8fa0b5}
.role-menu{position:absolute;top:calc(100% + 6px);left:0;right:0;background:#1b3049;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:6px;display:none;z-index:30;box-shadow:var(--shadow-lg)}
.role-menu.open{display:block}
.role-menu button{display:flex;align-items:center;gap:9px;width:100%;padding:9px 10px;border-radius:9px;color:#cfd8e4;font-size:13px}
.role-menu button:hover{background:rgba(255,255,255,.08)}
.nav{flex:1;overflow-y:auto;padding:8px 12px;
  scrollbar-width:none;        /* Firefox */
  -ms-overflow-style:none;     /* IE / old Edge */
}
.nav::-webkit-scrollbar{display:none}   /* Chrome / Safari / Edge — scroll chalega, bar nahi dikhegi */
.nav .lbl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6d7f95;padding:14px 10px 6px;font-weight:700}
.nav a{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:10px;font-size:13.5px;font-weight:500;color:#b9c5d4;cursor:pointer;margin-bottom:2px}
.nav a svg{width:18px;height:18px;opacity:.8}
.nav a:hover{background:rgba(255,255,255,.06);color:#fff}
.nav a.on{background:linear-gradient(90deg,rgba(200,150,62,.22),rgba(200,150,62,.05));color:#fff;box-shadow:inset 3px 0 0 var(--seal-2)}
.nav a.on svg{opacity:1;color:var(--seal-2)}
.nav a .badge{margin-left:auto;background:var(--seal);color:#231402;font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px}
.sidebar .foot{padding:12px;border-top:1px solid rgba(255,255,255,.07)}

.main{display:flex;flex-direction:column;min-width:0;background:var(--paper)}
.topbar{position:sticky;top:0;z-index:20;background:rgba(244,241,234,.85);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);
  padding:14px 26px;display:flex;align-items:center;gap:14px}
.topbar .menu-btn{display:none;width:38px;height:38px;border-radius:10px;background:var(--surface);border:1px solid var(--line)}
.topbar h1{font-size:20px;flex:1}
.topbar .icon-btn{width:40px;height:40px;border-radius:11px;background:var(--surface);border:1px solid var(--line);display:grid;place-items:center;position:relative}
.topbar .icon-btn .dot{position:absolute;top:9px;right:10px;width:7px;height:7px;border-radius:50%;background:var(--danger);border:2px solid var(--surface)}
.topbar .who{display:flex;align-items:center;gap:9px;padding:5px 12px 5px 6px;border-radius:999px;background:var(--surface);border:1px solid var(--line)}
.avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--seal),#d8b25f);display:grid;place-items:center;color:#241503;font-weight:700;font-size:13px;flex:none}
.avatar.lg{width:72px;height:72px;font-size:28px}

.content{padding:26px;max-width:1180px;width:100%}
.page-head{margin-bottom:20px}
.page-head h2{font-size:26px} .page-head p{color:var(--muted);margin-top:4px;font-size:14px}

/* ============ STAT GRID ============ */
.grid{display:grid;gap:16px}
.g4{grid-template-columns:repeat(4,1fr)} .g3{grid-template-columns:repeat(3,1fr)} .g2{grid-template-columns:repeat(2,1fr)}
.stat{padding:18px 20px}
.stat .top{display:flex;align-items:center;justify-content:space-between}
.stat .ic{width:38px;height:38px;border-radius:11px;display:grid;place-items:center}
.stat .n{font-family:var(--disp);font-size:30px;font-weight:700;margin-top:12px;line-height:1}
.stat .l{font-size:12.5px;color:var(--muted);margin-top:5px}
.stat .trend{font-size:11.5px;font-weight:700}

/* ============ TABLE ============ */
.tbl{width:100%;border-collapse:collapse}
.tbl th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:12px 16px;border-bottom:1px solid var(--line);font-weight:700}
.tbl td{padding:14px 16px;border-bottom:1px solid var(--line);font-size:13.5px;vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tr:hover td{background:var(--surface-2)}

/* ============ PROPERTY TILES ============ */
.prop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.prop{overflow:hidden}
.prop .banner{height:120px;position:relative;background:linear-gradient(135deg,#25405e,#16283f);display:grid;place-items:center}
.prop .banner .ph{color:rgba(255,255,255,.45);font-size:12px}
.prop .banner .badge{position:absolute;top:10px;right:10px}
.prop .body{padding:15px}
.health{display:flex;align-items:center;gap:12px;margin-top:12px}
.ring{--p:0;width:56px;height:56px;border-radius:50%;flex:none;background:conic-gradient(var(--verified) calc(var(--p)*1%),var(--paper-2) 0);display:grid;place-items:center}
.ring::after{content:attr(data-v);width:42px;height:42px;background:var(--surface);border-radius:50%;display:grid;place-items:center;font-family:var(--disp);font-weight:700;font-size:14px}

/* ============ WORKFLOW STEPPER ============ */
.flow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:16px 18px}
.flow .step{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:999px;background:var(--paper-2);color:var(--ink-2)}
.flow .step.done{background:var(--verified-soft);color:var(--verified)}
.flow .step.now{background:var(--ink);color:#fff}
.flow .arw{color:var(--line-2)}

/* ============ SEGMENTED CONTROL ============ */
.seg{display:inline-flex;gap:4px;background:var(--paper-2);padding:4px;border-radius:12px}
.seg button{padding:8px 16px;border-radius:9px;font-size:13px;font-weight:600;color:var(--muted)}
.seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 3px rgba(16,31,51,.12)}

/* ============ DOC ROWS ============ */
.docrow{display:flex;align-items:center;gap:11px;padding:12px 0;border-bottom:1px solid var(--line)}
.docrow:last-child{border-bottom:none}
.docrow .ic{width:34px;height:34px;border-radius:9px;background:var(--paper-2);display:grid;place-items:center;flex:none}
.docrow .nm{flex:1;font-size:13.5px;font-weight:500}
.docrow .up{cursor:pointer}

/* ============ FEED CARDS ============ */
.feed-card{overflow:hidden}
.feed-card .meta{display:flex;align-items:center;gap:10px;padding:14px 16px}
.feed-card .thumb{height:170px;background:linear-gradient(135deg,#2a3f5a,#18293f);display:grid;place-items:center;color:rgba(255,255,255,.5)}
.feed-card .actions{display:flex;gap:20px;padding:12px 16px;color:var(--muted);font-size:13px;font-weight:600}
.feed-card .actions span{display:flex;align-items:center;gap:6px;cursor:pointer}

/* ============ LEADERBOARD ============ */
.leader{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}
.leader:last-child{border:none}
.rank{width:26px;text-align:center;font-family:var(--disp);font-weight:700;color:var(--muted)}
.rank.top{color:var(--seal)}

/* ============ LIST ITEM / SETTINGS ============ */
.li{display:flex;align-items:center;gap:13px;padding:15px 18px;border-bottom:1px solid var(--line)}
.li:last-child{border-bottom:none}
.li .ic{width:38px;height:38px;border-radius:11px;background:var(--paper-2);display:grid;place-items:center;flex:none;color:var(--ink-2)}
.li .tx{flex:1}.li .tx b{font-size:14px;font-weight:600}.li .tx p{font-size:12px;color:var(--muted)}
.tg{width:44px;height:26px;border-radius:999px;background:var(--line-2);position:relative;transition:.2s;flex:none;cursor:pointer}
.tg::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:.2s}
.tg.on{background:var(--verified)}.tg.on::after{left:21px}

/* ============ LOCKED DOCS ============ */
.locked{position:relative;border-radius:12px;overflow:hidden;border:1px dashed var(--line-2)}
.locked .doc{filter:blur(6px);opacity:.55;padding:18px;font-size:12.5px;line-height:1.8;color:var(--ink-2);user-select:none}
.locked .lock{position:absolute;inset:0;display:grid;place-items:center;background:rgba(244,241,234,.35)}
.locked .lock .box{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 20px;text-align:center;box-shadow:var(--shadow)}

.section-title{display:flex;align-items:center;justify-content:space-between;margin:0 0 14px}
.section-title h3{font-size:17px}

/* ============ MODAL ============ */
.modal-wrap{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;padding:20px}
.modal-wrap.open{display:flex}
.modal-bg{position:absolute;inset:0;background:rgba(13,24,38,.55)}
.modal{position:relative;background:var(--paper);border-radius:20px;width:100%;max-width:560px;max-height:88dvh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);animation:pop .3s cubic-bezier(.2,.8,.2,1)}
@keyframes pop{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
.modal-head{padding:18px 22px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}
.modal-head h2{font-size:19px}
.modal-body{padding:22px;overflow-y:auto}
.modal-foot{padding:16px 22px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end}

/* ============ TOAST ============ */
.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(20px);background:var(--ink);color:#fff;padding:13px 20px;border-radius:12px;font-size:13.5px;font-weight:500;opacity:0;transition:.3s;z-index:100;box-shadow:var(--shadow-lg);pointer-events:none}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}

.overlay{position:fixed;inset:0;background:rgba(13,24,38,.5);z-index:39;display:none}
.overlay.show{display:block}

/* ============ RESPONSIVE ============ */
@media(max-width:900px){
  .portal{grid-template-columns:1fr}
  .sidebar{position:fixed;left:0;top:0;width:270px;z-index:40;transform:translateX(-100%);transition:transform .3s}
  .sidebar.open{transform:none}
  .topbar .menu-btn{display:grid;place-items:center}
  .g4{grid-template-columns:repeat(2,1fr)} .g3{grid-template-columns:1fr}
}
@media(max-width:560px){
  .content{padding:18px} .topbar{padding:12px 16px}
  .g4,.g2{grid-template-columns:1fr}
  .topbar .who .nm-txt{display:none}
  .row{flex-direction:column;gap:0}
  .auth-card{padding:28px 22px}
}
    `}</style>
  )
}