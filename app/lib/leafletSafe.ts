import type Leaflet from "leaflet";

/**
 * Leaflet asks its canvas renderer to redraw whenever a path is removed. When a whole map is removed, the renderer can be destroyed
 * before the paths that use it; their last redraw request then runs on a canvas that no longer exists and throws
 * ("Cannot read properties of undefined (reading 'clearRect' / 'save')"). Patched once: a renderer with no canvas has nothing to draw.
 */
export function safeLeaflet<T extends typeof Leaflet>(lib: T): T {
  const proto = lib.Canvas.prototype as unknown as { _redraw: () => void; _ctx?: unknown; __moveSafe?: boolean };
  if (!proto.__moveSafe) {
    const redraw = proto._redraw;
    proto._redraw = function (this: { _ctx?: unknown }) {
      if (this._ctx) redraw.call(this);
    };
    proto.__moveSafe = true;
  }
  return lib;
}

/** Removes a map cleanly: paths first, then the map (and with it its renderers), so nothing redraws a removed canvas. */
export function removeMap(lib: typeof Leaflet, m: Leaflet.Map): void {
  m.stop();
  m.off();
  m.eachLayer((layer) => {
    if (!(layer instanceof lib.Renderer)) m.removeLayer(layer);
  });
  m.remove();
}
