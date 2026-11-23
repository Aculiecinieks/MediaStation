import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

function showFatalError(msg: string) {
  const el = document.createElement('pre');
  el.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:#2a0a0a;color:#ff9c9c;padding:24px;font-size:13px;font-family:monospace;overflow:auto;white-space:pre-wrap;';
  el.textContent = msg;
  document.body.appendChild(el);
}

window.addEventListener('error', (e) => {
  showFatalError('RUNTIME ERROR:\n' + (e.error?.stack || e.message || String(e)));
});

window.addEventListener('unhandledrejection', (e) => {
  showFatalError('UNHANDLED PROMISE REJECTION:\n' + (e.reason?.stack || e.reason || String(e)));
});

try {
  const app = mount(App, { target: document.getElementById('app')! });
} catch (err: any) {
  showFatalError('MOUNT FAILED:\n' + (err?.stack || String(err)));
}
