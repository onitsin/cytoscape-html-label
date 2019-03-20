type IHAlign = "left" | "center" | "right";
type IVAlign = "top" | "center" | "bottom";
type IEAlign = "source" | "midpoint" | "target";
declare var module: any;
declare var define: any;
declare var cytoscape: any;

interface CytoscapeHtmlParams {
  query?: string;
  halign?: IHAlign;
  valign?: IVAlign;
  ealign?: IEAlign;
  eradius?: number;
  halignBox?: IHAlign;
  valignBox?: IVAlign;
  cssClass?: string;
  tpl?: (d: any) => string;
}

(function () {
  "use strict";
  const $$find = function <T>(arr: T[], predicate: (a: T) => boolean) {
    if (typeof predicate !== "function") {
      throw new TypeError("predicate must be a function");
    }
    let length = arr.length >>> 0;
    let thisArg = arguments[1];
    let value;

    for (let i = 0; i < length; i++) {
      value = arr[i];
      if (predicate.call(thisArg, value, i, arr)) {
        return value;
      }
    }
    return undefined;
  };

  interface ICyEventObject {
    cy: any;
    type: string;
    target: any;
  }

  interface ICytoscapeHtmlPosition {
    x: number;
    y: number;
    w: number;
    h: number;
  }

  interface ILabelElement {
    data?: any;
    position?: ICytoscapeHtmlPosition;
    node: HTMLElement;
  }

  interface HashTableElements {
    [key: string]: LabelElement;
  }

  class LabelElement {
    public tpl: (d: any) => string;

    private _position: number[];
    private _node: HTMLElement;
    private _align: [number, number, number, number];

    constructor({
                  node,
                  position = null,
                  data = null
                }: ILabelElement,
                params: CytoscapeHtmlParams) {

      this.updateParams(params);
      this._node = node;

      this.initStyles(params.cssClass);

      if (data) {
        this.updateData(data);
      }
      if (position) {
        this.updatePosition(position);
      }
    }

    updateParams({
                   tpl = () => "",
                   cssClass = null,
                   halign = "center",
                   valign = "center",
                   ealign = "midpoint",
                   halignBox = "center",
                   valignBox = "center"
                 }: CytoscapeHtmlParams) {

      const _align = {
        "top": -.5,
        "left": -.5,
        "center": 0,
        "right": .5,
        "bottom": .5
      };

      this._align = [
        _align[halign],
        _align[valign],
        100 * (_align[halignBox] - 0.5),
        100 * (_align[valignBox] - 0.5)
      ];

      this.tpl = tpl;
    }

    updateData(data: any) {
      try {
        this._node.innerHTML = this.tpl(data);
      } catch (err) {
        console.error(err);
      }
    }

    getNode(): HTMLElement {
      return this._node;
    }

    updatePosition(pos: ICytoscapeHtmlPosition) {
      this._renderPosition(pos);
    }

    private initStyles(cssClass: string) {
      let stl = this._node.style;
      stl.position = 'absolute';
      if (cssClass && cssClass.length) {
        this._node.classList.add(cssClass);
      }
    }

    private _renderPosition(position: ICytoscapeHtmlPosition) {
      const prev = this._position;
      const x = position.x + this._align[0] * position.w;
      const y = position.y + this._align[1] * position.h;

      if (!prev || prev[0] !== x || prev[1] !== y) {
        this._position = [x, y];

        let valRel = `translate(${this._align[2]}%,${this._align[3]}%) `;
        let valAbs = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) `;
        let val = valRel + valAbs;
        let stl = <any>this._node.style;
        stl.webkitTransform = val;
        stl.msTransform = val;
        stl.transform = val;
      }
    }
  }

  /**
   * LabelContainer
   * Html manipulate, find and upgrade nodes
   * it don't know about cy.
   */
  class LabelContainer {
    private _elements: HashTableElements;
    private _node: HTMLElement;

    constructor(node: HTMLElement) {
      this._node = node;
      this._elements = <HashTableElements>{};
    }

    addOrUpdateElem(id: string, param: CytoscapeHtmlParams, payload: { data?: any, position?: ICytoscapeHtmlPosition } = {}) {
      let cur = this._elements[id];
      if (cur) {
        cur.updateParams(param);
        cur.updateData(payload.data);
        cur.updatePosition(payload.position);
      } else {
        let nodeElem = document.createElement("div");
        this._node.appendChild(nodeElem);

        this._elements[id] = new LabelElement({
          node: nodeElem,
          data: payload.data,
          position: payload.position
        }, param);
      }
    }

    removeElemById(id: string) {
      if (this._elements[id]) {
        this._node.removeChild(this._elements[id].getNode());
        delete this._elements[id];
      }
    }

    updateElemPosition(id: string, position?: ICytoscapeHtmlPosition) {
      let ele = this._elements[id];
      if (ele) {
        ele.updatePosition(position);
      }
    }

    updatePanZoom({pan, zoom}: { pan: { x: number, y: number }, zoom: number }) {
      const val = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
      const stl = <any>this._node.style;
      const origin = "top left";

      stl.webkitTransform = val;
      stl.msTransform = val;
      stl.transform = val;
      stl.webkitTransformOrigin = origin;
      stl.msTransformOrigin = origin;
      stl.transformOrigin = origin;
    }
  }

  function cyHtmlLabel(_cy: any, params: CytoscapeHtmlParams[]) {
    const _params = (!params || typeof params !== "object") ? [] : params;
    const _lc = createLabelContainer();

    _cy.one("render", (e: any) => {
      createCyHandler(e);
      wrapCyHandler(e);
    });
    _cy.on("add", addCyHandler);
    _cy.on("layoutstop", layoutstopHandler);
    _cy.on("remove", removeCyHandler);
    _cy.on("data", updateDataCyHandler);
    _cy.on("pan zoom", wrapCyHandler);
    _cy.on("position bounds", moveCyHandler); // "bounds" - not documented event

    return _cy;

    function createLabelContainer(): LabelContainer {
      let _cyContainer = _cy.container();
      let _titlesContainer = document.createElement("div");

      let _cyCanvas = _cyContainer.querySelector("canvas");
      let cur = _cyContainer.querySelector("[class^='cy-html']");
      if (cur) {
        _cyCanvas.parentNode.removeChild(cur);
      }

      let stl = _titlesContainer.style;
      stl.position = 'absolute';
      stl['z-index'] = 10;
      stl.width = '500px';
      stl['pointer-events'] = 'none';
      stl.margin = '0px';
      stl.padding = '0px';
      stl.border = '0px';
      stl.outline = '0px';
      stl.outline = '0px';


      _cyCanvas.parentNode.appendChild(_titlesContainer);

      return new LabelContainer(_titlesContainer);
    }

    function createCyHandler({cy}: ICyEventObject) {
      _params.forEach(x => {
        cy.elements(x.query).forEach((d: any) => {
          _lc.addOrUpdateElem(d.id(), x, {
            position: getPosition(d),
            data: d.data()
          });
        });
      });
    }

    function addCyHandler(ev: ICyEventObject) {
      let target = ev.target;
      let param = $$find(_params.slice().reverse(), x => target.is(x.query));
      if (param) {
        _lc.addOrUpdateElem(target.id(), param, {
          position: getPosition(target),
          data: target.data()
        });
      }
    }

    function layoutstopHandler({cy}: ICyEventObject) {
      _params.forEach(x => {
        cy.elements(x.query).forEach((d: any) => {
          _lc.updateElemPosition(d.id(), getPosition(d));
        });
      });
    }

    function removeCyHandler(ev: ICyEventObject) {
      _lc.removeElemById(ev.target.id());
    }

    function moveCyHandler(ev: ICyEventObject) {
      _lc.updateElemPosition(ev.target.id(), getPosition(ev.target));
      ev.target.connectedEdges().forEach((el: any) => {
        _lc.updateElemPosition(el.id(), getPosition(el))
      });
    }

    function updateDataCyHandler(ev: ICyEventObject) {
      setTimeout(() => {
        let target = ev.target;
        let param = $$find(_params.slice().reverse(), x => target.is(x.query));
        if (param) {
          _lc.addOrUpdateElem(target.id(), param, {
            position: getPosition(target),
            data: target.data()
          });
        } else {
          _lc.removeElemById(target.id());
        }
      }, 0);
    }

    function wrapCyHandler({cy}: ICyEventObject) {
      _lc.updatePanZoom({
        pan: cy.pan(),
        zoom: cy.zoom()
      });
    }

    function getPosition(el: any): ICytoscapeHtmlPosition {
      if (el.isNode()) {
       return {
          w: el.width(),
          h: el.height(),
          x: el.position("x"),
          y: el.position("y")
        };
      } else if (el.isEdge()) {
        let param = $$find(_params.slice().reverse(), x => el.is(x.query));
        if (param) {
          let pos, radius = (typeof param.eradius === undefined) ? 20 : param.eradius;
          if (param.ealign === 'source') { pos = el.sourceEndpoint() }
          else if (param.ealign === 'target') { pos = el.targetEndpoint() }
          else { pos = el.midpoint() }
          return {
            w: radius,
            h: radius,
            x: pos.x,
            y: pos.y
          }
        }
      }
    }
  }

  // registers the extension on a cytoscape lib ref
  let register = function (cy: any) {

    if (!cy) {
      return;
    } // can't register if cytoscape unspecified

    cy("core", "htmlLabel", function (optArr: any) {
      return cyHtmlLabel(this, optArr);
    });
  };

  if (typeof module !== "undefined" && module.exports) { // expose as a commonjs module
    module.exports = function (cy: any) {
      register(cy);
    };
  } else {
    if (typeof define !== "undefined" && define.amd) { // expose as an amd/requirejs module
      define("cytoscape-htmlLabel", function () {
        return register;
      });
    }
  }

  if (typeof cytoscape !== "undefined") { // expose to global cytoscape (i.e. window.cytoscape)
    register(cytoscape);
  }

}());
