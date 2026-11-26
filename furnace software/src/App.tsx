import './App.css';

import Navbar from './common/Navbar/Navbar';
import { PopupProvider } from './common/Popup/PopupProvider';
import Router from './router';

// Renders the shared navigation, selected page, and footer.
export default function App() {
  return (
    <PopupProvider>
      <Navbar />
      <main className="app-content">
        <Router />
      </main>
      <footer className="app-footer">
        © {new Date().getFullYear()} Furnace Studio <span aria-hidden="true">|</span> Version 1.0.0
      </footer>
    </PopupProvider>
  );
}
