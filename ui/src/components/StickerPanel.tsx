import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { DownloadIcon, XIcon, PlusIcon, EyeIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner.tsx";

// ── Types ────────────────────────────────────────────────────────

interface Sticker {
  path: string;
  name: string;
  createdAt: number;
}

interface BoardItem {
  id: string;
  sticker: Sticker;
  x: number;
  y: number;
  r: number;
  w: number;
  h: number;
  z: number;
}

interface Props {
  wsEvent: MessageEvent | null;
}

// ── Constants ────────────────────────────────────────────────────

const CARD_SIZE = 200;
const MIN_SIZE = 120;
const PADDING = 16; // polaroid padding
const BOTTOM_PAD = 40; // polaroid bottom label area

// ── Main Component ───────────────────────────────────────────────

export default function StickerPanel({ wsEvent }: Props) {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewSticker, setPreviewSticker] = useState<Sticker | null>(null);
  const [zCounter, setZCounter] = useState(100);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    pointerStartX: number;
    pointerStartY: number;
  } | null>(null);
  const rotateRef = useRef<{
    id: string;
    cx: number;
    cy: number;
    startAngle: number;
    startPointerAngle: number;
  } | null>(null);
  const resizeRef = useRef<{
    id: string;
    dir: string;
    startW: number;
    startH: number;
    startX: number;
    startY: number;
    pointerStartX: number;
    pointerStartY: number;
  } | null>(null);

  // Load stickers from API
  const loadStickers = useCallback(async () => {
    try {
      const res = await fetch("/api/stickers");
      if (res.ok) {
        const data: Sticker[] = await res.json();
        setStickers(data);
      }
    } catch (err) {
      console.error("[StickerPanel] Error loading stickers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStickers();
  }, [loadStickers]);

  // Watch WS events
  useEffect(() => {
    if (!wsEvent) return;
    try {
      const event = JSON.parse(wsEvent.data);
      if (typeof event.path === "string" && event.path.startsWith("stickers/")) {
        loadStickers();
      }
    } catch {
      // ignore
    }
  }, [wsEvent, loadStickers]);

  // When stickers change, add new ones to the board
  useEffect(() => {
    setItems((prev) => {
      const existingPaths = new Set(prev.map((i) => i.sticker.path));
      const newStickers = stickers.filter((s) => !existingPaths.has(s.path));
      if (newStickers.length === 0) {
        // Remove items whose stickers no longer exist
        const currentPaths = new Set(stickers.map((s) => s.path));
        return prev.filter((i) => currentPaths.has(i.sticker.path));
      }
      const canvas = canvasRef.current;
      const cw = canvas?.clientWidth ?? 800;
      const ch = canvas?.clientHeight ?? 600;

      let nextZ = zCounter;
      const added: BoardItem[] = newStickers.map((s, i) => {
        // Scatter new items across the canvas
        const col = (prev.length + i) % 3;
        const row = Math.floor((prev.length + i) / 3);
        const baseX = 60 + col * (CARD_SIZE + 40);
        const baseY = 60 + row * (CARD_SIZE + BOTTOM_PAD + 40);
        const jitterX = (Math.random() - 0.5) * 40;
        const jitterY = (Math.random() - 0.5) * 40;
        const rotation = (Math.random() - 0.5) * 8;
        nextZ++;
        return {
          id: s.path,
          sticker: s,
          x: Math.min(baseX + jitterX, cw - CARD_SIZE - 20),
          y: Math.min(baseY + jitterY, ch - CARD_SIZE - 60),
          r: Math.round(rotation * 10) / 10,
          w: CARD_SIZE,
          h: CARD_SIZE + BOTTOM_PAD,
          z: nextZ,
        };
      });
      setZCounter(nextZ);
      // Also remove stale items
      const currentPaths = new Set(stickers.map((s) => s.path));
      const kept = prev.filter((i) => currentPaths.has(i.sticker.path));
      return [...kept, ...added];
    });
  }, [stickers]);

  // ── Item update helpers ─────────────────────────────────────

  const updateItem = useCallback((id: string, patch: Partial<BoardItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const bringToFront = useCallback(
    (id: string) => {
      const next = zCounter + 1;
      setZCounter(next);
      updateItem(id, { z: next });
    },
    [zCounter, updateItem],
  );

  // ── Pointer handlers (canvas-level) ─────────────────────────

  const getCanvasXY = (e: ReactPointerEvent | globalThis.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { cx: 0, cy: 0 };
    return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // Click on canvas background → deselect
    if (target === canvasRef.current || target.classList.contains("grid-bg")) {
      setSelectedId(null);
      return;
    }

    const itemEl = target.closest("[data-board-item]") as HTMLElement | null;
    if (!itemEl) {
      setSelectedId(null);
      return;
    }

    const id = itemEl.dataset.boardItem!;
    const item = items.find((i) => i.id === id);
    if (!item) return;

    e.preventDefault();
    setSelectedId(id);
    bringToFront(id);

    const { cx, cy } = getCanvasXY(e);

    // Rotate handle?
    if (target.closest("[data-rotate-handle]")) {
      const elRect = itemEl.getBoundingClientRect();
      const canvasRect = canvasRef.current!.getBoundingClientRect();
      const itemCx = elRect.left - canvasRect.left + elRect.width / 2;
      const itemCy = elRect.top - canvasRect.top + elRect.height / 2;
      rotateRef.current = {
        id,
        cx: itemCx,
        cy: itemCy,
        startAngle: item.r,
        startPointerAngle:
          (Math.atan2(cy - itemCy, cx - itemCx) * 180) / Math.PI,
      };
      (target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Resize handle?
    const resizeEl = target.closest("[data-resize]") as HTMLElement | null;
    if (resizeEl) {
      resizeRef.current = {
        id,
        dir: resizeEl.dataset.resize!,
        startW: item.w,
        startH: item.h,
        startX: item.x,
        startY: item.y,
        pointerStartX: cx,
        pointerStartY: cy,
      };
      resizeEl.setPointerCapture(e.pointerId);
      return;
    }

    // Drag
    dragRef.current = {
      id,
      startX: item.x,
      startY: item.y,
      pointerStartX: cx,
      pointerStartY: cy,
    };
    itemEl.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const { cx, cy } = getCanvasXY(e);

    if (dragRef.current) {
      const d = dragRef.current;
      updateItem(d.id, {
        x: d.startX + (cx - d.pointerStartX),
        y: d.startY + (cy - d.pointerStartY),
      });
    }

    if (rotateRef.current) {
      const r = rotateRef.current;
      const angle = (Math.atan2(cy - r.cy, cx - r.cx) * 180) / Math.PI;
      const delta = angle - r.startPointerAngle;
      updateItem(r.id, { r: Math.round((r.startAngle + delta) * 10) / 10 });
    }

    if (resizeRef.current) {
      const rs = resizeRef.current;
      const dx = cx - rs.pointerStartX;
      const dy = cy - rs.pointerStartY;
      let newW = rs.startW;
      let newH = rs.startH;
      let newX = rs.startX;
      let newY = rs.startY;

      if (rs.dir === "se") {
        newW = Math.max(MIN_SIZE, rs.startW + dx);
        newH = Math.max(MIN_SIZE, rs.startH + dy);
      } else if (rs.dir === "sw") {
        newW = Math.max(MIN_SIZE, rs.startW - dx);
        newH = Math.max(MIN_SIZE, rs.startH + dy);
        if (newW > MIN_SIZE) newX = rs.startX + dx;
      } else if (rs.dir === "ne") {
        newW = Math.max(MIN_SIZE, rs.startW + dx);
        newH = Math.max(MIN_SIZE, rs.startH - dy);
        if (newH > MIN_SIZE) newY = rs.startY + dy;
      } else if (rs.dir === "nw") {
        newW = Math.max(MIN_SIZE, rs.startW - dx);
        newH = Math.max(MIN_SIZE, rs.startH - dy);
        if (newW > MIN_SIZE) newX = rs.startX + dx;
        if (newH > MIN_SIZE) newY = rs.startY + dy;
      }
      updateItem(rs.id, { w: newW, h: newH, x: newX, y: newY });
    }
  };

  const handlePointerUp = () => {
    dragRef.current = null;
    rotateRef.current = null;
    resizeRef.current = null;
  };

  // ── Download ────────────────────────────────────────────────

  const handleDownload = (sticker: Sticker) => {
    window.open(`/api/sticker?path=${encodeURIComponent(sticker.path)}&download`, "_blank");
  };

  // ── Render ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F9F8F4]">
        <Spinner className="size-6" />
        <span className="ml-2 text-sm text-[#999] font-[Inter,sans-serif] tracking-wider">
          Loading...
        </span>
      </div>
    );
  }

  const stickerCount = items.length;

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden select-none"
      style={{ fontFamily: "'Inter', sans-serif", background: "#F9F8F4", color: "#2D2D2D" }}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="h-12 border-b border-black/5 flex items-center justify-between px-6 bg-[#F9F8F4]/80 backdrop-blur-sm z-10 shrink-0">
        <span className="text-[10px] text-gray-500 tracking-[0.2em] uppercase font-medium">
          Sticker / Board
        </span>
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full hover:bg-black/5 transition-colors group"
            title="Add sticker via chat"
          >
            <PlusIcon className="size-3.5 text-gray-400 group-hover:text-[#4a9e8e]" />
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Sticker</span>
          </button>
          {previewSticker && (
            <button
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors text-gray-400 hover:text-[#4a9e8e]"
              onClick={() => setPreviewSticker(null)}
            >
              <EyeIcon className="size-4" />
            </button>
          )}
        </div>
      </header>

      {/* ── Canvas ─────────────────────────────────────────── */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden cursor-default"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: "none" }}
      >
        {/* Grid background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            backgroundSize: "40px 40px",
            backgroundImage:
              "linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)",
          }}
        />

        {/* Empty state */}
        {items.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div className="text-5xl opacity-[0.12]">🎨</div>
            <div className="text-sm font-medium text-gray-400/60 tracking-wide">
              No stickers yet
            </div>
            <div className="text-[11px] text-center max-w-[220px] leading-relaxed text-gray-400/40">
              Ask the agent to create stickers and they will appear here on the board.
            </div>
          </div>
        )}

        {/* Board items */}
        {items.map((item) => {
          const isSelected = selectedId === item.id;
          return (
            <BoardItemCard
              key={item.id}
              item={item}
              isSelected={isSelected}
              isDragging={dragRef.current?.id === item.id}
              onPreview={() => setPreviewSticker(item.sticker)}
              onDownload={() => handleDownload(item.sticker)}
            />
          );
        })}
      </div>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="h-9 border-t border-black/5 bg-[#F9F8F4] flex items-center justify-between px-6 z-10 shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[9px] text-gray-400 uppercase tracking-widest cursor-pointer hover:text-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />
            Board
          </span>
        </div>
        <div className="flex-1 flex justify-center">
          <div className="h-0.5 w-16 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#4a9e8e] transition-all duration-500"
              style={{ width: stickerCount > 0 ? `${Math.min(100, stickerCount * 15)}%` : "0%" }}
            />
          </div>
        </div>
        <span className="text-[9px] text-gray-400 uppercase tracking-widest">
          Stickers {stickerCount}
        </span>
      </footer>

      {/* ── Preview overlay ────────────────────────────────── */}
      {previewSticker && (
        <StickerPreview
          sticker={previewSticker}
          onClose={() => setPreviewSticker(null)}
          onDownload={() => handleDownload(previewSticker)}
        />
      )}
    </div>
  );
}

// ── Board Item Card (Polaroid style) ─────────────────────────────

function BoardItemCard({
  item,
  isSelected,
  isDragging,
  onPreview,
  onDownload,
}: {
  item: BoardItem;
  isSelected: boolean;
  isDragging: boolean;
  onPreview: () => void;
  onDownload: () => void;
}) {
  return (
    <div
      data-board-item={item.id}
      className={`absolute touch-none select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        left: item.x,
        top: item.y,
        width: item.w,
        height: item.h,
        transform: `rotate(${item.r}deg)`,
        zIndex: item.z,
        boxShadow: isDragging
          ? "0 20px 40px rgba(0,0,0,0.15)"
          : "0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04)",
        outline: isSelected ? "1.5px solid rgba(74,158,142,0.5)" : "none",
        outlineOffset: isSelected ? 3 : 0,
        transition: isDragging ? "box-shadow 0.15s" : "box-shadow 0.2s, outline 0.15s",
      }}
    >
      {/* Polaroid card */}
      <div className="w-full h-full bg-white rounded-sm flex flex-col" style={{ padding: PADDING / 2 }}>
        {/* Image area */}
        <div
          className="flex-1 overflow-hidden relative bg-gray-50 rounded-sm"
          style={{ margin: 2 }}
        >
          {/* Checkerboard bg for transparency */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-conic-gradient(#f5f5f5 0% 25%, #fff 0% 50%)",
              backgroundSize: "16px 16px",
            }}
          />
          <img
            src={`/api/sticker?path=${encodeURIComponent(item.sticker.path)}`}
            alt={item.sticker.name}
            className="absolute inset-0 w-full h-full object-contain p-2"
            draggable={false}
            loading="lazy"
          />
        </div>

        {/* Label */}
        <div className="flex items-center justify-between px-1 pt-1.5 pb-0.5" style={{ minHeight: 28 }}>
          <p
            className="text-[11px] text-gray-400 italic truncate flex-1 text-center"
            title={item.sticker.name}
          >
            {item.sticker.name}
          </p>
        </div>
      </div>

      {/* ── Selection controls ───────────────────── */}
      {isSelected && (
        <>
          {/* Action buttons */}
          <div
            className="absolute -top-9 right-0 flex items-center gap-1 bg-white rounded-full shadow-md border border-gray-100 px-1 py-0.5"
            style={{ zIndex: 10 }}
          >
            <button
              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-[#4a9e8e] transition-colors"
              onPointerDown={(e) => { e.stopPropagation(); onPreview(); }}
              title="Preview"
            >
              <EyeIcon className="size-3" />
            </button>
            <button
              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-[#4a9e8e] transition-colors"
              onPointerDown={(e) => { e.stopPropagation(); onDownload(); }}
              title="Download"
            >
              <DownloadIcon className="size-3" />
            </button>
          </div>

          {/* Rotate handle */}
          <div
            data-rotate-handle
            className="absolute left-1/2 -translate-x-1/2 w-6 h-6 bg-white border-[1.5px] border-[rgba(74,158,142,0.6)] rounded-full flex items-center justify-center cursor-crosshair shadow-sm"
            style={{ bottom: -28, zIndex: 10 }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#4a9e8e"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
            </svg>
          </div>

          {/* Resize handles */}
          {(["se", "sw", "ne", "nw"] as const).map((dir) => (
            <div
              key={dir}
              data-resize={dir}
              className="absolute w-2.5 h-2.5 bg-white border-[1.5px] border-[rgba(74,158,142,0.6)] rounded-[2px]"
              style={{
                zIndex: 10,
                ...(dir === "se" ? { bottom: -5, right: -5, cursor: "se-resize" } : {}),
                ...(dir === "sw" ? { bottom: -5, left: -5, cursor: "sw-resize" } : {}),
                ...(dir === "ne" ? { top: -5, right: -5, cursor: "ne-resize" } : {}),
                ...(dir === "nw" ? { top: -5, left: -5, cursor: "nw-resize" } : {}),
              }}
            />
          ))}

          {/* Hint */}
          <div
            className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] tracking-[0.12em] text-[rgba(74,158,142,0.8)] pointer-events-none"
            style={{ bottom: -44 }}
          >
            MOVE · ↻ ROTATE · ⌟ RESIZE
          </div>
        </>
      )}
    </div>
  );
}

// ── Sticker Preview Modal ────────────────────────────────────────

function StickerPreview({
  sticker,
  onClose,
  onDownload,
}: {
  sticker: Sticker;
  onClose: () => void;
  onDownload: () => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl max-w-lg max-h-[80vh] flex flex-col overflow-hidden border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <span className="text-sm font-medium truncate text-gray-700">
            {sticker.name}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-[#4a9e8e] transition-colors"
              onClick={onDownload}
            >
              <DownloadIcon className="size-4" />
            </button>
            <button
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              onClick={onClose}
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>
        <div
          className="flex-1 flex items-center justify-center p-8"
          style={{
            backgroundImage:
              "repeating-conic-gradient(#f5f5f5 0% 25%, #fff 0% 50%)",
            backgroundSize: "20px 20px",
          }}
        >
          <img
            src={`/api/sticker?path=${encodeURIComponent(sticker.path)}`}
            alt={sticker.name}
            className="max-w-full max-h-[60vh] object-contain"
          />
        </div>
      </div>
    </div>
  );
}
