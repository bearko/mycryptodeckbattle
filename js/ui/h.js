// 小さなDOM生成ヘルパー。h("div", { class: "a", onClick }, child, ...)

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") setStyle(el, v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  append(el, children);
  return el;
}

/** CSSカスタムプロパティ（--x）は Object.assign では入らないので setProperty で入れる */
function setStyle(el, style) {
  for (const [k, v] of Object.entries(style)) {
    if (v === null || v === undefined) continue;
    if (k.startsWith("--")) el.style.setProperty(k, String(v));
    else el.style[k] = v;
  }
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function img(src, cls = "", alt = "") {
  return h("img", { src, class: cls, alt, draggable: "false" });
}
