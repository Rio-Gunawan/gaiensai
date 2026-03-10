import {
  ErrorBoundary,
  LocationProvider,
  Route,
  Router,
} from 'preact-iso';

import { ScrollToTop } from './utils/ScrollToTop';

import LineCallback from './features/auth/Line';
import MainLayout from './layout/MainLayout';
import NotFound from './shared/NotFound';
import Home from './pages/user/Home';
import Performances from './pages/user/Performances';
import Ticket from './pages/user/Ticket';
import TicketHistory from './pages/user/TicketHistory';

import './styles/color-settings.css';
import './styles/index.css';
import subPageStyles from './styles/sub-pages.module.css';
import Students from './pages/user/students/Students';
import AdminLayout from './layout/AdminLayout';
import AdminHome from './pages/admin/AdminHome';
import ScanLayout from './layout/ScanLayout';
import Scan from './pages/admin/Scan';

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
