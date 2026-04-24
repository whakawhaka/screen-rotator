// Selection Scope — content script
// Lets the user marquee-select a region of the page and view it in a live,
// rotatable, zoomable floating panel. The mirror is built from CSS
// `-moz-element()`, which produces a LIVE rendering of any DOM element — so
// video frames, CSS animations, canvases, and dynamic content all keep moving
// inside the panel.

(() => {
  "use strict";

  // ---- Re-injection guard ---------------------------------------------------
  if (window.__SelectionScopeInstance) {
    window.__SelectionScopeInstance.toggle();
    return;
  }

  // ---- Constants ------------------------------------------------------------
  const WRAPPER_ID = "ffws-page-wrapper";
  const HOST_ID = "ffws-shadow-host";
  const Z_TOP = 2147483647; // max int32

  // ---- Styles (injected into shadow DOM) -----------------------------------
  const CSS = `
    :host {
      all: initial;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 13px;
      line-height: 1.3;
      color: rgba(255,255,255,0.92);
      -webkit-font-smoothing: antialiased;
    }
    * { box-sizing: border-box; }

    .root { font-family: inherit; color: inherit; }

    /* ---------- Selection overlay ---------- */
    .overlay {
      position: fixed;
      inset: 0;
      z-index: ${Z_TOP};
      cursor: crosshair;
      background:
        radial-gradient(ellipse at center, rgba(0,0,0,0.25), rgba(0,0,0,0.55));
      backdrop-filter: saturate(1.1) contrast(1.02);
      -webkit-backdrop-filter: saturate(1.1) contrast(1.02);
      user-select: none;
      -moz-user-select: none;
    }

    .hint {
      position: absolute;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 16px;
      background: rgba(14,14,16,0.92);
      border: 1px solid rgba(255,255,255,0.12);
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.85);
      white-space: nowrap;
      pointer-events: none;
    }
    .hint .dot { color: #d4ff00; font-size: 10px; }
    .hint .kbd {
      display: inline-block;
      padding: 2px 7px;
      border: 1px solid rgba(255,255,255,0.22);
      background: rgba(255,255,255,0.05);
      font-size: 11px;
      color: #d4ff00;
    }

    .rubber {
      position: absolute;
      border: 1px solid #d4ff00;
      background: rgba(212,255,0,0.08);
      box-shadow:
        0 0 0 1px rgba(0,0,0,0.5),
        0 0 24px rgba(212,255,0,0.25);
      pointer-events: none;
      display: none;
    }
    .rubber.active { display: block; }
    .rubber-label {
      position: absolute;
      top: -22px;
      left: 0;
      padding: 2px 6px;
      background: #d4ff00;
      color: #0a0a0a;
      font-family: ui-monospace, monospace;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }

    /* ---------- Control panel ---------- */
    .panel {
      position: fixed;
      top: 24px;
      right: 24px;
      width: 380px;
      z-index: ${Z_TOP};
      background: rgba(14,14,16,0.94);
      border: 1px solid rgba(255,255,255,0.1);
      backdrop-filter: blur(12px) saturate(1.2);
      -webkit-backdrop-filter: blur(12px) saturate(1.2);
      box-shadow:
        0 1px 0 rgba(255,255,255,0.04) inset,
        0 30px 80px -20px rgba(0,0,0,0.7),
        0 0 0 1px rgba(0,0,0,0.6);
      user-select: none;
      -moz-user-select: none;
    }

    .panel-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      cursor: grab;
      font-family: ui-monospace, monospace;
    }
    .panel-head:active { cursor: grabbing; }

    .brand {
      display: flex; align-items: center; gap: 8px;
      font-size: 11px;
      letter-spacing: 0.2em;
      color: #d4ff00;
      font-weight: 600;
    }
    .brand-dot {
      width: 8px; height: 8px;
      background: #d4ff00;
      box-shadow: 0 0 10px #d4ff00;
      border-radius: 50%;
    }

    .meta {
      margin-left: auto;
      font-size: 11px;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.4);
      font-variant-numeric: tabular-nums;
    }

    .close {
      width: 22px; height: 22px;
      display: grid; place-items: center;
      color: rgba(255,255,255,0.55);
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      transition: color 0.12s, background 0.12s;
    }
    .close:hover { color: #ff6464; background: rgba(255,100,100,0.1); }

    .stage {
      position: relative;
      height: 240px;
      overflow: hidden;
      background:
        radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06) 1px, transparent 1.5px) 0 0 / 14px 14px,
        linear-gradient(180deg, #0a0a0b 0%, #050506 100%);
      display: grid;
      place-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .mirror {
      background-repeat: no-repeat;
      background-size: auto;
      transform-origin: center center;
      transition: transform 0.04s linear;
      outline: 1px solid rgba(212,255,0,0.35);
      outline-offset: 0;
    }

    .crosshair {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(to right, transparent 49.9%, rgba(255,255,255,0.06) 49.9%, rgba(255,255,255,0.06) 50.1%, transparent 50.1%),
        linear-gradient(to bottom, transparent 49.9%, rgba(255,255,255,0.06) 49.9%, rgba(255,255,255,0.06) 50.1%, transparent 50.1%);
    }

    .controls { padding: 14px 14px 12px; display: flex; flex-direction: column; gap: 12px; }

    .ctrl {
      display: grid;
      grid-template-columns: 64px 1fr 56px;
      align-items: center;
      gap: 10px;
      font-family: ui-monospace, monospace;
    }
    .ctrl-label {
      font-size: 10px;
      letter-spacing: 0.18em;
      color: rgba(255,255,255,0.45);
    }
    .ctrl-value {
      font-size: 12px;
      color: #d4ff00;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 20px;
      background: transparent;
      cursor: pointer;
    }
    input[type="range"]::-moz-range-track {
      height: 2px;
      background: rgba(255,255,255,0.12);
    }
    input[type="range"]::-moz-range-progress {
      height: 2px;
      background: #d4ff00;
    }
    input[type="range"]::-moz-range-thumb {
      width: 14px; height: 14px;
      background: #fafafa;
      border: 2px solid #0a0a0a;
      box-shadow: 0 0 0 1px #d4ff00, 0 0 10px rgba(212,255,0,0.4);
      border-radius: 50%;
    }

    .buttons {
      display: flex;
      gap: 6px;
      margin-top: 2px;
    }
    .btn {
      flex: 1;
      padding: 9px 8px;
      font-family: ui-monospace, monospace;
      font-size: 10px;
      letter-spacing: 0.18em;
      text-align: center;
      color: rgba(255,255,255,0.75);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
      cursor: pointer;
      transition: all 0.12s;
      text-transform: uppercase;
    }
    .btn:hover {
      color: #d4ff00;
      border-color: rgba(212,255,0,0.5);
      background: rgba(212,255,0,0.05);
    }
    .btn:active { transform: translateY(1px); }

    .btn.primary {
      color: #0a0a0a;
      background: #d4ff00;
      border-color: #d4ff00;
      font-weight: 600;
    }
    .btn.primary:hover { background: #e6ff3d; border-color: #e6ff3d; color: #0a0a0a; }
  `;

  // ---- State ---------------------------------------------------------------
  const state = {
    active: false,
    panel: null,
    overlay: null,
    rubber: null,
    mirror: null,
    wrapper: null,
    selection: null, // {x, y, w, h} in document coords
    rotation: 0,
    zoom: 1,
    drag: null, // rubber-band drag state
    panelDrag: null,
  };

  let shadowHost = null;
  let shadow = null;

  // ---- Shadow DOM bootstrap ------------------------------------------------
  function ensureShadow() {
    if (shadow) return shadow;
    shadowHost = document.createElement("div");
    shadowHost.id = HOST_ID;
    // Host must be inert to layout; absolute keeps it out of flow.
    shadowHost.style.cssText =
      "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: " + Z_TOP + ";";
    document.documentElement.appendChild(shadowHost);
    shadow = shadowHost.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);

    const root = document.createElement("div");
    root.className = "root";
    shadow.appendChild(root);
    shadow.root = root;
    return shadow;
  }

  function tearDownShadow() {
    if (shadowHost) shadowHost.remove();
    shadowHost = null;
    shadow = null;
  }

  // ---- Page wrapper (so the widget UI isn't rendered into the mirror) -----
  function ensureWrapper() {
    let wrapper = document.getElementById(WRAPPER_ID);
    if (wrapper) return wrapper;
    wrapper = document.createElement("div");
    wrapper.id = WRAPPER_ID;
    // No styling: wrapper inherits body flow and contains everything body had.
    while (document.body.firstChild) {
      wrapper.appendChild(document.body.firstChild);
    }
    document.body.appendChild(wrapper);
    return wrapper;
  }

  function restoreWrapper() {
    const wrapper = document.getElementById(WRAPPER_ID);
    if (!wrapper) return;
    while (wrapper.firstChild) {
      document.body.insertBefore(wrapper.firstChild, wrapper);
    }
    wrapper.remove();
  }

  // ---- Public API (exposed via window.__SelectionScopeInstance) -----------
  const instance = {
    toggle() {
      if (state.active) {
        deactivate();
      } else {
        activate();
      }
    },
    activate,
    deactivate,
  };
  window.__SelectionScopeInstance = instance;

  // ---- Activation lifecycle ------------------------------------------------
  function activate() {
    if (state.active) return;
    state.active = true;
    state.wrapper = ensureWrapper();
    ensureShadow();
    showSelector();
  }

  function deactivate() {
    state.active = false;
    closePanel();
    closeSelector();
    restoreWrapper();
    tearDownShadow();
  }

  // ---- Selection overlay ---------------------------------------------------
  function showSelector() {
    const root = shadow.root;

    // Clean up any prior overlay
    closeSelector();

    const overlay = document.createElement("div");
    overlay.className = "overlay";

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.innerHTML =
      '<span class="dot">●</span>' +
      '<span class="kbd">Drag</span> to select a region' +
      '<span class="dot">/</span>' +
      '<span class="kbd">Esc</span> to cancel';
    overlay.appendChild(hint);

    const rubber = document.createElement("div");
    rubber.className = "rubber";
    const label = document.createElement("div");
    label.className = "rubber-label";
    rubber.appendChild(label);
    overlay.appendChild(rubber);

    root.appendChild(overlay);

    state.overlay = overlay;
    state.rubber = rubber;
    state.rubberLabel = label;

    overlay.addEventListener("mousedown", onSelectDown);
    window.addEventListener("keydown", onKeyDown, true);
  }

  function closeSelector() {
    if (state.overlay) {
      state.overlay.removeEventListener("mousedown", onSelectDown);
      state.overlay.remove();
      state.overlay = null;
      state.rubber = null;
      state.rubberLabel = null;
    }
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("mousemove", onSelectMove, true);
    window.removeEventListener("mouseup", onSelectUp, true);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      deactivate();
    }
  }

  function onSelectDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    state.drag = {
      startClient: { x: e.clientX, y: e.clientY },
      startScroll: { x: window.scrollX, y: window.scrollY },
    };
    const r = state.rubber;
    r.style.left = e.clientX + "px";
    r.style.top = e.clientY + "px";
    r.style.width = "0px";
    r.style.height = "0px";
    r.classList.add("active");
    state.rubberLabel.textContent = "0 × 0";
    window.addEventListener("mousemove", onSelectMove, true);
    window.addEventListener("mouseup", onSelectUp, true);
  }

  function onSelectMove(e) {
    if (!state.drag) return;
    const s = state.drag.startClient;
    const x = Math.min(s.x, e.clientX);
    const y = Math.min(s.y, e.clientY);
    const w = Math.abs(e.clientX - s.x);
    const h = Math.abs(e.clientY - s.y);
    const r = state.rubber;
    r.style.left = x + "px";
    r.style.top = y + "px";
    r.style.width = w + "px";
    r.style.height = h + "px";
    state.rubberLabel.textContent = `${Math.round(w)} × ${Math.round(h)}`;
  }

  function onSelectUp(e) {
    if (!state.drag) return;
    const s = state.drag.startClient;
    const startScroll = state.drag.startScroll;

    // Convert client coords (at start) and current page coords (at end) into
    // a document-space rectangle.
    const startPage = {
      x: s.x + startScroll.x,
      y: s.y + startScroll.y,
    };
    const endPage = { x: e.pageX, y: e.pageY };

    const x = Math.min(startPage.x, endPage.x);
    const y = Math.min(startPage.y, endPage.y);
    const w = Math.abs(endPage.x - startPage.x);
    const h = Math.abs(endPage.y - startPage.y);

    state.drag = null;
    window.removeEventListener("mousemove", onSelectMove, true);
    window.removeEventListener("mouseup", onSelectUp, true);

    if (w < 10 || h < 10) {
      // Too small — reset rubber and allow another drag.
      state.rubber.classList.remove("active");
      return;
    }

    state.selection = { x, y, w, h };
    closeSelector();
    openPanel();
  }

  // ---- Control panel -------------------------------------------------------
  function openPanel() {
    const root = shadow.root;
    closePanel();

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.innerHTML = `
      <div class="panel-head" data-role="drag">
        <span class="brand"><span class="brand-dot"></span>SCOPE</span>
        <span class="meta" data-role="meta"></span>
        <div class="close" data-role="close" title="Close">×</div>
      </div>
      <div class="stage">
        <div class="mirror" data-role="mirror"></div>
        <div class="crosshair"></div>
      </div>
      <div class="controls">
        <div class="ctrl">
          <span class="ctrl-label">ROTATE</span>
          <input type="range" min="-180" max="180" step="1" value="0" data-ctrl="rotation">
          <span class="ctrl-value" data-value="rotation">0°</span>
        </div>
        <div class="ctrl">
          <span class="ctrl-label">ZOOM</span>
          <input type="range" min="0.25" max="6" step="0.05" value="1" data-ctrl="zoom">
          <span class="ctrl-value" data-value="zoom">1.00×</span>
        </div>
        <div class="buttons">
          <button class="btn" data-action="reset">Reset</button>
          <button class="btn" data-action="reselect">Re-select</button>
          <button class="btn primary" data-action="close">Done</button>
        </div>
      </div>
    `;
    root.appendChild(panel);
    state.panel = panel;

    const mirror = panel.querySelector('[data-role="mirror"]');
    state.mirror = mirror;

    panel.querySelector('[data-role="meta"]').textContent =
      `${Math.round(state.selection.w)} × ${Math.round(state.selection.h)} px`;

    // Wire up controls
    const rotIn = panel.querySelector('[data-ctrl="rotation"]');
    const zoomIn = panel.querySelector('[data-ctrl="zoom"]');
    const rotVal = panel.querySelector('[data-value="rotation"]');
    const zoomVal = panel.querySelector('[data-value="zoom"]');

    rotIn.value = state.rotation;
    zoomIn.value = state.zoom;
    rotVal.textContent = `${state.rotation}°`;
    zoomVal.textContent = `${state.zoom.toFixed(2)}×`;

    rotIn.addEventListener("input", () => {
      state.rotation = Number(rotIn.value);
      rotVal.textContent = `${state.rotation}°`;
      applyTransform();
    });
    zoomIn.addEventListener("input", () => {
      state.zoom = Number(zoomIn.value);
      zoomVal.textContent = `${state.zoom.toFixed(2)}×`;
      applyTransform();
    });

    panel.querySelector('[data-action="reset"]').addEventListener("click", () => {
      state.rotation = 0;
      state.zoom = 1;
      rotIn.value = 0;
      zoomIn.value = 1;
      rotVal.textContent = "0°";
      zoomVal.textContent = "1.00×";
      applyTransform();
    });
    panel.querySelector('[data-action="reselect"]').addEventListener("click", () => {
      state.rotation = 0;
      state.zoom = 1;
      closePanel();
      showSelector();
    });
    panel.querySelector('[data-action="close"]').addEventListener("click", () => {
      deactivate();
    });
    panel.querySelector('[data-role="close"]').addEventListener("click", () => {
      deactivate();
    });

    // Make panel draggable
    const head = panel.querySelector('[data-role="drag"]');
    head.addEventListener("mousedown", onPanelDragDown);

    // Initialize the live mirror
    paintMirror();
    applyTransform();
  }

  function closePanel() {
    if (state.panel) {
      state.panel.remove();
      state.panel = null;
      state.mirror = null;
    }
    window.removeEventListener("mousemove", onPanelDragMove, true);
    window.removeEventListener("mouseup", onPanelDragUp, true);
  }

  // ---- Live mirror ---------------------------------------------------------
  function paintMirror() {
    const m = state.mirror;
    const sel = state.selection;
    if (!m || !sel) return;

    // Account for the wrapper's offset within the document (body margin, etc.)
    const wrapRect = state.wrapper.getBoundingClientRect();
    const wrapDocX = wrapRect.left + window.scrollX;
    const wrapDocY = wrapRect.top + window.scrollY;

    const offX = sel.x - wrapDocX;
    const offY = sel.y - wrapDocY;

    m.style.width = sel.w + "px";
    m.style.height = sel.h + "px";
    // The magic: live reference to the page-wrapper element. Video, canvas,
    // and animations inside #ffws-page-wrapper stay live in this background.
    m.style.backgroundImage = `-moz-element(#${WRAPPER_ID})`;
    m.style.backgroundPosition = `-${offX}px -${offY}px`;
  }

  function applyTransform() {
    const m = state.mirror;
    if (!m) return;
    // Fit-to-stage factor so the native-sized selection isn't clipped at 1×
    const stageH = 240;
    const stageW = 380; // panel width
    const fit = Math.min(1, stageW / state.selection.w, stageH / state.selection.h);
    const effective = fit * state.zoom;
    m.style.transform = `rotate(${state.rotation}deg) scale(${effective})`;
  }

  // ---- Panel drag ----------------------------------------------------------
  function onPanelDragDown(e) {
    if (e.target.closest(".close") || e.target.closest("button")) return;
    const panel = state.panel;
    const rect = panel.getBoundingClientRect();
    state.panelDrag = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
    };
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.left = rect.left + "px";
    panel.style.top = rect.top + "px";
    window.addEventListener("mousemove", onPanelDragMove, true);
    window.addEventListener("mouseup", onPanelDragUp, true);
    e.preventDefault();
  }
  function onPanelDragMove(e) {
    if (!state.panelDrag || !state.panel) return;
    const p = state.panel;
    p.style.left = (e.clientX - state.panelDrag.dx) + "px";
    p.style.top = Math.max(0, e.clientY - state.panelDrag.dy) + "px";
  }
  function onPanelDragUp() {
    state.panelDrag = null;
    window.removeEventListener("mousemove", onPanelDragMove, true);
    window.removeEventListener("mouseup", onPanelDragUp, true);
  }

  // ---- Message bridge (toolbar button toggles) ----------------------------
  if (typeof browser !== "undefined" && browser.runtime) {
    browser.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "toggle") instance.toggle();
    });
  }

  // ---- Kick off on first injection ----------------------------------------
  activate();
})();
