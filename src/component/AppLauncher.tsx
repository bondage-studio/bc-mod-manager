import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import cn from "@/util/cn.ts";

export interface AppLauncherItem {
  id: string;
  label: ComponentChildren;
  onClick: () => void;
}

interface AppLauncherProps {
  items: AppLauncherItem[];
  onToggle: () => void;
  open: boolean;
  title: string;
}

type DockEdge = "left" | "right" | "top" | "bottom";

interface DockState {
  edge: DockEdge;
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

const STORAGE_KEY = "bmm-app-launcher-dock";
const INTRO_HINT_MS = 3000;

const EDGE_PADDING = 12;
const DRAG_THRESHOLD = 5;

const VERTICAL_BUTTON = {
  width: 36,
  height: 64,
};

const HORIZONTAL_BUTTON = {
  width: 64,
  height: 36,
};

const MENU_WIDTH = 256;
const MENU_MAX_HEIGHT = 320;
const MENU_GAP = 10;

function safeClamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function getViewport() {
  return {
    width: globalThis.window?.innerWidth ?? 1280,
    height: globalThis.window?.innerHeight ?? 720,
  };
}

function isHorizontalEdge(edge: DockEdge) {
  return edge === "top" || edge === "bottom";
}

function getButtonSize(edge: DockEdge) {
  return isHorizontalEdge(edge) ? HORIZONTAL_BUTTON : VERTICAL_BUTTON;
}

function normalizeDock(dock: DockState, viewport = getViewport()): DockState {
  return {
    edge: dock.edge,
    x: safeClamp(
      dock.x,
      EDGE_PADDING,
      viewport.width - HORIZONTAL_BUTTON.width - EDGE_PADDING,
    ),
    y: safeClamp(
      dock.y,
      EDGE_PADDING,
      viewport.height - VERTICAL_BUTTON.height - EDGE_PADDING,
    ),
  };
}

function getDockedButtonRect(dock: DockState, viewport = getViewport()) {
  const size = getButtonSize(dock.edge);

  switch (dock.edge) {
    case "left":
      return {
        x: 0,
        y: dock.y,
        width: size.width,
        height: size.height,
      };

    case "right":
      return {
        x: Math.max(0, viewport.width - size.width),
        y: dock.y,
        width: size.width,
        height: size.height,
      };

    case "top":
      return {
        x: dock.x,
        y: 0,
        width: size.width,
        height: size.height,
      };

    case "bottom":
      return {
        x: dock.x,
        y: Math.max(0, viewport.height - size.height),
        width: size.width,
        height: size.height,
      };
  }
}

function getNearestEdge(centerX: number, centerY: number, viewport = getViewport()): DockEdge {
  const distances: Array<[DockEdge, number]> = [
    ["left", centerX],
    ["right", viewport.width - centerX],
    ["top", centerY],
    ["bottom", viewport.height - centerY],
  ];

  return distances.reduce((best, current) => (current[1] < best[1] ? current : best))[0];
}

function estimateMenuHeight(itemCount: number) {
  return Math.min(MENU_MAX_HEIGHT, 44 + itemCount * 41);
}

function getMenuStyle(
  rect: { x: number; y: number; width: number; height: number },
  edge: DockEdge,
  itemCount: number,
  viewport = getViewport(),
): JSX.CSSProperties {
  const menuHeight = estimateMenuHeight(itemCount);

  let x = rect.x;
  let y = rect.y;

  switch (edge) {
    case "left":
      x = rect.x + rect.width + MENU_GAP;
      y = rect.y;
      break;

    case "right":
      x = rect.x - MENU_WIDTH - MENU_GAP;
      y = rect.y;
      break;

    case "top":
      x = rect.x + rect.width / 2 - MENU_WIDTH / 2;
      y = rect.y + rect.height + MENU_GAP;
      break;

    case "bottom":
      x = rect.x + rect.width / 2 - MENU_WIDTH / 2;
      y = rect.y - menuHeight - MENU_GAP;
      break;
  }

  x = safeClamp(x, EDGE_PADDING, viewport.width - MENU_WIDTH - EDGE_PADDING);
  y = safeClamp(y, EDGE_PADDING, viewport.height - menuHeight - EDGE_PADDING);

  return {
    left: `${x - rect.x}px`,
    top: `${y - rect.y}px`,
    width: `${MENU_WIDTH}px`,
  };
}

function getButtonEdgeClass(edge: DockEdge) {
  switch (edge) {
    case "left":
      return "h-16 w-9 rounded-r-full border-l-0 pr-1";

    case "right":
      return "h-16 w-9 rounded-l-full border-r-0 pl-1";

    case "top":
      return "h-9 w-16 rounded-b-full border-t-0 pb-1";

    case "bottom":
      return "h-9 w-16 rounded-t-full border-b-0 pt-1";
  }
}

function getAutoHideClass(edge: DockEdge) {
  switch (edge) {
    case "left":
      return "-translate-x-4 opacity-70 hover:translate-x-0 hover:opacity-100";

    case "right":
      return "translate-x-4 opacity-70 hover:translate-x-0 hover:opacity-100";

    case "top":
      return "-translate-y-4 opacity-70 hover:translate-y-0 hover:opacity-100";

    case "bottom":
      return "translate-y-4 opacity-70 hover:translate-y-0 hover:opacity-100";
  }
}

function getClosedMenuMotionClass(edge: DockEdge) {
  switch (edge) {
    case "left":
      return "-translate-x-2";

    case "right":
      return "translate-x-2";

    case "top":
      return "-translate-y-2";

    case "bottom":
      return "translate-y-2";
  }
}

function getMenuOriginClass(edge: DockEdge) {
  switch (edge) {
    case "left":
      return "origin-left";

    case "right":
      return "origin-right";

    case "top":
      return "origin-top";

    case "bottom":
      return "origin-bottom";
  }
}

function getArcPath(edge: DockEdge) {
  switch (edge) {
    case "left":
      return "M7 5 C16 14 16 26 7 35";

    case "right":
      return "M17 5 C8 14 8 26 17 35";

    case "top":
      return "M5 7 C14 16 26 16 35 7";

    case "bottom":
      return "M5 17 C14 8 26 8 35 17";
  }
}

function getIntroVars(edge: DockEdge) {
  switch (edge) {
    case "left":
      return {
        "--bmm-launcher-intro-hidden-x": "-24px",
        "--bmm-launcher-intro-hidden-y": "0px",
        "--bmm-launcher-intro-nudge-x": "14px",
        "--bmm-launcher-intro-nudge-y": "0px",
        "--bmm-launcher-intro-small-x": "7px",
        "--bmm-launcher-intro-small-y": "0px",
      };

    case "right":
      return {
        "--bmm-launcher-intro-hidden-x": "24px",
        "--bmm-launcher-intro-hidden-y": "0px",
        "--bmm-launcher-intro-nudge-x": "-14px",
        "--bmm-launcher-intro-nudge-y": "0px",
        "--bmm-launcher-intro-small-x": "-7px",
        "--bmm-launcher-intro-small-y": "0px",
      };

    case "top":
      return {
        "--bmm-launcher-intro-hidden-x": "0px",
        "--bmm-launcher-intro-hidden-y": "-24px",
        "--bmm-launcher-intro-nudge-x": "0px",
        "--bmm-launcher-intro-nudge-y": "14px",
        "--bmm-launcher-intro-small-x": "0px",
        "--bmm-launcher-intro-small-y": "7px",
      };

    case "bottom":
      return {
        "--bmm-launcher-intro-hidden-x": "0px",
        "--bmm-launcher-intro-hidden-y": "24px",
        "--bmm-launcher-intro-nudge-x": "0px",
        "--bmm-launcher-intro-nudge-y": "-14px",
        "--bmm-launcher-intro-small-x": "0px",
        "--bmm-launcher-intro-small-y": "-7px",
      };
  }
}

export default function AppLauncher({ items, onToggle, open, title }: AppLauncherProps) {
  const [viewport, setViewport] = useState(getViewport);

  const [dock, setDock] = useState<DockState>({
    edge: "right",
    x: 96,
    y: 96,
  });

  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [introHint, setIntroHint] = useState(true);
  const [coarsePointer, setCoarsePointer] = useState(false);

  const dragRef = useRef<DragState | null>(null);
  const skipClickRef = useRef(false);

useEffect(() => {
  if (open) {
    setIntroHint(false);
    return;
  }

  const timer = window.setTimeout(() => {
    setIntroHint(false);
  }, INTRO_HINT_MS);

  return () => {
    window.clearTimeout(timer);
  };
}, []);

  // Stop the intro "shake" as soon as the menu is opened.
  useEffect(() => {
    if (open) setIntroHint(false);
  }, [open]);

  // Touch / hover-less devices have no `hover:` state to reveal the docked
  // button, so the auto-hide is disabled there to keep it fully tappable.
  useEffect(() => {
    const query = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setCoarsePointer(query.matches);

    update();
    query.addEventListener("change", update);

    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const nextViewport = getViewport();
    setViewport(nextViewport);

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const saved = JSON.parse(raw) as DockState;

      if (!["left", "right", "top", "bottom"].includes(saved.edge)) return;

      setDock(
        normalizeDock(
          {
            edge: saved.edge,
            x: Number.isFinite(saved.x) ? saved.x : 96,
            y: Number.isFinite(saved.y) ? saved.y : 96,
          },
          nextViewport,
        ),
      );
    } catch {
      // Ignore corrupted localStorage.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dock));
    } catch {
      // Ignore storage errors.
    }
  }, [dock]);

