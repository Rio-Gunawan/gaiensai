import AdminLayout from '../layout/AdminLayout';

import { ScrollToTop } from '../utils/ScrollToTop';

import '../styles/color-settings.css';
import '../styles/index.css';

import subPageStyles from '../styles/sub-pages.module.css';
import { Route, Router, Switch, useLocation } from 'wouter-preact';
import NotFound from '../shared/NotFound';
import AdminHome from './pages/AdminHome';
import Scan from './pages/Scan';
import ScanLayout from '../layout/ScanLayout';

const App = () => {
  const [location] = useLocation();
  const isScanPage = location.startsWith('/admin/scan');

  if (isScanPage) {
    return (
      <Router base='/admin/scan'>
        <ScanLayout>
          <ScrollToTop />
          <Switch>
            <Route path='/' component={Scan} />
            <Route component={NotFound} />
          </Switch>
        </ScanLayout>
      </Router>
    );
  }

  return (
    <Router base='/admin'>
      <AdminLayout>
        <ScrollToTop />
        <div className={subPageStyles.subPageShell}>
          <Switch>
            <Route path='/' component={AdminHome} />
            <Route component={NotFound} />
          </Switch>
        </div>
      </AdminLayout>
    </Router>
  );
};

export default App;
