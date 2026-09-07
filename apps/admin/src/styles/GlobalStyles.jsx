// ─────────────────────────────────────────────────────────────────────────
//  GlobalStyles.jsx — CivilCheck Admin design system.
//
//  Same brand as the buyer app (identical dark neutral scale + gold accent,
//  see apps/buyer/src/theme/index.ts) and the same semantic colors as the
//  Partner portal (apps/seller/src/styles/GlobalStyles.jsx) — one identity,
//  expressed as a dense dark "command console" here since this surface is
//  for professionals/admins, not a light "paper document" like the portal.
//
//  Usage: mounted once in main.jsx, before <App/>. Every admin page should
//  use these classes/vars instead of hand-rolled inline style objects.
// ─────────────────────────────────────────────────────────────────────────

export default function GlobalStyles() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');

:root{
  --bg:#0a0c10; --surface:#111318; --surface-2:#171b23; --surface-3:#1d2230;
  --border:#222736; --border-2:#2a3045;
  --text:#e6e9f0; --muted:#8890a6; --dim:#4a5170;
  --gold:#f0a500; --gold-dim:rgba(240,165,0,.12); --gold-border:rgba(240,165,0,.35); --on-gold:#1a1200;
  --green:#23c55e; --green-dim:rgba(35,197,94,.12); --green-border:rgba(35,197,94,.3);
  --red:#f04444; --red-dim:rgba(240,68,68,.12); --red-border:rgba(240,68,68,.3);
  --amber:#f5a000; --amber-dim:rgba(245,160,0,.12); --amber-border:rgba(245,160,0,.3);
  --blue:#4f8ef7; --blue-dim:rgba(79,142,247,.12); --blue-border:rgba(79,142,247,.3);
  --violet:#9b6ef7; --violet-dim:rgba(155,110,247,.12); --violet-border:rgba(155,110,247,.3);
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 10px 30px -16px rgba(0,0,0,.5);
  --shadow-lg:0 30px 70px -30px rgba(0,0,0,.7);
  --r-sm:9px; --r:12px; --r-lg:16px; --r-xl:22px;
  --disp:'Poppins',system-ui,sans-serif;
  --body:'Poppins',system-ui,sans-serif;
  --sidebar-w:252px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
body{font-family:var(--body);color:var(--text);background:var(--bg);line-height:1.5;-webkit-font-smoothing:antialiased}
#root{min-height:100%}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
button:disabled{cursor:not-allowed}
input,select,textarea{font-family:inherit;font-size:14px;color:inherit}
a{color:inherit;text-decoration:none}
h1,h2,h3,h4{font-family:var(--disp);letter-spacing:-.01em;line-height:1.2;font-weight:700}
.muted{color:var(--muted)} .small{font-size:12.5px} .xs{font-size:11px}
::selection{background:var(--gold-dim)}
::-webkit-scrollbar{width:8px;height:8px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border-2);border-radius:99px}
:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:4px}

/* ============ BUTTONS ============ */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 18px;border-radius:var(--r-sm);font-weight:600;font-size:13.5px;transition:transform .12s,box-shadow .2s,background .2s,border-color .2s;white-space:nowrap;min-height:40px}
.btn:active:not(:disabled){transform:scale(.98)}
.btn:disabled{opacity:.45}
.btn-block{display:flex;width:100%}
.btn-primary{background:var(--gold);color:var(--on-gold);box-shadow:0 8px 20px -10px rgba(240,165,0,.5)}
.btn-primary:hover:not(:disabled){filter:brightness(1.08)}
.btn-ghost{background:var(--surface-2);border:1.5px solid var(--border-2);color:var(--text)}
.btn-ghost:hover:not(:disabled){border-color:var(--gold-border)}
.btn-soft{background:var(--gold-dim);color:var(--gold);border:1px solid var(--gold-border)}
.btn-danger{background:var(--red-dim);color:var(--red);border:1px solid var(--red-border)}
.btn-danger-solid{background:var(--red);color:#fff}
.btn-sm{padding:7px 13px;font-size:12px;min-height:32px;border-radius:8px}
.btn-icon{width:38px;height:38px;padding:0;border-radius:10px;background:var(--surface-2);border:1px solid var(--border-2)}

/* ============ FIELDS ============ */
.field{margin-bottom:16px}
.field label{display:block;font-size:12px;font-weight:600;margin-bottom:7px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.req{color:var(--red)} .opt{color:var(--dim);font-weight:500;text-transform:none}
.control{width:100%;padding:11px 13px;border-radius:9px;background:var(--surface-2);border:1.5px solid var(--border-2);color:var(--text);font-size:13.5px;transition:border .15s,box-shadow .15s}
.control:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 4px var(--gold-dim)}
.control::placeholder{color:var(--dim)}
.control:disabled{opacity:.5;cursor:not-allowed}
select.control{appearance:none;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' fill='none' stroke='%238890a6' stroke-width='2'%3E%3Cpath d='M6 8l4 4 4-4'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:36px}
textarea.control{resize:vertical;min-height:88px}
.row{display:flex;gap:12px;flex-wrap:wrap} .row>*{flex:1;min-width:160px}
.searchbox{position:relative}
.searchbox .control{padding-left:38px}
.searchbox .sic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--dim);font-size:14px;pointer-events:none}