  useEffect(() => {
    const handleResize = () => {
      const nextViewport = getViewport();

      setViewport(nextViewport);
      setDock((current) => normalizeDock(current, nextViewport));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const buttonSize = getButtonSize(dock.edge);

  const dockedRect = getDockedButtonRect(dock, viewport);

  const buttonRect = dragPoint
    ? {
        x: dragPoint.x,
        y: dragPoint.y,
        width: buttonSize.width,
        height: buttonSize.height,
      }
    : dockedRect;

  const rootStyle = {
    left: `${buttonRect.x}px`,
    top: `${buttonRect.y}px`,
    ...getIntroVars(dock.edge),
  } as JSX.CSSProperties;

  const menuStyle = getMenuStyle(buttonRect, dock.edge, items.length, viewport);

  const isDragging = dragPoint !== null;
  const isHorizontal = isHorizontalEdge(dock.edge);

  const handlePointerDown = (event: JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;

    const currentViewport = getViewport();
    const rect = getDockedButtonRect(dock, currentViewport);

    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: rect.x,
      startY: rect.y,
      width: rect.width,
      height: rect.height,
      lastX: rect.x,
      lastY: rect.y,
      moved: false,
    };

    setDragPoint({
      x: rect.x,
      y: rect.y,
    });

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;

    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    drag.moved = true;

    const currentViewport = getViewport();

    const x = safeClamp(drag.startX + dx, 0, currentViewport.width - drag.width);
    const y = safeClamp(drag.startY + dy, 0, currentViewport.height - drag.height);

    drag.lastX = x;
    drag.lastY = y;

    setDragPoint({ x, y });
  };

  const handlePointerUp = (event: JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }

    setDragPoint(null);

    if (!drag.moved) return;

    skipClickRef.current = true;

    const currentViewport = getViewport();
    const centerX = drag.lastX + drag.width / 2;
    const centerY = drag.lastY + drag.height / 2;
    const edge = getNearestEdge(centerX, centerY, currentViewport);

    const nextDock: DockState = {
      edge,
      x: centerX - HORIZONTAL_BUTTON.width / 2,
      y: centerY - VERTICAL_BUTTON.height / 2,
    };

    setViewport(currentViewport);
    setDock(normalizeDock(nextDock, currentViewport));
  };

  const handleClick = () => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }

