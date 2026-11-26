import './Navbar.css';

import { routes } from '../../router';
import DataBackupButton from './DataBackupButton/DataBackupButton';

// Builds the main navigation from the top-level route definitions.
export default function Navbar() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="navbar__content">
        <ul className="navbar__items">
          {routes.map(({ label, path }) => (
            <li key={path}>
              <a href={path} aria-current={pathname === path ? 'page'
                : path !== '/' && pathname.startsWith(`${path}/`) ? 'location' : undefined}>{label}</a>
            </li>
          ))}
        </ul>
        <DataBackupButton />
      </div>
    </nav>
  );
}
