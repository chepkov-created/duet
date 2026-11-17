import { render } from 'preact';
import './styles.css';
import { App } from './ui/App.jsx';

render(<App />, document.getElementById('app'));

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline mode is optional */ });
}
