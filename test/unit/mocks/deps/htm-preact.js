// Minimal htm-preact stub for unit tests.
// Supports component templates with props and children, string interpolation,
// createContext/useContext, useReducer, and h().

const ATTR_POSITION = /\s+([\w-]+)=$/;

function parsePropName(str) {
  const m = str.match(ATTR_POSITION);
  return m ? m[1] : null;
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// Real htm quotes an unquoted interpolated attribute value (`aria-label=${label}`) for you.
// Without this, a value containing spaces spills into bogus sibling attributes and the
// attribute itself is lost — which silently drops accessible names from the rendered output.
function appendAttr(acc, str, match, val) {
  // htm omits the attribute entirely for these, rather than emitting an empty one —
  // `disabled=${undefined}` must not render as a disabled button.
  if (val === undefined || val === null || val === false) {
    return acc + str.slice(0, str.length - match[0].length);
  }
  if (typeof val === 'function' || typeof val === 'object') return `${acc + str}""`;
  return `${acc + str}"${escapeAttr(val)}"`;
}

export function html(strings, ...values) {
  if (strings[0] === '<' && typeof values[0] === 'function') {
    const Fn = values[0];
    const props = {};
    for (let i = 1; i < strings.length; i++) {
      const name = parsePropName(strings[i]);
      if (name && i < values.length) {
        props[name] = values[i];
      } else if (i < values.length && values[i] !== Fn) {
        const v = values[i];
        if (typeof v === 'function') {
          props.children = v({});
        } else if (v !== undefined) {
          props.children = v;
        }
      }
    }
    return Fn(props);
  }
  return strings.reduce((acc, str, i) => {
    const val = values[i];
    const attr = i < values.length ? str.match(ATTR_POSITION) : null;
    if (attr) return appendAttr(acc, str, attr, val);
    if (val === undefined || val === null || val === false) return acc + str;
    if (typeof val === 'function') return acc + str;
    if (Array.isArray(val)) return acc + str + val.join('');
    if (typeof val === 'object') return acc + str;
    return acc + str + String(val);
  }, '');
}

// `h()` builds a lazy vnode instead of invoking `type` immediately, so a
// Context.Provider gets a chance to run (and set its context value) before
// its children are evaluated — matching real Preact's deferred-vnode model.
const VNODE = Symbol('vnode');

function resolve(node) {
  if (node && node[VNODE]) return resolve(node.type(node.props));
  if (Array.isArray(node)) return node.map(resolve).join('');
  return node ?? '';
}

export function render(content, container) {
  const resolved = resolve(content);
  if (typeof resolved === 'string') {
    // eslint-disable-next-line no-param-reassign
    container.innerHTML = resolved;
  }
}

export function createContext(defaultValue) {
  const ctx = { defaultValue, _current: defaultValue };
  ctx.Provider = ({ value, children }) => {
    ctx._current = value !== undefined ? value : defaultValue;
    return typeof children === 'function' ? children() : children;
  };
  return ctx;
}

// Matches real React/Preact: a function initial is treated as a lazy initializer.
export function useState(initial) {
  return [typeof initial === 'function' ? initial() : initial, () => {}];
}
export function useEffect() {}
export function useLayoutEffect() {}
export function useRef(val) { return { current: val }; }
export function useCallback(fn) { return fn; }
export function useMemo(fn) { return fn(); }
export function useContext(ctx) { return ctx?._current ?? ctx?.defaultValue; }

export function useReducer(fn, initial, init) {
  const state = init ? init(initial) : initial;
  return [state, () => {}];
}

// Real @preact/signals `.subscribe()` fires immediately with the current value, then
// again on every `.value` write — mirrored here since some shared, non-Preact modules
// (e.g. utils/session-store.js, features/toast/toast.js) subscribe outside of a useEffect, which
// this mock otherwise no-ops.
export function signal(initial) {
  const subscribers = new Set();
  return {
    get value() { return initial; },
    set value(next) {
      initial = next;
      subscribers.forEach((fn) => fn(initial));
    },
    subscribe(fn) {
      subscribers.add(fn);
      fn(initial);
      return () => subscribers.delete(fn);
    },
  };
}

// Real @preact/signals `batch()` just needs to run the callback and coalesce the
// resulting subscriber notifications — this mock's `signal()` has no render pass to
// coalesce, so running the callback synchronously is behaviorally equivalent.
export function batch(fn) {
  return fn();
}

// Real @preact/signals `useComputed()` returns a memoized signal; this mock re-derives
// on every `.value` read (like the `useMemo` stub above) since there's no render pass to
// cache across.
export function useComputed(fn) {
  return { get value() { return fn(); } };
}

export function h(type, props, ...children) {
  if (typeof type !== 'function') return null;
  const childVal = children.length === 1 ? children[0] : children;
  return { [VNODE]: true, type, props: { ...(props || {}), children: childVal } };
}
