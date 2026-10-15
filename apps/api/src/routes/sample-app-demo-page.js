// Self-contained HTML for the Truss "DevDrop" sample app demo page.
// Served as-is by the Truss API. Exports exactly one template-literal string.
// NOTE: all browser-side JS below uses plain string concatenation and quotes only
// (no template literals, no dollar-brace) so the outer template literal is safe.
export const DEMO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DevDrop</title>
<style>
  :root {
    --bg: #0b0f17;
    --bg-grad: radial-gradient(1200px 600px at 80% -10%, #1a0b14 0%, transparent 55%), #0b0f17;
    --surface: #111622;
    --surface-2: #0e131d;
    --border: #1e2735;
    --border-soft: #19212e;
    --text: #e6eaf2;
    --text-2: #c2cad8;
    --muted: #8a94a6;
    --faint: #5c6677;
    --wine: #9f1239;
    --wine-bright: #e11d48;
    --wine-soft: rgba(159, 18, 57, 0.14);
    --shadow: 0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.28);
    --radius: 14px;
    --radius-sm: 9px;
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg-grad);
    color: var(--text);
    font-family: var(--font);
    font-size: 15.5px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
  }
  a { color: inherit; text-decoration: none; }
  button { font-family: inherit; cursor: pointer; }
  img { display: block; }

  /* ── Top bar ───────────────────────────── */
  header.topbar {
    position: sticky; top: 0; z-index: 40;
    background: rgba(11, 15, 23, 0.82);
    backdrop-filter: saturate(160%) blur(12px);
    border-bottom: 1px solid var(--border-soft);
  }
  .topbar-inner {
    max-width: 920px; margin: 0 auto;
    display: flex; align-items: center; gap: 14px;
    padding: 12px 16px;
  }
  .brand { display: flex; align-items: center; gap: 9px; flex-shrink: 0; cursor: pointer; }
  .brand svg { width: 26px; height: 26px; display: block; }
  .brand .wordmark {
    font-weight: 800; font-size: 19px; letter-spacing: -0.02em;
    color: var(--text);
  }
  .brand .wordmark b { color: var(--wine-bright); }
  .search-wrap { flex: 1; position: relative; min-width: 0; }
  .search-wrap input {
    width: 100%; background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text); border-radius: 999px;
    padding: 9px 14px 9px 36px; font-size: 14.5px; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  .search-wrap input:focus { border-color: var(--wine); box-shadow: 0 0 0 3px var(--wine-soft); }
  .search-wrap .sicon {
    position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
    width: 15px; height: 15px; color: var(--faint); pointer-events: none;
  }

  /* ── Identity control ──────────────────── */
  .identity { position: relative; flex-shrink: 0; }
  .identity-btn {
    display: flex; align-items: center; gap: 8px;
    background: var(--surface); border: 1px solid var(--border);
    color: var(--text-2); border-radius: 999px; padding: 5px 11px 5px 6px;
    font-size: 13.5px; font-weight: 600; transition: border-color .15s, background .15s;
  }
  .identity-btn:hover { border-color: var(--wine); background: var(--surface-2); }
  .identity-btn img, .avatar {
    width: 26px; height: 26px; border-radius: 999px; background: var(--surface-2);
    border: 1px solid var(--border); object-fit: cover; flex-shrink: 0;
  }
  .identity-btn .nm { max-width: 92px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .identity-btn .guest-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--faint); margin-left: 2px; }
  .menu {
    position: absolute; right: 0; top: calc(100% + 8px);
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; box-shadow: var(--shadow);
    width: 248px; padding: 6px; z-index: 50; max-height: 70vh; overflow: auto;
  }
  .menu-head { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); padding: 8px 10px 6px; font-weight: 700; }
  .menu-item {
    display: flex; align-items: center; gap: 10px; padding: 8px 10px;
    border-radius: 8px; cursor: pointer; font-size: 14px; color: var(--text-2);
  }
  .menu-item:hover { background: var(--surface-2); }
  .menu-item.active { background: var(--wine-soft); color: var(--text); }
  .menu-item .nm { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .menu-item .em { font-size: 12px; color: var(--muted); }
  .menu-sep { height: 1px; background: var(--border-soft); margin: 6px 4px; }
  .menu-signout { color: var(--wine-bright); font-weight: 600; }

  /* ── Layout ───────────────────────────── */
  main { max-width: 920px; margin: 0 auto; padding: 22px 16px 120px; }

  /* ── Tag chips ────────────────────────── */
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 22px; }
  .chip {
    background: var(--surface); border: 1px solid var(--border);
    color: var(--text-2); border-radius: 999px; padding: 6px 13px;
    font-size: 13px; font-weight: 600; transition: all .14s; user-select: none;
  }
  .chip:hover { border-color: var(--wine); color: var(--text); }
  .chip.active { background: var(--wine); border-color: var(--wine); color: #fff; }
  .chip.small { padding: 3px 9px; font-size: 11.5px; font-weight: 600; cursor: default; }
  .chip.small:hover { border-color: var(--border); color: var(--text-2); }

  /* ── Post cards ───────────────────────── */
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 18px 20px; margin-bottom: 14px;
    box-shadow: var(--shadow); transition: border-color .15s, transform .12s;
  }
  .card:hover { border-color: #2a3647; }
  .card .ptitle {
    font-size: 19px; font-weight: 750; letter-spacing: -0.01em; color: var(--text);
    margin: 0 0 8px; cursor: pointer; line-height: 1.28;
  }
  .card .ptitle:hover { color: var(--wine-bright); }
  .byline { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: var(--muted); font-size: 13px; }
  .byline .nm { color: var(--text-2); font-weight: 600; }
  .byline .dot { color: var(--faint); }
  .excerpt { color: var(--text-2); font-size: 14.5px; margin: 0 0 13px; }
  .card-foot { display: flex; align-items: center; gap: 16px; color: var(--muted); font-size: 13px; }
  .card-foot .stat { display: inline-flex; align-items: center; gap: 5px; }
  .card-foot .fire { color: var(--wine-bright); font-weight: 650; }
  .card-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 13px; }

  /* ── Post view ────────────────────────── */
  .backbtn {
    display: inline-flex; align-items: center; gap: 6px;
    background: transparent; border: 0; color: var(--muted);
    font-size: 14px; font-weight: 600; padding: 4px 0; margin-bottom: 14px;
  }
  .backbtn:hover { color: var(--text); }
  .post-title { font-size: 30px; font-weight: 820; letter-spacing: -0.025em; line-height: 1.15; margin: 4px 0 16px; }
  .author-card {
    display: flex; align-items: center; gap: 13px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 13px 15px; margin-bottom: 18px;
  }
  .author-card .avatar { width: 44px; height: 44px; }
  .author-card .nm { font-weight: 700; font-size: 15px; }
  .author-card .bio { color: var(--muted); font-size: 13px; margin-top: 1px; }
  .author-card .meta-r { margin-left: auto; text-align: right; color: var(--muted); font-size: 12.5px; flex-shrink: 0; }
  .badge-pub {
    display: inline-block; background: rgba(16,185,129,0.14); color: #34d399;
    border: 1px solid rgba(16,185,129,0.3); border-radius: 999px;
    padding: 1px 9px; font-size: 11px; font-weight: 700; margin-top: 4px;
  }
  .post-body {
    font-size: 16.5px; line-height: 1.72; color: var(--text-2);
    white-space: pre-wrap; word-wrap: break-word; margin: 6px 0 20px;
  }
  .post-tags { display: flex; flex-wrap: wrap; gap: 7px; margin: 0 0 20px; }

  .react-row { display: flex; align-items: center; gap: 12px; margin: 0 0 22px; }
  .react-btn {
    display: inline-flex; align-items: center; gap: 9px;
    background: var(--wine-soft); border: 1px solid rgba(159,18,57,0.4);
    color: var(--text); border-radius: 999px; padding: 9px 18px;
    font-size: 15px; font-weight: 700; transition: transform .1s, background .15s;
  }
  .react-btn:hover { background: rgba(159,18,57,0.24); }
  .react-btn:active { transform: scale(0.95); }
  .react-btn .cnt { color: var(--wine-bright); min-width: 14px; }
  .react-btn.pop { animation: pop .35s ease; }
  @keyframes pop { 0%{transform:scale(1);} 40%{transform:scale(1.18);} 100%{transform:scale(1);} }

  .section-h { font-size: 13px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); font-weight: 700; margin: 24px 0 12px; display: flex; align-items: center; gap: 10px; }
  .attach-strip { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 4px; }
  .attach {
    display: flex; align-items: center; gap: 10px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 10px 13px; font-size: 13.5px; min-width: 0;
  }
  .attach .fico { width: 18px; height: 18px; color: var(--muted); flex-shrink: 0; }
  .attach .fk { font-family: var(--mono); font-size: 12.5px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
  .attach .fs { color: var(--faint); font-size: 12px; flex-shrink: 0; }

  .related-list { display: flex; flex-direction: column; gap: 2px; }
  .related-item {
    display: flex; align-items: center; gap: 10px; padding: 11px 13px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; cursor: pointer; transition: border-color .15s;
  }
  .related-item:hover { border-color: var(--wine); }
  .related-item .rarrow { color: var(--faint); flex-shrink: 0; }
  .related-item .rt { font-weight: 600; font-size: 14px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── Live indicator ───────────────────── */
  .live-ind { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; text-transform: none; letter-spacing: 0; margin-left: auto; }
  .live-ind.on { color: #34d399; }
  .live-ind.off { color: var(--faint); }
  .live-ind .pulse { width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
  .live-ind.on .pulse { box-shadow: 0 0 0 0 rgba(52,211,153,0.6); animation: pulse 1.8s infinite; }
  @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(52,211,153,0.55);} 70%{box-shadow:0 0 0 7px rgba(52,211,153,0);} 100%{box-shadow:0 0 0 0 rgba(52,211,153,0);} }

  /* ── Comments ─────────────────────────── */
  .comment { display: flex; gap: 11px; padding: 13px 0; border-top: 1px solid var(--border-soft); }
  .comment:first-child { border-top: 0; }
  .comment .avatar { width: 34px; height: 34px; }
  .comment .cbody-wrap { min-width: 0; flex: 1; }
  .comment .chead { display: flex; align-items: baseline; gap: 8px; margin-bottom: 2px; }
  .comment .cnm { font-weight: 650; font-size: 13.5px; color: var(--text); }
  .comment .ctime { font-size: 12px; color: var(--faint); }
  .comment .ctext { color: var(--text-2); font-size: 14.5px; white-space: pre-wrap; word-wrap: break-word; }
  .comment.fresh { animation: fadein .5s ease; }
  @keyframes fadein { from{opacity:0; transform:translateY(5px);} to{opacity:1; transform:none;} }

  .composer { display: flex; gap: 11px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-soft); }
  .composer .avatar { width: 34px; height: 34px; }
  .composer-main { flex: 1; min-width: 0; }
  .composer textarea {
    width: 100%; background: var(--surface-2); border: 1px solid var(--border);
    color: var(--text); border-radius: 11px; padding: 11px 13px;
    font-family: inherit; font-size: 14.5px; resize: vertical; min-height: 64px; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  .composer textarea:focus { border-color: var(--wine); box-shadow: 0 0 0 3px var(--wine-soft); }
  .composer-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 9px; gap: 10px; }
  .composer-hint { font-size: 12.5px; color: var(--muted); }
  .composer-hint a { color: var(--wine-bright); font-weight: 600; cursor: pointer; }
  .btn-primary {
    background: var(--wine); border: 1px solid var(--wine); color: #fff;
    border-radius: 9px; padding: 8px 18px; font-size: 14px; font-weight: 700;
    transition: background .15s, opacity .15s;
  }
  .btn-primary:hover { background: var(--wine-bright); }
  .btn-primary:disabled { opacity: 0.5; cursor: default; }

  /* ── States ───────────────────────────── */
  .center-note { text-align: center; padding: 90px 20px; color: var(--muted); }
  .center-note .big { font-size: 20px; font-weight: 750; color: var(--text); margin-bottom: 8px; }
  .center-note .sub { font-size: 15px; max-width: 420px; margin: 0 auto; }
  .spinner {
    width: 26px; height: 26px; border: 3px solid var(--border);
    border-top-color: var(--wine-bright); border-radius: 999px;
    animation: spin .8s linear infinite; margin: 60px auto;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .empty { text-align: center; color: var(--muted); padding: 60px 20px; font-size: 15px; }
  .inline-err {
    background: rgba(225,29,72,0.1); border: 1px solid rgba(225,29,72,0.3);
    color: #fda4af; border-radius: 10px; padding: 11px 14px; font-size: 13.5px; margin: 12px 0;
  }

  /* ── Under the hood ───────────────────── */
  .uth {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
    background: rgba(11,15,23,0.9); backdrop-filter: saturate(160%) blur(12px);
    border-top: 1px solid var(--border);
  }
  .uth-inner { max-width: 920px; margin: 0 auto; padding: 0 16px; }
  .uth-toggle {
    display: flex; align-items: center; gap: 9px; width: 100%;
    background: transparent; border: 0; color: var(--text-2);
    padding: 12px 0; font-size: 13.5px; font-weight: 700; text-align: left;
  }
  .uth-toggle .bolt { color: var(--wine-bright); }
  .uth-toggle .chev { margin-left: auto; color: var(--muted); transition: transform .2s; }
  .uth.open .uth-toggle .chev { transform: rotate(180deg); }
  .uth-panel { max-height: 0; overflow: hidden; transition: max-height .28s ease; }
  .uth.open .uth-panel { max-height: 60vh; overflow: auto; }
  .uth-body { padding: 4px 0 18px; }
  .uth-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 22px; margin-bottom: 16px; }
  .uth-line { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--text-2); padding: 3px 0; }
  .uth-line .act { color: var(--text); font-weight: 600; min-width: 0; }
  .uth-line .arr { color: var(--faint); flex-shrink: 0; }
  .uth-line .tech { color: var(--wine-bright); font-weight: 600; flex-shrink: 0; }
  .uth-key {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 10px; padding: 12px 14px;
  }
  .uth-key .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; margin-bottom: 7px; }
  .uth-key code { font-family: var(--mono); font-size: 12.5px; color: var(--text); word-break: break-all; }
  .uth-curl { display: flex; align-items: flex-start; gap: 10px; margin-top: 10px; }
  .uth-curl pre {
    flex: 1; margin: 0; background: #06090f; border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 12px; font-family: var(--mono);
    font-size: 12px; color: var(--text-2); overflow-x: auto; white-space: pre; line-height: 1.5;
  }
  .copybtn {
    background: var(--surface); border: 1px solid var(--border); color: var(--text-2);
    border-radius: 8px; padding: 7px 12px; font-size: 12px; font-weight: 600; flex-shrink: 0;
  }
  .copybtn:hover { border-color: var(--wine); color: var(--text); }
  .uth-foot { font-size: 12px; color: var(--muted); margin-top: 12px; }
  .uth-foot b { color: var(--text-2); }

  @media (max-width: 620px) {
    .topbar-inner { gap: 9px; padding: 10px 14px; }
    .brand .wordmark { display: none; }
    .identity-btn .nm { max-width: 60px; }
    .post-title { font-size: 25px; }
    .uth-grid { grid-template-columns: 1fr; gap: 2px; }
    main { padding: 18px 14px 110px; }
  }
