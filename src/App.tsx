import {
  ErrorBoundary,
  LocationProvider,
  Route,
  Router,
  useLocation,
} from 'preact-iso';

import { ScrollToTop } from './utils/ScrollToTop';
import { useEffect } from 'preact/hooks';
import { preload } from './routes';
import LineCallback from './features/auth/Line';
import NotFound from './shared/NotFound';

// route components; Ticket and TicketHistory are still eager
import {
  MainLayout,
  AdminLayout,
  ScanLayout,
  Home,
  Performances,
  Students,
  AdminHome,
  Scan,
  Ticket,
  TicketHistory,
} from './routes';

import './styles/color-settings.css';
import './styles/index.css';
import subPageStyles from './styles/sub-pages.module.css';

const userPageLayout = () => (
  <MainLayout>
    <div className={subPageStyles.subPageShell}>
      <Router>
        <Route path='/' component={HomePageLayout} />
        <Route path='/t' component={TicketHistory} />
        <Route path='/t/:id' component={Ticket} />
        <Route path='/performances' component={Performances} />
        <Route path='/auth/line/callback' component={LineCallback} />
        <Route default component={NotFound} />
      </Router>
    </div>
  </MainLayout>
);

const AdminPageLayout = () => (
  <AdminLayout>
    <div className={subPageStyles.subPageShell}>
      <AdminHome />
    </div>
  </AdminLayout>
);

const AdminScanLayout = () => (
  <ScanLayout>
    <Scan />
  </ScanLayout>
);

const HomePageLayout = () => (
  <MainLayout>
    <Home />
  </MainLayout>
);

const App = () => {
  const loc = useLocation();

  // when the app first mounts (or path changes) prefetch the chunk for the current route
  useEffect(() => {
    const p = loc.url;
    if (p === '/' || p === '') {
      preload(Home);
    } else if (p.startsWith('/students')) {
      preload(Students);
    } else if (p.startsWith('/performances')) {
      preload(Performances);
    } else if (p.startsWith('/admin/scan')) {
      preload(AdminLayout, ScanLayout, Scan, AdminHome);
    } else if (p.startsWith('/admin')) {
      preload(AdminLayout, AdminHome);
    }
  }, [loc.url]);

  return (
    <LocationProvider>
      <ScrollToTop />
      <ErrorBoundary>
        <Router>
          <Route path='/' component={HomePageLayout} />
          <Route path='/students' component={Students} />
          <Route path='/students/*' component={Students} />
          <Route path='/admin/scan' component={AdminScanLayout} />
          <Route path='/admin' component={AdminPageLayout} />
          <Route path='/*' component={userPageLayout} />
          <Route default component={NotFound} />
        </Router>
      </ErrorBoundary>
    </LocationProvider>
  );
};

export default App;
