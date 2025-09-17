// Mock utils
export function createTag(tagName, attributes = {}, content = '', options = {}) {
  const element = document.createElement(tagName);
  
  // Set attributes
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  
  // Set content
  if (content) {
    element.textContent = content;
  }
  
  // Set parent if provided
  if (options.parent) {
    options.parent.appendChild(element);
  }
  
  return element;
}