</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-inner">
    <div class="brand" id="brandBtn" title="DevDrop home">
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M16 3C11 10 7 14 7 19.5A9 9 0 0 0 25 19.5C25 14 21 10 16 3Z" fill="#9f1239"/>
        <path d="M16 11C13.5 14.2 12 16.3 12 19.1A4 4 0 0 0 16 23.1" stroke="#fda4af" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
      <span class="wordmark">Dev<b>Drop</b></span>
    </div>
    <div class="search-wrap">
      <svg class="sicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3" stroke-linecap="round"/></svg>
      <input id="searchInput" type="search" placeholder="Search posts..." autocomplete="off" spellcheck="false" />
    </div>
    <div class="identity" id="identityWrap"></div>
  </div>
</header>

<main id="app"><div class="spinner"></div></main>

<div class="uth" id="uth">
  <div class="uth-inner">
    <button class="uth-toggle" id="uthToggle" aria-expanded="false">
      <span class="bolt">&#9889;</span> Under the hood
      <span class="chev">&#9662;</span>
    </button>
    <div class="uth-panel"><div class="uth-body" id="uthBody"></div></div>
  </div>
</div>

<script>
(function () {
  "use strict";

  // ── State ─────────────────────────────
  var state = { user: null, meta: null, view: "feed", postId: null, posts: null, socket: null, tag: "", q: "", reacting: false };
  var app = document.getElementById("app");
  var searchInput = document.getElementById("searchInput");
  var identityWrap = document.getElementById("identityWrap");
  var menuOpen = false;
  var searchTimer = null;

  // ── Tiny helpers ──────────────────────
  function el(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function relTime(iso) {
    if (!iso) return "";
    var t = new Date(iso).getTime();
    if (isNaN(t)) return "";
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 0) s = 0;
    if (s < 45) return "just now";
    if (s < 90) return "1m ago";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    var d = Math.floor(h / 24);
    if (d < 7) return d + "d ago";
    var w = Math.floor(d / 7);
    if (w < 5) return w + "w ago";
    var mo = Math.floor(d / 30);
    if (mo < 12) return mo + "mo ago";
    return Math.floor(d / 365) + "y ago";
  }

  function humanSize(bytes) {
    var b = Number(bytes);
    if (!b || b < 0 || isNaN(b)) return "0 B";
    if (b < 1024) return b + " B";
    var kb = b / 1024;
    if (kb < 1024) return (kb < 10 ? kb.toFixed(1) : Math.round(kb)) + " KB";
    var mb = kb / 1024;
    return (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + " MB";
  }

  function avatarFor(url, alt) {
    var u = url ? escapeHtml(url) : "";
    return '<img class="avatar" src="' + u + '" alt="' + escapeHtml(alt || "") + '" loading="lazy" onerror="this.style.visibility=\\'hidden\\'" />';
  }

  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      if (!r.ok && r.status !== 201) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          var e = new Error((j && j.error) || ("HTTP " + r.status));
          e.status = r.status; throw e;
        });
      }
      return r.json();
    });
  }

  // ── Identity (sign in as) ─────────────
  function loadUser() {
    try {
      var raw = localStorage.getItem("devdrop_user");
      if (raw) state.user = JSON.parse(raw);
    } catch (e) { state.user = null; }
  }
  function saveUser() {
    try {
      if (state.user) localStorage.setItem("devdrop_user", JSON.stringify(state.user));
      else localStorage.removeItem("devdrop_user");
    } catch (e) { /* ignore */ }
  }

  function renderIdentity() {
    var btn;
    if (state.user) {
      btn = '<button class="identity-btn" id="idBtn">' +
        avatarFor(state.user.avatar_url, state.user.name) +
        '<span class="nm">' + escapeHtml(state.user.name) + '</span>' +
        '</button>';
    } else {
      btn = '<button class="identity-btn" id="idBtn"><span class="guest-dot"></span><span class="nm">Reading as guest</span></button>';
    }
    identityWrap.innerHTML = btn + (menuOpen ? renderMenu() : "");
    var idBtn = el("idBtn");
    if (idBtn) idBtn.addEventListener("click", function (e) { e.stopPropagation(); menuOpen = !menuOpen; renderIdentity(); });
    if (menuOpen) wireMenu();
  }

  function renderMenu() {
    var users = (state.meta && state.meta.users) || [];
    var rows = "";
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      var active = state.user && state.user.id === u.id ? " active" : "";
      rows += '<div class="menu-item' + active + '" data-uid="' + escapeHtml(u.id) + '">' +
        avatarFor(u.avatar_url, u.name) +
        '<div style="min-width:0"><div class="nm">' + escapeHtml(u.name) + '</div>' +
        '<div class="em">' + escapeHtml(u.email || "") + '</div></div></div>';
    }
    var out = '<div class="menu" id="idMenu"><div class="menu-head">Sign in as</div>' + rows;
    if (state.user) out += '<div class="menu-sep"></div><div class="menu-item menu-signout" data-signout="1">Read as guest</div>';
    out += '</div>';
    return out;
  }

  function wireMenu() {
    var menu = el("idMenu");
    if (!menu) return;
    menu.addEventListener("click", function (e) { e.stopPropagation(); });
    var items = menu.querySelectorAll(".menu-item");
    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener("click", function () {
        if (this.getAttribute("data-signout")) {
          state.user = null; saveUser(); menuOpen = false; renderIdentity();
          if (state.view === "post") refreshComposer();
          return;
        }
        var uid = this.getAttribute("data-uid");
        var users = (state.meta && state.meta.users) || [];
        for (var j = 0; j < users.length; j++) {
          if (users[j].id === uid) {
            state.user = { id: users[j].id, name: users[j].name, avatar_url: users[j].avatar_url };
            break;
          }
        }
        saveUser(); menuOpen = false; renderIdentity();
        if (state.view === "post") refreshComposer();
      });
    }
  }

  document.addEventListener("click", function () {
    if (menuOpen) { menuOpen = false; renderIdentity(); }
  });

  // ── Boot ──────────────────────────────
  function boot() {
    loadUser();
    api("/api/sample-app/demo/meta").then(function (meta) {
      if (!meta || !meta.loaded) { renderNotLoaded(); return; }
      state.meta = meta;
      renderIdentity();
      renderUnderTheHood();
      loadFeed();
    }).catch(function () { renderNotLoaded(); });
  }

  function renderNotLoaded() {
    identityWrap.innerHTML = "";
    app.innerHTML = '<div class="center-note">' +
      '<div class="big">DevDrop isn&#39;t loaded yet</div>' +
      '<div class="sub">Open the Truss dashboard and click &ldquo;Load test app&rdquo; to seed the database, then refresh this page.</div>' +
      '</div>';
    var uth = el("uth"); if (uth) uth.style.display = "none";
  }

  // ── Feed view ─────────────────────────
  function loadFeed() {
    state.view = "feed"; state.postId = null;
    closeSocket();
    app.innerHTML = '<div class="spinner"></div>';
    var qs = [];
    if (state.q) qs.push("q=" + encodeURIComponent(state.q));
    if (state.tag) qs.push("tag=" + encodeURIComponent(state.tag));
    var url = "/api/sample-app/demo/posts" + (qs.length ? "?" + qs.join("&") : "");
    api(url).then(function (data) {
      state.posts = (data && data.posts) || [];
      renderFeed();
    }).catch(function (err) {
      app.innerHTML = '<div class="inline-err">Could not load the feed: ' + escapeHtml(err.message) + '</div>';
    });
  }

  function renderFeed() {
    var tags = (state.meta && state.meta.tags) || [];
    var chips = '<div class="chip' + (state.tag ? "" : " active") + '" data-tag="">All</div>';
    for (var i = 0; i < tags.length; i++) {
      var t = tags[i];
      chips += '<div class="chip' + (state.tag === t ? " active" : "") + '" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + '</div>';
    }
    var html = '<div class="chips" id="chips">' + chips + '</div>';

    if (!state.posts || state.posts.length === 0) {
      var msg = state.q ? 'No posts match &ldquo;' + escapeHtml(state.q) + '&rdquo;.' : "No posts found.";
      html += '<div class="empty">' + msg + '</div>';
      app.innerHTML = html;
      wireChips();
      return;
    }

    var cards = "";
    for (var k = 0; k < state.posts.length; k++) {
      var p = state.posts[k];
      var ptags = "";
      var pt = p.tags || [];
      for (var m = 0; m < pt.length; m++) ptags += '<span class="chip small">' + escapeHtml(pt[m]) + '</span>';
      cards += '<article class="card" data-pid="' + escapeHtml(p.id) + '">' +
        '<h2 class="ptitle" data-open="' + escapeHtml(p.id) + '">' + escapeHtml(p.title) + '</h2>' +
        '<div class="byline">' + avatarMini(p.avatar_url, p.author) +
          '<span class="nm">' + escapeHtml(p.author) + '</span>' +
          '<span class="dot">&middot;</span><span>' + escapeHtml(relTime(p.created_at)) + '</span></div>' +
        '<p class="excerpt">' + escapeHtml(p.excerpt || "") + '&hellip;</p>' +
        (ptags ? '<div class="card-tags">' + ptags + '</div>' : "") +
        '<div class="card-foot">' +
          '<span class="stat">&#128172; ' + (p.comments || 0) + '</span>' +
          '<span class="stat fire">&#128293; ' + (p.reactions || 0) + '</span>' +
        '</div></article>';
    }
    html += cards;
    app.innerHTML = html;
    wireChips();

    var titles = app.querySelectorAll("[data-open]");
    for (var n = 0; n < titles.length; n++) {
      titles[n].addEventListener("click", function () { openPost(this.getAttribute("data-open")); });
    }
    var cardsEls = app.querySelectorAll(".card");
    for (var c = 0; c < cardsEls.length; c++) {
      cardsEls[c].addEventListener("click", function (e) {
        if (e.target.closest(".chip")) return;
        openPost(this.getAttribute("data-pid"));
      });
    }
  }

  function avatarMini(url, alt) {
    var u = url ? escapeHtml(url) : "";
    return '<img class="avatar" style="width:20px;height:20px" src="' + u + '" alt="' + escapeHtml(alt || "") + '" loading="lazy" onerror="this.style.visibility=\\'hidden\\'" />';
  }

  function wireChips() {
    var chips = app.querySelectorAll("#chips .chip");
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener("click", function () {
        state.tag = this.getAttribute("data-tag") || "";
        loadFeed();
      });
    }
  }

  // ── Post view ─────────────────────────
  function openPost(id) {
    if (!id) return;
    state.view = "post"; state.postId = id;
    window.scrollTo(0, 0);
    app.innerHTML = '<div class="spinner"></div>';
    api("/api/sample-app/demo/posts/" + encodeURIComponent(id)).then(function (data) {
      renderPost(data);
      connectSocket(id);
    }).catch(function (err) {
      app.innerHTML = '<button class="backbtn" id="backBtn">&larr; Back to feed</button>' +
        '<div class="inline-err">Could not load this post: ' + escapeHtml(err.message) + '</div>';
      var b = el("backBtn"); if (b) b.addEventListener("click", loadFeed);
    });
  }

  function renderPost(data) {
    var p = data.post || {};
    var comments = data.comments || [];
    var attachments = data.attachments || [];
    var related = data.related || [];
    var reactions = data.reactions || 0;

    var ptags = "";
    var pt = p.tags || [];
    for (var i = 0; i < pt.length; i++) ptags += '<span class="chip small">' + escapeHtml(pt[i]) + '</span>';

    var att = "";
    for (var a = 0; a < attachments.length; a++) {
      att += '<div class="attach">' +
        '<svg class="fico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v5h5" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 8v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h8z" stroke-linejoin="round"/></svg>' +
        '<span class="fk">' + escapeHtml(attachments[a].key) + '</span>' +
        '<span class="fs">' + escapeHtml(humanSize(attachments[a].size)) + '</span></div>';
    }

    var rel = "";
    for (var r = 0; r < related.length; r++) {
      rel += '<div class="related-item" data-rid="' + escapeHtml(related[r].id) + '">' +
        '<svg class="rarrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<span class="rt">' + escapeHtml(related[r].title) + '</span></div>';
    }

    var html = '<button class="backbtn" id="backBtn">&larr; Back to feed</button>' +
      '<h1 class="post-title">' + escapeHtml(p.title) + '</h1>' +
      '<div class="author-card">' + avatarFor(p.avatar_url, p.author) +
        '<div style="min-width:0"><div class="nm">' + escapeHtml(p.author) + '</div>' +
        '<div class="bio">' + escapeHtml(p.bio || "Developer at DevDrop") + '</div></div>' +
        '<div class="meta-r">' + escapeHtml(relTime(p.created_at)) +
          (p.published ? '<div><span class="badge-pub">Published</span></div>' : "") +
        '</div></div>' +
      (ptags ? '<div class="post-tags">' + ptags + '</div>' : "") +
      '<div class="post-body">' + escapeHtml(p.body || "") + '</div>' +
      '<div class="react-row">' +
        '<button class="react-btn" id="reactBtn">&#128293; React <span class="cnt" id="reactCnt">' + reactions + '</span></button>' +
      '</div>';

    if (attachments.length) html += '<div class="section-h">Attachments</div><div class="attach-strip">' + att + '</div>';
    if (related.length) html += '<div class="section-h">Related</div><div class="related-list">' + rel + '</div>';

    html += '<div class="section-h">Comments <span style="color:var(--faint)">(' + comments.length + ')</span>' +
      '<span class="live-ind off" id="liveInd"><span class="pulse"></span>offline</span></div>';
    html += '<div id="commentThread">' + renderComments(comments) + '</div>';
    html += '<div id="composerHost">' + renderComposer() + '</div>';

    app.innerHTML = html;

    el("backBtn").addEventListener("click", loadFeed);
    el("reactBtn").addEventListener("click", doReact);
    var rels = app.querySelectorAll(".related-item");
    for (var x = 0; x < rels.length; x++) rels[x].addEventListener("click", function () { openPost(this.getAttribute("data-rid")); });
    wireComposer();
  }

  function renderComments(comments) {
    if (!comments || comments.length === 0) return '<div class="empty" id="noComments" style="padding:30px 10px">No comments yet. Start the thread.</div>';
    var out = "";
    for (var i = 0; i < comments.length; i++) out += commentHtml(comments[i], false);
    return out;
  }

  function commentHtml(c, fresh) {
    return '<div class="comment' + (fresh ? " fresh" : "") + '" data-cid="' + escapeHtml(c.id) + '">' +
      avatarFor(c.avatar_url, c.author) +
      '<div class="cbody-wrap"><div class="chead">' +
        '<span class="cnm">' + escapeHtml(c.author || "Someone") + '</span>' +
        '<span class="ctime">' + escapeHtml(relTime(c.created_at)) + '</span></div>' +
      '<div class="ctext">' + escapeHtml(c.body) + '</div></div></div>';
  }

  function renderComposer() {
    var av = state.user ? avatarFor(state.user.avatar_url, state.user.name) : '<span class="avatar"></span>';
    var hint = state.user
      ? '<span class="composer-hint">Commenting as <b>' + escapeHtml(state.user.name) + '</b></span>'
      : '<span class="composer-hint">Posting as guest &mdash; <a id="signinNudge">sign in</a> to use your identity</span>';
    return '<div class="composer">' + av +
      '<div class="composer-main">' +
        '<textarea id="commentBox" placeholder="Add to the discussion..." maxlength="500"></textarea>' +
        '<div class="composer-foot">' + hint +
          '<button class="btn-primary" id="commentBtn">Comment</button></div>' +
      '</div></div>';
  }

  function refreshComposer() {
    var host = el("composerHost");
    if (host) { host.innerHTML = renderComposer(); wireComposer(); }
  }

  function wireComposer() {
    var btn = el("commentBtn");
    if (btn) btn.addEventListener("click", submitComment);
    var nudge = el("signinNudge");
    if (nudge) nudge.addEventListener("click", function () { menuOpen = true; renderIdentity(); });
    var box = el("commentBox");
    if (box) box.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitComment();
    });
  }

  function submitComment() {
    var box = el("commentBox");
    var btn = el("commentBtn");
    if (!box) return;
    var body = box.value.trim();
    if (!body) return;
    if (btn) { btn.disabled = true; btn.textContent = "Posting..."; }
    var payload = { body: body, authorId: state.user ? state.user.id : "" };
    api("/api/sample-app/demo/posts/" + encodeURIComponent(state.postId) + "/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (res && res.comment) appendComment(res.comment, true);
      box.value = "";
    }).catch(function (err) {
      var host = el("composerHost");
      if (host) {
        var e = document.createElement("div");
        e.className = "inline-err";
        e.textContent = "Could not post comment: " + err.message;
        host.insertBefore(e, host.firstChild);
        setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 4000);
      }
    }).then(function () {
      if (btn) { btn.disabled = false; btn.textContent = "Comment"; }
    });
  }

  function appendComment(c, fresh) {
    if (!c || !c.id) return;
    var thread = el("commentThread");
    if (!thread) return;
    var existing = thread.querySelector('[data-cid="' + cssEscape(String(c.id)) + '"]');
    if (existing) return; // de-dupe
    var nc = el("noComments");
    if (nc && nc.parentNode) nc.parentNode.removeChild(nc);
    var tmp = document.createElement("div");
    tmp.innerHTML = commentHtml(c, fresh);
    thread.appendChild(tmp.firstChild);
  }

  function cssEscape(s) { return s.replace(/["\\\\]/g, "\\\\$&"); }

  // ── Reactions ─────────────────────────
  function doReact() {
    if (state.reacting) return;
    state.reacting = true;
    var cnt = el("reactCnt");
    var btn = el("reactBtn");
    var optimistic = cnt ? (parseInt(cnt.textContent, 10) || 0) + 1 : 0;
    if (cnt) cnt.textContent = optimistic;
    if (btn) { btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop"); }
    api("/api/sample-app/demo/posts/" + encodeURIComponent(state.postId) + "/react", { method: "POST" })
      .then(function (res) {
        if (cnt && res && typeof res.reactions === "number" && res.reactions > 0) cnt.textContent = res.reactions;
      })
      .catch(function () { if (cnt) cnt.textContent = Math.max(0, optimistic - 1); })
      .then(function () { state.reacting = false; });
  }

  // ── Realtime (WebSocket CDC) ──────────
  function connectSocket(postId) {
    closeSocket();
    if (!state.meta || !state.meta.realtimeWs) return;
    try {
      var wsUrl = location.origin.replace(/^http/, "ws") + state.meta.realtimeWs;
      var sock = new WebSocket(wsUrl);
      state.socket = sock;
      sock.onopen = function () { setLive(true); };
      sock.onclose = function () { setLive(false); };
      sock.onerror = function () { setLive(false); };
      sock.onmessage = function (ev) {
        try {
          var msg = JSON.parse(ev.data);
          if (!msg || state.view !== "post") return;
          var isComment = (msg.table === "comments") && (msg.type === "INSERT") && msg.new;
          if (!isComment) return;
          var row = msg.new;
          if (String(row.post_id) !== String(state.postId)) return;
          appendComment({
            id: row.id,
            body: row.body,
            created_at: row.created_at,
            author: row.author || "New commenter",
            avatar_url: row.avatar_url || ""
          }, true);
        } catch (e) { /* ignore malformed */ }
      };
    } catch (e) { setLive(false); }
  }

  function setLive(on) {
    var ind = el("liveInd");
    if (!ind) return;
    ind.className = "live-ind " + (on ? "on" : "off");
    ind.innerHTML = '<span class="pulse"></span>' + (on ? "live" : "offline");
  }

  function closeSocket() {
    if (state.socket) {
      try { state.socket.onmessage = null; state.socket.onclose = null; state.socket.close(); } catch (e) { /* ignore */ }
      state.socket = null;
    }
  }

  // ── Search ────────────────────────────
  searchInput.addEventListener("input", function () {
    if (!state.meta) return;
    clearTimeout(searchTimer);
    var val = this.value;
    searchTimer = setTimeout(function () {
      state.q = val.trim();
      if (state.view !== "feed") { state.view = "feed"; closeSocket(); }
      loadFeed();
    }, 280);
  });

  el("brandBtn").addEventListener("click", function () {
    if (!state.meta) return;
    state.q = ""; state.tag = ""; searchInput.value = "";
    loadFeed();
  });

  // ── Under the hood ────────────────────
  function renderUnderTheHood() {
    var tech = (state.meta && state.meta.tech) || {};
    var origin = location.origin;
    var anon = (state.meta && state.meta.anonKey) || "(load the app to mint a key)";

    var lines = [
      ["Feed &amp; posts", tech.database],
      ["Full-text search", tech.search],
      ["Live comments", tech.realtime],
      ["Reaction counts", tech.cache],
      ["Sign in as", tech.auth],
      ["Attachments", tech.storage],
      ["Only published posts shown", tech.permissions],
      ["OAuth2 / tokens", tech.oauth2],
      ["API gateway", tech.gateway],
      ["Feature flags", tech.flags]
    ];
    var grid = "";
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i][1]) continue;
      grid += '<div class="uth-line"><span class="act">' + lines[i][0] + '</span>' +
        '<span class="arr">&rarr;</span><span class="tech">' + escapeHtml(lines[i][1]) + '</span></div>';
    }

    var curl = 'curl -H "apikey: ' + anon + '" \\\\\\n  ' + origin + '/v1/db/posts';

    var body = '<div class="uth-grid">' + grid + '</div>' +
      '<div class="uth-key"><div class="lbl">Powered by the Truss client API</div>' +
      '<code id="anonKeyText">' + escapeHtml(anon) + '</code>' +
      '<div class="uth-curl"><pre id="curlText">' + escapeHtml(curl) + '</pre>' +
      '<button class="copybtn" id="copyCurl">Copy</button></div></div>' +
      '<div class="uth-foot">Everything on this page hit a real <b>Truss</b> backend over the same public anon key &mdash; no custom server code.</div>';

    el("uthBody").innerHTML = body;

    var copy = el("copyCurl");
    if (copy) copy.addEventListener("click", function () {
      var txt = curl;
      var done = function () { copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy"; }, 1400); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallbackCopy);
        else fallbackCopy();
      } catch (e) { fallbackCopy(); }
      function fallbackCopy() {
        try {
          var ta = document.createElement("textarea");
          ta.value = txt; document.body.appendChild(ta); ta.select();
          document.execCommand("copy"); document.body.removeChild(ta); done();
        } catch (e2) { /* ignore */ }
      }
    });
  }

  var uth = el("uth");
  el("uthToggle").addEventListener("click", function () {
    var open = uth.classList.toggle("open");
    this.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // ── Go ────────────────────────────────
  boot();
})();
</script>
</body>
</html>`;