    onToggle();
  };

  return (
    <div
      style={rootStyle}
      className={cn("fixed z-50", isDragging && "select-none")}
    >
      <style>
        {`
          @keyframes bmm-launcher-intro-root {
            0% {
              opacity: 0.35;
              transform: translate(
                var(--bmm-launcher-intro-hidden-x),
                var(--bmm-launcher-intro-hidden-y)
              );
            }

            14% {
              opacity: 1;
              transform: translate(
                var(--bmm-launcher-intro-nudge-x),
                var(--bmm-launcher-intro-nudge-y)
              );
            }

            28% {
              transform: translate(0, 0);
            }

            45% {
              transform: translate(
                var(--bmm-launcher-intro-small-x),
                var(--bmm-launcher-intro-small-y)
              );
            }

            60% {
              transform: translate(0, 0);
            }

            78% {
              transform: translate(
                var(--bmm-launcher-intro-small-x),
                var(--bmm-launcher-intro-small-y)
              );
            }

            100% {
              opacity: 1;
              transform: translate(0, 0);
            }
          }

          @keyframes bmm-launcher-intro-button {
            0% {
              background-color: rgba(255, 255, 255, 0);
              border-color: rgba(255, 255, 255, 0.22);
              color: rgba(255, 255, 255, 0.72);
              box-shadow: none;
            }

            18% {
              background-color: rgba(255, 255, 255, 0.38);
              border-color: rgba(255, 255, 255, 0.75);
              color: rgba(255, 255, 255, 1);
              box-shadow:
                0 0 0 8px rgba(255, 255, 255, 0.12),
                0 14px 36px rgba(0, 0, 0, 0.24);
            }

            42% {
              background-color: rgba(255, 255, 255, 0.16);
              box-shadow:
                0 0 0 3px rgba(255, 255, 255, 0.08),
                0 8px 24px rgba(0, 0, 0, 0.16);
            }

            66% {
              background-color: rgba(255, 255, 255, 0.34);
              border-color: rgba(255, 255, 255, 0.68);
              color: rgba(255, 255, 255, 1);
              box-shadow:
                0 0 0 10px rgba(255, 255, 255, 0.11),
                0 14px 36px rgba(0, 0, 0, 0.22);
            }

            100% {
              background-color: rgba(255, 255, 255, 0);
              border-color: rgba(255, 255, 255, 0.22);
              color: rgba(255, 255, 255, 0.72);
              box-shadow: none;
            }
          }

          @keyframes bmm-launcher-intro-ring {
            0% {
              opacity: 0;
              transform: scale(0.72);
            }

            20% {
              opacity: 0.75;
            }

            100% {
              opacity: 0;
              transform: scale(1.85);
            }
          }

          .bmm-launcher-intro-root {
            animation: bmm-launcher-intro-root ${INTRO_HINT_MS}ms cubic-bezier(0.2, 0.9, 0.2, 1) both;
          }

          .bmm-launcher-intro-button {
            animation: bmm-launcher-intro-button ${INTRO_HINT_MS}ms ease-in-out both;
          }

          .bmm-launcher-intro-button::before {
            content: "";
            position: absolute;
            inset: -10px;
            border-radius: inherit;
            border: 1px solid rgba(255, 255, 255, 0.52);
            pointer-events: none;
            animation: bmm-launcher-intro-ring 900ms ease-out 2;
          }
        `}
      </style>

      <div
        className={cn(
          "transition-[opacity,transform] duration-200",
          !open &&
            !isDragging &&
            !introHint &&
            (coarsePointer ? "opacity-100" : getAutoHideClass(dock.edge)),
          introHint && !isDragging && "bmm-launcher-intro-root opacity-100",
          open && "opacity-100",
          isDragging && "cursor-grabbing opacity-90",
        )}
      >
        <button
          type="button"
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title={title}
          aria-expanded={open}
          aria-label={title}
          className={cn(
            "relative flex touch-none items-center justify-center",
            "border border-white/20 bg-white/0 text-white/75 shadow-none backdrop-blur-sm",
            "transition-[background,border-color,box-shadow,color,transform] duration-200",
            "hover:border-white/40 hover:bg-white/20 hover:text-white hover:shadow-bmm-card",
            "active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2",
            getButtonEdgeClass(dock.edge),
            open && "border-white/45 bg-white/25 text-white shadow-bmm-card",
            introHint && !isDragging && "bmm-launcher-intro-button",
          )}
        >
          <svg
            aria-hidden="true"
            viewBox={isHorizontal ? "0 0 40 24" : "0 0 24 40"}
            className={isHorizontal ? "h-6 w-10" : "h-10 w-6"}
          >
            <path
              d={getArcPath(dock.edge)}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div
        style={menuStyle}
        className={cn(
          "absolute overflow-hidden rounded-xl border border-bmm-border bg-bmm-surface shadow-bmm-panel",
          "transition-[max-height,opacity,transform] duration-200",
          getMenuOriginClass(dock.edge),
          open
            ? "pointer-events-auto max-h-80 translate-x-0 translate-y-0 opacity-100"
            : cn(
                "pointer-events-none max-h-0 opacity-0",
                getClosedMenuMotionClass(dock.edge),
              ),
        )}
      >
        <div className="border-b border-bmm-border bg-bmm-surface-muted px-3 py-2">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-bmm-faint">
            {title}
          </div>
        </div>

        <div className="p-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className={cn(
                "group flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left",
                "text-sm font-semibold text-bmm-ink",
                "transition-[background,color,transform] duration-150",
                "hover:bg-bmm-surface-muted hover:text-bmm-accent",
                "active:translate-y-px",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bmm-accent/25",
              )}
            >
              <span className="min-w-0 truncate">{item.label}</span>

              <span className="shrink-0 text-bmm-faint transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-bmm-accent">
                ›
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}