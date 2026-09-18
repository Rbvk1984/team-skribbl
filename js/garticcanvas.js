// Gartic Phone canvas: strokes are captured locally and submitted
// as a JSON array when the player clicks Submit. Unlike Skribbl,
// there's no live broadcasting — nobody else sees your drawing
// until the reveal at the end of the game.

export function createGarticBoard(canvasEl) {
  const ctx = canvasEl.getContext("2d");
  const strokes = [];
  let drawing = false;
  let last = null;
  let color = "#1c1c1c";
  let lineWidth = 4;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvasEl.getBoundingClientRect();
    const snapshot = canvasEl.toDataURL();
    canvasEl.width  = rect.width  * ratio;
    canvasEl.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvasEl.clientWidth, canvasEl.clientHeight);
    img.src = snapshot;
  }
  resize();
  window.addEventListener("resize", resize);

  function toNorm(x, y) {
    const rect = canvasEl.getBoundingClientRect();
    return { x: x / rect.width, y: y / rect.height };
  }

  function drawSegment(from, to, strokeColor, strokeWidth) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = strokeWidth;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    const rect = canvasEl.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(from.x * rect.width, from.y * rect.height);
    ctx.lineTo(to.x   * rect.width, to.y   * rect.height);
    ctx.stroke();
  }

  function pointerPos(e) {
    const rect    = canvasEl.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function start(e) {
    drawing = true;
    const p = pointerPos(e);
    last = toNorm(p.x, p.y);
  }

  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const p       = pointerPos(e);
    const current = toNorm(p.x, p.y);
    drawSegment(last, current, color, lineWidth);
    strokes.push({ from: last, to: current, color, width: lineWidth, type: "line" });
    last = current;
  }

  function end() { drawing = false; last = null; }

  canvasEl.addEventListener("mousedown",  start);
  canvasEl.addEventListener("mousemove",  move);
  window.addEventListener("mouseup",      end);
  canvasEl.addEventListener("touchstart", start, { passive: false });
  canvasEl.addEventListener("touchmove",  move,  { passive: false });
  canvasEl.addEventListener("touchend",   end);

  return {
    // Get the recorded strokes as a JSON string for database storage
    getStrokesJson() { return JSON.stringify(strokes); },

    // Replay a stored stroke array onto this canvas (for showing a submitted drawing)
    replayStrokes(jsonOrArray) {
      const data = typeof jsonOrArray === "string" ? JSON.parse(jsonOrArray) : jsonOrArray;
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      strokes.length = 0;
      const rect = canvasEl.getBoundingClientRect();
      data.forEach(stroke => {
        if (stroke.type === "clear") {
          ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
          return;
        }
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth   = stroke.width;
        ctx.lineCap     = "round";
        ctx.lineJoin    = "round";
        ctx.beginPath();
        ctx.moveTo(stroke.from.x * rect.width, stroke.from.y * rect.height);
        ctx.lineTo(stroke.to.x   * rect.width, stroke.to.y   * rect.height);
        ctx.stroke();
      });
    },

    clear() {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      strokes.push({ type: "clear" });
    },

    setColor(c)  { color     = c; },
    setWidth(w)  { lineWidth = w; },
    hasStrokes() { return strokes.some(s => s.type !== "clear"); },
  };
}
