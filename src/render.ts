/**
 * Draws effect.ts's frames as SVG. content.ts lays one over X's icon; the settings page uses one
 * for its preview. Every node is made with createElementNS, never from markup.
 */
import { frameAt, geometry, mixColor, VIEWBOX, type EffectKind } from "./effect.ts";

const SVG = "http://www.w3.org/2000/svg";

/**
 * The icon's colour before and after the click. The outline, the liquid and the sparks all share it:
 * when a bookmark is removed, the last of the liquid fades to grey with the outline.
 */
export type Colors = { from: string; to: string };

let seq = 0;

export class EffectView {
  readonly svg: SVGSVGElement;
  private readonly body: SVGPathElement;
  private readonly liquid: SVGPathElement;
  private readonly clip: SVGPathElement;
  private readonly sparks: SVGLineElement[];

  constructor(doc: Document) {
    const el = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] => doc.createElementNS(SVG, tag);
    this.svg = el("svg");
    this.svg.setAttribute("viewBox", `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`);
    this.svg.setAttribute("aria-hidden", "true");
    this.svg.setAttribute("focusable", "false");
    // Each view needs its own id: two effects can play at once in the same shadow root.
    const id = `surprise-collection-clip-${++seq}`;
    const clipPath = el("clipPath");
    clipPath.id = id;
    this.clip = el("path");
    clipPath.append(this.clip);
    const defs = el("defs");
    defs.append(clipPath);
    this.body = el("path");
    this.body.setAttribute("fill-rule", "evenodd");
    this.liquid = el("path");
    this.liquid.setAttribute("clip-path", `url(#${id})`);
    const g = el("g");
    g.setAttribute("stroke-linecap", "round");
    g.setAttribute("fill", "none");
    this.sparks = [0, 1, 2].map(() => g.appendChild(el("line")));
    this.svg.append(defs, this.body, this.liquid, g);
  }

  /** Draw the effect `t` ms in. Returns true once it has finished. */
  draw(kind: EffectKind, t: number, c: Colors): boolean {
    const f = frameAt(kind, t);
    const g = geometry(f);
    const color = mixColor(c.from, c.to, f.tint);
    this.body.setAttribute("d", g.hole ? g.body + g.hole : g.body);
    this.body.setAttribute("fill", color);
    if (g.liquid && g.clip) {
      this.liquid.setAttribute("d", g.liquid);
      this.liquid.setAttribute("fill", color);
      this.clip.setAttribute("d", g.clip);
      this.liquid.removeAttribute("display");
    } else {
      this.liquid.setAttribute("display", "none");
    }
    this.sparks.forEach((line, i) => {
      const s = f.sparks[i];
      if (!s) return line.setAttribute("display", "none");
      line.removeAttribute("display");
      line.setAttribute("x1", String(s.x1));
      line.setAttribute("y1", String(s.y1));
      line.setAttribute("x2", String(s.x2));
      line.setAttribute("y2", String(s.y2));
      line.setAttribute("stroke-width", String(s.width));
      line.setAttribute("stroke", color);
      line.setAttribute("opacity", String(s.alpha));
    });
    return f.done;
  }

  /** The icon at rest, as X draws it. */
  rest(bookmarked: boolean, color: string): void {
    this.draw(bookmarked ? "add" : "remove", Infinity, { from: color, to: color });
  }
}
