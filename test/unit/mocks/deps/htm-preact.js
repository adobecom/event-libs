// Minimal htm-preact stub for unit tests.
// Supports component templates with props and children, string interpolation,
// createContext/useContext, useReducer, and h().

function parsePropName(str) {
  const m = str.match(/\s+([\w-]+)=$/);
  return m ? m[1] : null;
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
    if (val === undefined || val === null || val === false) return acc + str;
    if (typeof val === 'function') return acc + str;
    if (Array.isArray(val)) return acc + str + val.join('');
    if (typeof val === 'object') return acc + str;
    return acc + str + String(val);
  }, '');
}

export function render(content, container) {
  if (typeof content === 'string') {
    // eslint-disable-next-line no-param-reassign
    container.innerHTML = content;
  }
}

export function createContext(defaultValue) {
  const ctx = { defaultValue, _current: defaultValue };
  ctx.Provider = ({ value, children }) => {
    ctx._current = value !== undefined ? value : defaultValue;
    const resolved = typeof children === 'function' ? children() : children;
    return resolved ?? null;
  };
  return ctx;
}

export function useState(initial) { return [initial, () => {}]; }
export function useEffect() {}
export function useRef(val) { return { current: val }; }
export function useCallback(fn) { return fn; }
export function useMemo(fn) { return fn(); }
export function useContext(ctx) { return ctx?._current ?? ctx?.defaultValue; }

export function useReducer(fn, initial, init) {
  const state = init ? init(initial) : initial;
  return [state, () => {}];
}

export function h(type, props, ...children) {
  if (typeof type === 'function') {
    const childVal = children.length === 1 ? children[0] : children;
    return type({ ...(props || {}), children: childVal });
  }
  return null;
}