/* ============ SURFACES ============ */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow)}
.card-flat{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg)}
.divider{height:1px;background:var(--border);margin:16px 0}

/* ============ BADGE / CHIP ============ */
.badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.02em;white-space:nowrap;border:1px solid transparent}
.badge.green{background:var(--green-dim);color:var(--green);border-color:var(--green-border)}
.badge.amber{background:var(--amber-dim);color:var(--amber);border-color:var(--amber-border)}
.badge.red{background:var(--red-dim);color:var(--red);border-color:var(--red-border)}
.badge.blue{background:var(--blue-dim);color:var(--blue);border-color:var(--blue-border)}
.badge.violet{background:var(--violet-dim);color:var(--violet);border-color:var(--violet-border)}
.badge.gold{background:var(--gold-dim);color:var(--gold);border-color:var(--gold-border)}
.badge.grey{background:var(--surface-3);color:var(--muted);border-color:var(--border-2)}

/* ============ STAT GRID ============ */
.grid{display:grid;gap:14px}
.g4{grid-template-columns:repeat(4,1fr)} .g3{grid-template-columns:repeat(3,1fr)} .g2{grid-template-columns:repeat(2,1fr)}
.stat{padding:18px 20px}
.stat .top{display:flex;align-items:center;justify-content:space-between}
.stat .ic{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;font-size:16px}
.stat .n{font-family:var(--disp);font-size:27px;font-weight:800;margin-top:14px;line-height:1}
.stat .l{font-size:12px;color:var(--muted);margin-top:5px}
.stat .trend{font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px}
.stat .trend.up{background:var(--green-dim);color:var(--green)}
.stat .trend.down{background:var(--red-dim);color:var(--red)}

