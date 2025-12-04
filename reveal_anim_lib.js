/**
 * TikZ-Style SVG Connection Library for Reveal.js
 * Draw beautiful lines and arrows between DOM elements with TikZ-inspired syntax
 * 
 * Example usage:
 *   draw('#my-svg').path('#elem1.east', '#elem2.west').arrow('->').stroke('red');
 *   draw('#svg').path('#a', '#b').curve('out=90,in=180').arrow('<->');
 */

const draw = (function() {
  'use strict';

  // ============================================================================
  // ANCHOR SYSTEM (TikZ-style)
  // ============================================================================

  const ANCHORS = {
    // Cardinal directions
    'north': (rect) => ({ x: rect.left + rect.width / 2, y: rect.top }),
    'south': (rect) => ({ x: rect.left + rect.width / 2, y: rect.bottom }),
    'east': (rect) => ({ x: rect.right, y: rect.top + rect.height / 2 }),
    'west': (rect) => ({ x: rect.left, y: rect.top + rect.height / 2 }),
    
    // Corners
    'north east': (rect) => ({ x: rect.right, y: rect.top }),
    'north west': (rect) => ({ x: rect.left, y: rect.top }),
    'south east': (rect) => ({ x: rect.right, y: rect.bottom }),
    'south west': (rect) => ({ x: rect.left, y: rect.bottom }),
    
    // Aliases
    'ne': (rect) => ANCHORS['north east'](rect),
    'nw': (rect) => ANCHORS['north west'](rect),
    'se': (rect) => ANCHORS['south east'](rect),
    'sw': (rect) => ANCHORS['south west'](rect),
    
    // Center
    'center': (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }),
    
    // Custom numeric anchors (0-360 degrees, 0=east, 90=north)
    'angle': (rect, angle) => {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const rx = rect.width / 2;
      const ry = rect.height / 2;
      const rad = (angle * Math.PI) / 180;
      return {
        x: cx + rx * Math.cos(rad),
        y: cy - ry * Math.sin(rad)
      };
    }
  };

  /**
   * Parse anchor specification from selector
   * Examples: "#elem1.east", "#elem2.north west", "#elem3.45"
   */
  function parseAnchor(spec) {
    const parts = spec.split('.');
    const selector = parts[0];
    let anchor = 'center';
    
    if (parts.length > 1) {
      const anchorSpec = parts.slice(1).join(' ');
      // Check if it's a number (angle)
      if (!isNaN(anchorSpec)) {
        anchor = { type: 'angle', value: parseFloat(anchorSpec) };
      } else {
        anchor = anchorSpec;
      }
    }
    
    return { selector, anchor };
  }

  /**
   * Get point for an element + anchor
   */
  function getPoint(spec) {
    const { selector, anchor } = parseAnchor(spec);
    const el = document.querySelector(selector);
    if (!el) {
      console.warn(`Element not found: ${selector}`);
      return { x: 0, y: 0 };
    }
    
    const rect = el.getBoundingClientRect();
    
    if (typeof anchor === 'object' && anchor.type === 'angle') {
      return ANCHORS.angle(rect, anchor.value);
    }
    
    const anchorFn = ANCHORS[anchor] || ANCHORS.center;
    return anchorFn(rect);
  }

  /**
   * Convert screen coordinates to SVG space
   */
  function screenToSvg(svg, x, y) {
    const pt = svg.createSVGPoint();
    pt.x = x;
    pt.y = y;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  // ============================================================================
  // PATH BUILDER (TikZ-style chaining API)
  // ============================================================================

  class PathBuilder {
    constructor(svg) {
      this.svg = typeof svg === 'string' ? document.querySelector(svg) : svg;
      this.from = null;
      this.to = null;
      this.pathType = 'line'; // 'line', 'curve', 'ortho'
      this.curveOpts = {};
      this.arrowType = null; // '->', '<-', '<->', null
      this.strokeColor = 'black';
      this.strokeWidth = 2;
      this.dashed = false;
      this.animated = true;
      this.duration = 0.6;
      this.delay = 0;
      this.offset = { start: 0, end: 0 };
    }

    /**
     * Set start and end points
     * @param {string} from - Selector with anchor (e.g., "#elem1.east")
     * @param {string} to - Selector with anchor (e.g., "#elem2.west")
     */
    path(from, to) {
      this.from = from;
      this.to = to;
      return this;
    }

    /**
     * Make the path curved with control points
     * @param {string|Object} opts - Options like "out=90,in=180" or {out: 90, in: 180}
     */
    curve(opts = {}) {
      this.pathType = 'curve';
      
      if (typeof opts === 'string') {
        // Parse TikZ-style options: "out=90,in=180"
        const parsed = {};
        opts.split(',').forEach(pair => {
          const [key, val] = pair.split('=').map(s => s.trim());
          parsed[key] = parseFloat(val);
        });
        this.curveOpts = parsed;
      } else {
        this.curveOpts = opts;
      }
      return this;
    }

    /**
     * Make orthogonal (Manhattan) path
     * @param {string} mode - 'hvh' (horizontal-vertical-horizontal) or 'vhv'
     */
    ortho(mode = 'hvh') {
      this.pathType = 'ortho';
      this.curveOpts.mode = mode;
      return this;
    }

    /**
     * Add arrow heads
     * @param {string} type - '->', '<-', '<->', or null
     */
    arrow(type = '->') {
      this.arrowType = type;
      return this;
    }

    /**
     * Set stroke color
     */
    stroke(color) {
      this.strokeColor = color;
      return this;
    }

    /**
     * Set stroke width
     */
    width(w) {
      this.strokeWidth = w;
      return this;
    }

    /**
     * Make dashed line
     */
    dash(pattern = '5,5') {
      this.dashed = pattern;
      return this;
    }

    /**
     * Control animation
     */
    animate(enabled = true, duration = 0.6, delay = 0) {
      this.animated = enabled;
      this.duration = duration;
      this.delay = delay;
      return this;
    }

    /**
     * Add offset from anchor points
     */
    shorten(start = 0, end = 0) {
      this.offset = { start, end };
      return this;
    }

    /**
     * Build and render the path
     */
    draw() {
      if (!this.from || !this.to) {
        console.warn('Must specify from and to points');
        return null;
      }

      // Get points
      let p1 = getPoint(this.from);
      let p2 = getPoint(this.to);

      // Apply offsets
      if (this.offset.start || this.offset.end) {
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const totalDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const remainingDist = totalDist - this.offset.start - this.offset.end;
        
        if (remainingDist > 0) {
          p1 = {
            x: p1.x + this.offset.start * Math.cos(angle),
            y: p1.y + this.offset.start * Math.sin(angle)
          };
          p2 = {
            x: p1.x + remainingDist * Math.cos(angle),
            y: p1.y + remainingDist * Math.sin(angle)
          };
        }
      }

      // Convert to SVG space
      const svgP1 = screenToSvg(this.svg, p1.x, p1.y);
      const svgP2 = screenToSvg(this.svg, p2.x, p2.y);

      // Create path element
      const path = this._createPath(svgP1, svgP2);
      
      // Style the path
      path.setAttribute('stroke', this.strokeColor);
      path.setAttribute('stroke-width', this.strokeWidth);
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('fill', 'none');

      if (this.dashed) {
        path.setAttribute('stroke-dasharray', this.dashed);
      }

      // Add arrows
      if (this.arrowType) {
        this._addArrows(path);
      }

      // Animation
      if (this.animated) {
        path.style.opacity = 0;
        path.style.transition = `opacity ${this.duration}s ease`;
      }

      this.svg.appendChild(path);

      if (this.animated) {
        setTimeout(() => {
          requestAnimationFrame(() => {
            path.style.opacity = 1;
          });
        }, this.delay * 1000);
      }

      return path;
    }

    _createPath(p1, p2) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      let d;

      if (this.pathType === 'line') {
        d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
      } else if (this.pathType === 'curve') {
        d = this._createCurvePath(p1, p2);
      } else if (this.pathType === 'ortho') {
        d = this._createOrthoPath(p1, p2);
      }

      path.setAttribute('d', d);
      return path;
    }

    _createCurvePath(p1, p2) {
      const outAngle = this.curveOpts.out !== undefined ? this.curveOpts.out : 0;
      const inAngle = this.curveOpts.in !== undefined ? this.curveOpts.in : 180;
      const distance = this.curveOpts.distance || Math.hypot(p2.x - p1.x, p2.y - p1.y) / 3;

      // Convert angles to radians (TikZ: 0=right, 90=up)
      const outRad = (outAngle * Math.PI) / 180;
      const inRad = (inAngle * Math.PI) / 180;

      // Calculate control points
      const c1 = {
        x: p1.x + distance * Math.cos(outRad),
        y: p1.y - distance * Math.sin(outRad)
      };
      const c2 = {
        x: p2.x + distance * Math.cos(inRad),
        y: p2.y - distance * Math.sin(inRad)
      };

      return `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
    }

    _createOrthoPath(p1, p2) {
      const mode = this.curveOpts.mode || 'hvh';
      
      if (mode === 'hvh') {
        const midX = (p1.x + p2.x) / 2;
        return `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
      } else {
        const midY = (p1.y + p2.y) / 2;
        return `M ${p1.x} ${p1.y} L ${p1.x} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`;
      }
    }

    _addArrows(path) {
      const markerId = `arrow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this._createArrowMarker(markerId);

      if (this.arrowType === '<-' || this.arrowType === '<->') {
        path.setAttribute('marker-start', `url(#${markerId}-start)`);
      }
      if (this.arrowType === '->' || this.arrowType === '<->') {
        path.setAttribute('marker-end', `url(#${markerId}-end)`);
      }
    }

    _createArrowMarker(id) {
      let defs = this.svg.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        this.svg.insertBefore(defs, this.svg.firstChild);
      }

      // End arrow (points right)
      const markerEnd = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      markerEnd.setAttribute('id', `${id}-end`);
      markerEnd.setAttribute('markerWidth', '10');
      markerEnd.setAttribute('markerHeight', '7');
      markerEnd.setAttribute('refX', '9');
      markerEnd.setAttribute('refY', '3.5');
      markerEnd.setAttribute('orient', 'auto');
      markerEnd.setAttribute('markerUnits', 'strokeWidth');

      const pathEnd = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEnd.setAttribute('d', 'M0,0 L10,3.5 L0,7 Z');
      pathEnd.setAttribute('fill', this.strokeColor);
      markerEnd.appendChild(pathEnd);
      defs.appendChild(markerEnd);

      // Start arrow (points left)
      const markerStart = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      markerStart.setAttribute('id', `${id}-start`);
      markerStart.setAttribute('markerWidth', '10');
      markerStart.setAttribute('markerHeight', '7');
      markerStart.setAttribute('refX', '1');
      markerStart.setAttribute('refY', '3.5');
      markerStart.setAttribute('orient', 'auto');
      markerStart.setAttribute('markerUnits', 'strokeWidth');

      const pathStart = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathStart.setAttribute('d', 'M10,0 L0,3.5 L10,7 Z');
      pathStart.setAttribute('fill', this.strokeColor);
      markerStart.appendChild(pathStart);
      defs.appendChild(markerStart);
    }
  }

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  class DrawContext {
    constructor(svg) {
      this.svg = typeof svg === 'string' ? document.querySelector(svg) : svg;
      this.paths = [];
    }

    /**
     * Start a new path
     */
    path(from, to) {
      const builder = new PathBuilder(this.svg);
      builder.path(from, to);
      this.paths.push(builder);
      return builder;
    }

    /**
     * Clear the SVG
     */
    clear() {
      while (this.svg.lastChild) {
        this.svg.removeChild(this.svg.lastChild);
      }
      return this;
    }

    /**
     * Draw multiple paths at once
     * @param {Array} specs - Array of path specifications
     */
    batch(specs) {
      return specs.map(spec => {
        const builder = new PathBuilder(this.svg);
        
        // Apply all specifications
        if (spec.from && spec.to) builder.path(spec.from, spec.to);
        if (spec.curve) builder.curve(spec.curve);
        if (spec.ortho !== undefined) builder.ortho(spec.ortho);
        if (spec.arrow) builder.arrow(spec.arrow);
        if (spec.stroke) builder.stroke(spec.stroke);
        if (spec.width) builder.width(spec.width);
        if (spec.dash) builder.dash(spec.dash);
        if (spec.animate !== undefined) {
          builder.animate(spec.animate, spec.duration, spec.delay);
        }
        if (spec.shorten) builder.shorten(spec.shorten[0], spec.shorten[1]);
        
        return builder.draw();
      });
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Main entry point - create a drawing context
   * @param {string|SVGElement} svg - SVG element or selector
   */
  function createContext(svg) {
    return new DrawContext(svg);
  }

  // Attach the class for advanced usage
  createContext.PathBuilder = PathBuilder;
  createContext.DrawContext = DrawContext;

  return createContext;
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = draw;
}