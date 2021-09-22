import * as React from 'react';
import { Link } from 'react-router-dom';
import { NavLink } from './NavLink';

export function NavBar() {
  return (
    <nav className="w-80 h-screen fixed top-0 left-0 bg-dark-200 flex flex-col">
      <div className="py-6 px-8">
        <Link to="/dashboard">
          <img src="/dashboard/static/media/logo.svg" alt="Re.pack" />
        </Link>
      </div>
      <div className="pt-10 px-8 flex flex-col">
        <NavLink
          to="/dashboard"
          label="Dash"
          icon={<span className="material-icons mr-2">home</span>}
        />
        <NavLink
          to="/dashboard/logs"
          label="Logs"
          icon={<span className="material-icons mr-2">list_alt</span>}
        />
        <NavLink
          to="/dashboard/artifacts"
          label="Artifacts"
          icon={<span className="material-icons mr-2">source</span>}
        />
      </div>
      {/* TODO: connection status */}
    </nav>
  );
}