/* ============ TABLE ============ */
.tbl-wrap{overflow-x:auto}
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:11px 16px;border-bottom:1px solid var(--border);font-weight:700;white-space:nowrap;background:var(--surface-2)}
.tbl td{padding:13px 16px;border-bottom:1px solid var(--border);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tbody tr{transition:background .12s}
.tbl tbody tr:hover td{background:var(--surface-2)}
/* Mobile: table degrades to stacked cards — see components/ui.jsx's <ResponsiveTable> */
.tbl-cards{display:none}

/* ============ TABS ============ */
.tabs{display:flex;gap:6px;flex-wrap:wrap}
.tab-btn{padding:8px 15px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:12.5px;font-weight:600}
.tab-btn.on{background:var(--gold-dim);color:var(--gold);border-color:var(--gold-border)}

/* ============ SEGMENTED / FILTER PILLS ============ */
.pillbar{display:flex;gap:8px;flex-wrap:wrap}
.pill-filter{padding:8px 14px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:12px;font-weight:600}
.pill-filter.on{background:var(--gold);color:var(--on-gold);border-color:var(--gold)}

/* ============ PAGE HEAD ============ */
.page-head{margin-bottom:22px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.page-head h1{font-size:22px}
.page-head p{color:var(--muted);margin-top:4px;font-size:13px;max-width:640px;line-height:1.6}
.section-title{display:flex;align-items:center;justify-content:space-between;margin:0 0 14px;gap:12px}
.section-title h3{font-size:15px}

/* ============ EMPTY / LOADING / ERROR STATES ============ */
.state-block{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:56px 24px;gap:8px}
.state-block .ic{font-size:32px;margin-bottom:4px}
.state-block h4{font-size:14.5px;color:var(--text)}
.state-block p{font-size:12.5px;color:var(--muted);max-width:340px;line-height:1.6}
.spinner{width:22px;height:22px;border-radius:50%;border:2.5px solid var(--border-2);border-top-color:var(--gold);animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.skel{background:linear-gradient(90deg,var(--surface-2) 25%,var(--surface-3) 37%,var(--surface-2) 63%);background-size:400% 100%;animation:shimmer 1.4s ease infinite;border-radius:8px}
@keyframes shimmer{0%{background-position:100% 50%}100%{background-position:0 50%}}

/* ============ MODAL / CONFIRM ============ */
.modal-wrap{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:20px}
.modal-bg{position:absolute;inset:0;background:rgba(6,8,12,.7);backdrop-filter:blur(2px)}
.modal{position:relative;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-xl);width:100%;max-width:560px;max-height:88dvh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);animation:pop .22s cubic-bezier(.2,.8,.2,1)}
.modal.sm{max-width:420px}
.modal.lg{max-width:720px}
@keyframes pop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
.modal-head{padding:18px 22px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}
.modal-head h2{font-size:17px}
.modal-body{padding:22px;overflow-y:auto}
.modal-foot{padding:16px 22px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}

/* ============ TOAST ============ */
.toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(16px);background:var(--surface);border:1px solid var(--border-2);color:var(--text);padding:13px 20px;border-radius:12px;font-size:13px;font-weight:500;opacity:0;transition:.25s;z-index:300;box-shadow:var(--shadow-lg);pointer-events:none;max-width:90vw}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}

/* ============ SIDEBAR SHELL ============ */
.admin-shell{display:flex;min-height:100vh;background:var(--bg)}
.admin-sidebar{width:var(--sidebar-w);background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:100;transition:transform .25s ease}
.admin-sidebar-logo{padding:20px 18px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
.admin-sidebar-icon{width:34px;height:34px;background:var(--gold);border-radius:10px;display:grid;place-items:center;font-size:16px;flex-shrink:0;box-shadow:0 6px 16px -8px rgba(240,165,0,.6)}
.admin-nav{flex:1;padding:12px 10px;overflow-y:auto}
.admin-nav-section{font-size:10px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;font-weight:700;padding:16px 10px 6px}
.admin-nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:9px;cursor:pointer;font-size:13px;font-weight:500;margin-bottom:2px;color:var(--muted);transition:background .15s,color .15s}
.admin-nav-item:hover{background:var(--surface-2);color:var(--text)}
.admin-nav-item.on{background:var(--gold-dim);color:var(--gold)}
.admin-main{margin-left:var(--sidebar-w);flex:1;display:flex;flex-direction:column;min-width:0}
.admin-topbar{position:sticky;top:0;z-index:20;background:rgba(10,12,16,.85);backdrop-filter:blur(10px);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;gap:14px}
.admin-hamburger{display:none;width:38px;height:38px;border-radius:9px;background:var(--surface-2);border:1px solid var(--border-2);align-items:center;justify-content:center;flex-shrink:0}
.admin-content{padding:24px;max-width:1320px;width:100%}

/* ============ RESPONSIVE ============ */
@media(max-width:900px){
  .admin-hamburger{display:flex}
  .admin-sidebar{transform:translateX(-100%)}
  .admin-sidebar.open{transform:translateX(0)}
  .admin-main{margin-left:0}
  .g4{grid-template-columns:repeat(2,1fr)} .g3{grid-template-columns:repeat(2,1fr)}
  /* Tables become stacked cards below 900px — see <ResponsiveTable> */
  .tbl-wrap{display:none}
  .tbl-cards{display:flex;flex-direction:column;gap:10px}
}
@media(max-width:560px){
  .admin-content{padding:16px}
  .admin-topbar{padding:12px 16px}
  .g4,.g3,.g2{grid-template-columns:1fr}
  .row{flex-direction:column}
  .row>*{min-width:0}
  .page-head{flex-direction:column}
  .modal{border-radius:var(--r-lg) var(--r-lg) 0 0;max-height:92dvh;position:fixed;bottom:0;left:0;right:0;margin:0}
  .modal-wrap{align-items:flex-end;padding:0}
}
    `}</style>
  )
}
