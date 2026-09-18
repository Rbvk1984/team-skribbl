// A small, dependency-free drawing surface. Strokes are described as
// normalized (0-1) coordinates so they scale correctly across different
// screen sizes between the drawer and the guessers.

export function createDrawingBoard(canvasEl, { isDrawer, onStroke }) {
  const ctx = canvasEl.getContext("2d");
  let drawing = false;
  let last = null;
  let color = "#1c1c1c";
  let lineWidth = 4;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvasEl.getBoundingClientRect();
    canvasEl.width = rect.width * ratio;
    canvasEl.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
  }
  resize();
  window.addEventListener("resize", () => {
    const snapshot = canvasEl.toDataURL();
    resize();
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvasEl.clientWidth, canvasEl.clientHeight);
    img.src = snapshot;
  });

  function toNorm(x, y) {
    const rect = canvasEl.getBoundingClientRect();
    return { x: x / rect.width, y: y / rect.height };
  }

  function drawSegment(from, to, strokeColor, strokeWidth) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const rect = canvasEl.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(from.x * rect.width, from.y * rect.height);
    ctx.lineTo(to.x * rect.width, to.y * rect.height);
    ctx.stroke();
  }

  function pointerPos(e) {
    const rect = canvasEl.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function start(e) {
    if (!isDrawer()) return;
    drawing = true;
    const p = pointerPos(e);
    last = toNorm(p.x, p.y);
  }

  function move(e) {
    if (!drawing || !isDrawer()) return;
    e.preventDefault();
    const p = pointerPos(e);
    const current = toNorm(p.x, p.y);
    drawSegment(last, current, color, lineWidth);
    onStroke({ from: last, to: current, color, width: lineWidth, type: "line" });
    last = current;
  }

  function end() {
    drawing = false;
    last = null;
  }

  canvasEl.addEventListener("mousedown", start);
  canvasEl.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvasEl.addEventListener("touchstart", start, { passive: false });
  canvasEl.addEventListener("touchmove", move, { passive: false });
  canvasEl.addEventListener("touchend", end);

  return {
    // Called when a stroke event arrives from another player via Realtime Broadcast
    renderRemoteStroke(stroke) {
      if (stroke.type === "clear") {
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        return;
      }
      drawSegment(stroke.from, stroke.to, stroke.color, stroke.width);
    },
    clear(broadcast = true) {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      if (broadcast) onStroke({ type: "clear" });
    },
    setColor(c) { color = c; },
    setLineWidth(w) { lineWidth = w; },
  };
}
