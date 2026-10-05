import { render } from 'preact';
import { App } from './App';
import { createBackend } from './backend';
import './styles.css';

render(<App backend={createBackend()} />, document.getElementById('app')!);
