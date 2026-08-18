/* ==========================================================================
   GearUp — landing intro
   --------------------------------------------------------------------------
   One file. Injects its own styles and markup, plays, removes itself, and
   leaves no trace in the DOM. It never touches your existing markup, styles
   or scripts.

   Install: put this line as the FIRST thing inside <body> on index.html

       <script src="gearup-intro.js"></script>

   Remove that line and the intro is gone. That is the whole undo.

   How it fails: safely. If this file 404s, if the script throws, if
   JavaScript is off entirely — nothing appears and the site loads normally.
   There is also a hard watchdog below that tears the curtain down no matter
   what goes wrong, so no visitor can ever be left staring at it.
   ========================================================================== */

(function () {
  'use strict';

  var T0 = Date.now();   // everything is timed from here, not from mount
  var FADE = 420;        // the exit cross-fade, counted inside the total

  /* ----------------------------------------------------------- SETTINGS */
  var CFG = {

    /* Total run time before the site is revealed, in milliseconds.
       3000 matches GearUp_Intro_1920x1080.mp4 exactly. */
    duration: 3000,

    /* How often a given visitor sees it.
         'session' — once, until they close the browser        (current)
         'day'     — once every 24 hours
         'always'  — every single page load                                */
    replay: 'session',

    /* Which pages it runs on. Empty array [] means every page.            */
    onlyOnPaths: ['/', '/index.html', '/index'],

    /* The words. Kept identical to the video.                             */
    tagline: 'Interactive engineering books · AI interview coach',
    subline: 'For mechanical & automotive engineers'
  };

  /* ------------------------------------------------------------- GUARDS */
  try {
    var win = window, doc = document;

    // Deep links skip it. Someone following gearup.study/#books, or landing
    // on a page from search with an anchor, wants the anchor — not a curtain.
    if (win.location.hash) return;

    // Page scope.
    if (CFG.onlyOnPaths.length) {
      var path = win.location.pathname.replace(/\/+$/, '') || '/';
      var ok = CFG.onlyOnPaths.some(function (p) {
        return (p.replace(/\/+$/, '') || '/') === path;
      });
      if (!ok) return;
    }

    // Already seen?
    var KEY = 'gu_intro_seen';
    var store = null;
    try { store = win.sessionStorage; } catch (e) { store = null; }
    var dayStore = null;
    try { dayStore = win.localStorage; } catch (e) { dayStore = null; }

    if (CFG.replay === 'session') {
      if (store && store.getItem(KEY)) return;
      if (store) store.setItem(KEY, '1');
    } else if (CFG.replay === 'day') {
      var last = dayStore && dayStore.getItem(KEY);
      if (last && (Date.now() - parseInt(last, 10)) < 864e5) return;
      if (dayStore) dayStore.setItem(KEY, String(Date.now()));
    }

    var reduced = win.matchMedia &&
                  win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var T = reduced ? 900 : Math.max(900, CFG.duration);

    /* --------------------------------------------------------- THE GEAR */
    /* The same path as your favicon and your nav mark, so it is literally
       the same gear — not a lookalike. */
    var GEAR = 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z';

    function gearSvg(op, size) {
      return '<svg class="gu-i-scatter" viewBox="0 0 24 24" aria-hidden="true" ' +
             'style="width:' + size + 'px;height:' + size + 'px;opacity:' + op + '">' +
             '<path d="' + GEAR + '" fill="#93a6c6"/></svg>';
    }

    /* ------------------------------------------------------------- CSS */
    /* Every delay is a fraction of --t, so changing CFG.duration retimes the
       whole sequence proportionally. No magic numbers to keep in sync. */
    var css = [
      'html.gu-i-lock{overflow:hidden !important}',

      /* The curtain drops instantly so the site never flashes underneath it.
         The sequence itself is held until the webfonts are in, so the
         wordmark can never appear in Arial for a frame. */
      '#gu-intro *{animation-play-state:paused}',
      '#gu-intro.gu-i-go *{animation-play-state:running}',

      '#gu-intro{position:fixed;inset:0;z-index:2147483000;display:flex;--fade:420ms;',
      '  align-items:center;justify-content:center;background:#080d18;',
      '  overflow:hidden;--t:' + T + 'ms;--gold:#F2A900;--ink:#eaf1ff;',
      '  font-family:"Archivo","Helvetica Neue",Arial,sans-serif;',
      '  -webkit-font-smoothing:antialiased;contain:strict;',
      '  animation:gu-i-safety 1ms linear calc(var(--t) + 1400ms) forwards}',

      /* the glow behind the mark */
      '#gu-intro .gu-i-glow{position:absolute;left:50%;top:50%;width:min(150vw,1400px);',
      '  aspect-ratio:2/1;transform:translate(-50%,-50%);pointer-events:none;',
      '  background:radial-gradient(closest-side,rgba(47,111,237,.20),rgba(47,111,237,.06) 45%,transparent 72%);',
      '  opacity:0;animation:gu-i-glow calc(var(--t) * .95) ease-out forwards}',

      /* drafting grid, the same one the site now carries */
      '#gu-intro .gu-i-grid{position:absolute;inset:0;pointer-events:none;opacity:0;',
      '  background-image:linear-gradient(rgba(130,175,255,.06) 1px,transparent 1px),',
      '    linear-gradient(90deg,rgba(130,175,255,.06) 1px,transparent 1px),',
      '    linear-gradient(rgba(130,175,255,.03) 1px,transparent 1px),',
      '    linear-gradient(90deg,rgba(130,175,255,.03) 1px,transparent 1px);',
      '  background-size:120px 120px,120px 120px,24px 24px,24px 24px;',
      '  -webkit-mask-image:radial-gradient(closest-side,#000,transparent 78%);',
      '  mask-image:radial-gradient(closest-side,#000,transparent 78%);',
      '  animation:gu-i-fade calc(var(--t) * .3) ease-out forwards}',

      /* scattered tools, as in the video */
      '#gu-intro .gu-i-tools{position:absolute;inset:0;pointer-events:none}',
      '#gu-intro .gu-i-scatter{position:absolute;fill:#93a6c6}',

      /* the stack */
      '#gu-intro .gu-i-stack{position:relative;display:flex;flex-direction:column;',
      '  align-items:center;gap:0;padding:0 6vw;text-align:center;max-width:100%;',
      '  animation:gu-i-drift var(--t) linear forwards}',

      /* mark + wordmark on one baseline */
      '#gu-intro .gu-i-mark{display:flex;align-items:center;justify-content:center;',
      '  gap:clamp(10px,1.6vw,22px);position:relative}',
      '#gu-intro .gu-i-gear{width:clamp(30px,5.2vw,64px);height:clamp(30px,5.2vw,64px);',
      '  flex:0 0 auto;opacity:0;transform-origin:50% 50%;',
      '  animation:gu-i-gear calc(var(--t) * .30) cubic-bezier(.16,.84,.34,1) calc(var(--t) * .05) forwards}',
      '#gu-intro .gu-i-gear path{fill:var(--gold)}',

      '#gu-intro .gu-i-word{font-weight:800;letter-spacing:-.035em;line-height:1;',
      '  font-size:clamp(38px,7.4vw,104px);color:var(--ink);white-space:nowrap;',
      '  -webkit-clip-path:inset(0 100% 0 0);clip-path:inset(0 100% 0 0);',
      '  animation:gu-i-wipe calc(var(--t) * .30) cubic-bezier(.22,.7,.24,1) calc(var(--t) * .18) forwards}',
      '#gu-intro .gu-i-word b{color:var(--gold);font-weight:800}',

      /* the ring that pushes out of the gear */
      '#gu-intro .gu-i-ring{position:absolute;left:calc(clamp(15px,2.6vw,32px));top:50%;',
      '  width:clamp(30px,5.2vw,64px);height:clamp(30px,5.2vw,64px);',
      '  margin:calc(clamp(30px,5.2vw,64px) / -2) 0 0 calc(clamp(30px,5.2vw,64px) / -2);',
      '  border:1px solid rgba(242,169,0,.55);border-radius:50%;opacity:0;pointer-events:none;',
      '  animation:gu-i-ring calc(var(--t) * .30) cubic-bezier(.2,.7,.3,1) calc(var(--t) * .34) forwards}',

      /* underline sweep */
      '#gu-intro .gu-i-rule{height:1px;width:0;margin-top:clamp(10px,1.4vw,18px);',
      '  background:linear-gradient(90deg,transparent,var(--gold) 22%,var(--gold) 78%,transparent);',
      '  animation:gu-i-rule calc(var(--t) * .26) cubic-bezier(.22,.7,.24,1) calc(var(--t) * .38) forwards}',

      /* the two lines of type */
      '#gu-intro .gu-i-tag,#gu-intro .gu-i-sub{',
      '  font-family:"IBM Plex Mono",ui-monospace,"Courier New",monospace;',
      '  text-transform:uppercase;opacity:0;text-wrap:balance}',
      '#gu-intro .gu-i-tag{margin-top:clamp(14px,2vw,26px);color:#dbe6f7;',
      '  font-size:clamp(9px,1.15vw,13px);letter-spacing:.24em;line-height:1.9;',
      '  animation:gu-i-rise calc(var(--t) * .26) cubic-bezier(.2,.7,.3,1) calc(var(--t) * .52) forwards}',
      '#gu-intro .gu-i-sub{margin-top:clamp(6px,.8vw,10px);color:#8296b8;',
      '  font-size:clamp(7.5px,.85vw,10px);letter-spacing:.22em;line-height:1.9;',
      '  animation:gu-i-rise calc(var(--t) * .24) cubic-bezier(.2,.7,.3,1) calc(var(--t) * .63) forwards}',

      /* the sheen that crosses the video at the end */
      '#gu-intro .gu-i-sheen{position:absolute;inset:-20% -60%;pointer-events:none;',
      '  background:linear-gradient(100deg,transparent 42%,rgba(255,255,255,.045) 50%,transparent 58%);',
      '  transform:translateX(-60%);',
      '  animation:gu-i-sheen calc(var(--t) * .30) ease-in-out calc(var(--t) * .70) forwards}',

      /* skip */
      '#gu-intro .gu-i-skip{position:absolute;bottom:clamp(18px,3.4vh,34px);left:50%;',
      '  transform:translateX(-50%);opacity:0;border:0;background:none;cursor:pointer;',
      '  font-family:"IBM Plex Mono",ui-monospace,"Courier New",monospace;',
      '  font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#54658a;',
      '  padding:10px 14px;animation:gu-i-fade calc(var(--t) * .2) linear calc(var(--t) * .40) forwards}',
      '#gu-intro .gu-i-skip:hover{color:#93a6c6}',

      /* exit */
      '#gu-intro.gu-i-out{animation:none;opacity:0;transform:translateY(-10px) scale(1.012);',
      '  transition:opacity .5s ease,transform .5s cubic-bezier(.4,0,.2,1);pointer-events:none}',

      /* keyframes */
      '@keyframes gu-i-fade{to{opacity:1}}',
      '@keyframes gu-i-glow{0%{opacity:0;transform:translate(-50%,-50%) scale(.72)}',
      '  60%{opacity:1}100%{opacity:.85;transform:translate(-50%,-50%) scale(1)}}',
      '@keyframes gu-i-gear{0%{opacity:0;transform:rotate(-170deg) scale(.45)}',
      '  100%{opacity:1;transform:rotate(0deg) scale(1)}}',
      '@keyframes gu-i-wipe{0%{-webkit-clip-path:inset(0 100% 0 0);clip-path:inset(0 100% 0 0)}',
      '  100%{-webkit-clip-path:inset(0 -6% 0 0);clip-path:inset(0 -6% 0 0)}}',
      '@keyframes gu-i-ring{0%{opacity:0;transform:scale(.4)}',
      '  35%{opacity:.9}100%{opacity:0;transform:scale(2.9)}}',
      '@keyframes gu-i-rule{0%{width:0}100%{width:min(78vw,var(--rulew,520px))}}',
      '@keyframes gu-i-rise{0%{opacity:0;transform:translateY(9px)}',
      '  100%{opacity:1;transform:translateY(0)}}',
      '@keyframes gu-i-drift{0%{transform:scale(.985)}100%{transform:scale(1)}}',
      '@keyframes gu-i-sheen{0%{transform:translateX(-60%)}100%{transform:translateX(60%)}}',
      '@keyframes gu-i-safety{to{opacity:0;visibility:hidden;pointer-events:none}}',

      /* --- portrait phones and tablets ---------------------------------- */
      /* The wordmark drops onto its own line under the gear only when it has
         to; the tagline is allowed two lines and loses some tracking so it
         never runs off the edge. */
      '@media (max-width:520px){',
      '  #gu-intro .gu-i-word{font-size:clamp(34px,12.5vw,60px)}',
      '  #gu-intro .gu-i-gear{width:clamp(26px,8vw,40px);height:clamp(26px,8vw,40px)}',
      '  #gu-intro .gu-i-stack{padding:0 5vw}',
      '  #gu-intro .gu-i-tag{font-size:9.5px;letter-spacing:.16em;max-width:none}',
      '  #gu-intro .gu-i-sub{font-size:8px;letter-spacing:.17em}',
      '  #gu-intro .gu-i-ring{left:clamp(13px,4vw,20px);',
      '    width:clamp(26px,8vw,40px);height:clamp(26px,8vw,40px);',
      '    margin:calc(clamp(26px,8vw,40px) / -2) 0 0 calc(clamp(26px,8vw,40px) / -2)}',
      '}',
      '@media (min-width:521px) and (max-width:900px){',
      '  #gu-intro .gu-i-word{font-size:clamp(52px,9vw,76px)}',
      '  #gu-intro .gu-i-tag{font-size:11px;letter-spacing:.2em;max-width:44ch}',
      '  #gu-intro .gu-i-sub{font-size:9px;letter-spacing:.2em}',
      '}',
      /* short landscape — phone held sideways, or a small laptop */
      '@media (orientation:landscape) and (max-height:520px){',
      '  #gu-intro .gu-i-word{font-size:clamp(34px,7vh,64px)}',
      '  #gu-intro .gu-i-gear{width:clamp(24px,5vh,40px);height:clamp(24px,5vh,40px)}',
      '  #gu-intro .gu-i-tag{margin-top:10px;font-size:9.5px}',
      '  #gu-intro .gu-i-sub{font-size:8px}',
      '  #gu-intro .gu-i-skip{bottom:10px}',
      '}',

      /* --- reduced motion ----------------------------------------------- */
      '@media (prefers-reduced-motion:reduce){',
      '  #gu-intro *{animation-duration:1ms !important;animation-delay:0ms !important}',
      '  #gu-intro .gu-i-gear,#gu-intro .gu-i-tag,#gu-intro .gu-i-sub,',
      '  #gu-intro .gu-i-glow{opacity:1 !important;transform:none !important}',
      '  #gu-intro .gu-i-word{-webkit-clip-path:none !important;clip-path:none !important}',
      '  #gu-intro .gu-i-rule{width:min(78vw,520px) !important}',
      '  #gu-intro .gu-i-ring,#gu-intro .gu-i-sheen{display:none}',
      '  #gu-intro .gu-i-stack{animation:none !important;transform:none !important}',
      '  #gu-intro .gu-i-skip{opacity:1 !important}',
      '}'
    ].join('\n');

    /* ---------------------------------------------------------- MARKUP */
    var style = doc.createElement('style');
    style.id = 'gu-intro-css';
    style.textContent = css;
    (doc.head || doc.documentElement).appendChild(style);

    var scatter = [
      [8, 16, 3.5, 26], [88, 22, 3.0, 20], [16, 74, 2.6, 30],
      [79, 78, 3.4, 24], [50, 8, 2.4, 18], [33, 88, 2.8, 22],
      [66, 92, 2.2, 16], [94, 55, 2.6, 18], [4, 44, 2.4, 20]
    ].map(function (s) {
      return '<span style="position:absolute;left:' + s[0] + '%;top:' + s[1] + '%;' +
             'transform:translate(-50%,-50%) rotate(' + (s[0] * 7 % 90) + 'deg)">' +
             gearSvg(s[2] / 100, s[3]) + '</span>';
    }).join('');

    var el = doc.createElement('div');
    el.id = 'gu-intro';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="gu-i-glow"></div>' +
      '<div class="gu-i-grid"></div>' +
      '<div class="gu-i-tools">' + scatter + '</div>' +
      '<div class="gu-i-stack">' +
        '<div class="gu-i-mark">' +
          '<svg class="gu-i-gear" viewBox="0 0 24 24"><path d="' + GEAR + '"/></svg>' +
          '<div class="gu-i-word">Gear<b>Up</b></div>' +
          '<span class="gu-i-ring"></span>' +
        '</div>' +
        '<div class="gu-i-rule"></div>' +
        '<div class="gu-i-tag">' + CFG.tagline + '</div>' +
        '<div class="gu-i-sub">' + CFG.subline + '</div>' +
      '</div>' +
      '<div class="gu-i-sheen"></div>' +
      '<button class="gu-i-skip" type="button">Skip</button>';

    function mount() {
      if (!doc.body) { return setTimeout(mount, 8); }
      doc.body.insertBefore(el, doc.body.firstChild);
      doc.documentElement.classList.add('gu-i-lock');
    }

    /* Start the sequence, compressed to whatever is left of the budget, so
       the site is revealed at CFG.duration after this script ran — not at
       CFG.duration after the fonts happened to arrive. */
    function run() {
      var spent = Date.now() - T0;
      var avail = Math.max(1200, T - FADE - spent);
      el.style.setProperty('--t', avail + 'ms');
      // the rule is drawn to the wordmark's own width, not an arbitrary one
      var mark = el.querySelector('.gu-i-mark');
      if (mark) el.style.setProperty('--rulew', Math.round(mark.getBoundingClientRect().width) + 'px');
      el.classList.add('gu-i-go');
      start(avail);
    }

    /* ------------------------------------------------------------- EXIT */
    var gone = false, timers = [];
    function finish() {
      if (gone) return;
      gone = true;
      timers.forEach(clearTimeout);
      el.classList.add('gu-i-out');
      doc.documentElement.classList.remove('gu-i-lock');
      off();
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        if (style.parentNode) style.parentNode.removeChild(style);
      }, FADE + 160);
    }

    var EV = ['click', 'touchstart', 'wheel', 'keydown', 'touchmove'];
    function onSkip(e) {
      if (e.type === 'keydown' && e.key !== 'Escape' && e.key !== ' ' && e.key !== 'Enter') return;
      finish();
    }
    function off() { EV.forEach(function (t) { win.removeEventListener(t, onSkip, true); }); }

    function start(avail) {
      EV.forEach(function (t) { win.addEventListener(t, onSkip, { capture: true, passive: true }); });
      timers.push(setTimeout(finish, avail));
      // watchdog: nothing above this line can leave the curtain up
      timers.push(setTimeout(function () {
        if (!gone) finish();
        var stuck = doc.getElementById('gu-intro');
        if (stuck && stuck.parentNode) stuck.parentNode.removeChild(stuck);
        doc.documentElement.classList.remove('gu-i-lock');
      }, avail + 2500));
    }

    /* Curtain up now; sequence when the type is ready, or 600ms, whichever
       comes first. Either way the site appears CFG.duration from here. */
    mount();
    var started = false;
    function go() { if (started) return; started = true; run(); }
    if (doc.fonts && doc.fonts.ready && doc.fonts.ready.then) {
      doc.fonts.ready.then(go)['catch'](go);
      setTimeout(go, 600);
    } else {
      setTimeout(go, 60);
    }

  } catch (err) {
    // Never let the curtain be the reason the site is unusable.
    try {
      document.documentElement.classList.remove('gu-i-lock');
      var n = document.getElementById('gu-intro');
      if (n && n.parentNode) n.parentNode.removeChild(n);
    } catch (e2) {}
  }
})();
