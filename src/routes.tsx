import { lazy } from 'preact-iso';

// components that should remain eagerly loaded
import Ticket from './pages/user/Ticket';
import TicketHistory from './pages/user/TicketHistory';

// everything else is code-split by default
export const MainLayout = lazy(() => import('./layout/MainLayout'));
export const AdminLayout = lazy(() => import('./layout/AdminLayout'));
export const ScanLayout = lazy(() => import('./layout/ScanLayout'));

export const Home = lazy(() => import('./pages/user/Home'));
export const Performances = lazy(() => import('./pages/user/Performances'));
export const Students = lazy(() => import('./pages/user/students/Students'));
export const AdminHome = lazy(() => import('./pages/admin/AdminHome'));
export const Scan = lazy(() => import('./pages/admin/Scan'));
export const Register = lazy( () => import('./pages/admin/Register'));

// re-export the eagerly-loaded routes so callers can treat them uniformly
export { Ticket, TicketHistory };

// utility for preloading a lazy component when a link is hovered
export function preload(...components: Array<{ preload?: () => Promise<unknown> }>) {
  components.forEach((c) => c.preload && c.preload());
}
