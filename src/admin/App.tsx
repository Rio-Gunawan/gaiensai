import AdminLayout from '../layout/AdminLayout';

import { ScrollToTop } from '../utils/ScrollToTop';

import '../styles/color-settings.css';
import '../styles/index.css';

import subPageStyles from '../styles/sub-pages.module.css';
import { Route, Switch, useLocation } from 'wouter-preact';
import NotFound from '../shared/NotFound';
import AdminHome from './pages/AdminHome';
import Scan from './pages/Scan';
import ScanLayout from '../layout/ScanLayout';

const App = () => {
  const [location] = useLocation();
  const isScanPage = location.startsWith('/admin/scan');

  if (isScanPage) {
    return (
      <ScanLayout>
        <ScrollToTop />
        <Switch>
          <Route path='/admin/scan' component={Scan} />
          <Route component={NotFound} />
        </Switch>
      </ScanLayout>
    );
  }

  return (
    <AdminLayout>
      <ScrollToTop />
      <div className={subPageStyles.subPageShell}>
        <Switch>
          <Route path='/admin' component={AdminHome} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </AdminLayout>
  );
};

export default App;
