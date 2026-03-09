import AdminLayout from '../layout/AdminLayout';

import { ScrollToTop } from '../utils/ScrollToTop';

import '../styles/color-settings.css';
import '../styles/index.css';

import subPageStyles from '../styles/sub-pages.module.css';
import { Route, Router, Switch } from 'wouter-preact';
import NotFound from '../shared/NotFound';
import AdminHome from './pages/AdminHome';
import Scan from './pages/Scan';
import ScanLayout from '../layout/ScanLayout';

const App = () => {
  return (
    <Router base='/admin'>
      <Switch>
        <Route path='/scan'>
          <ScanLayout>
            <ScrollToTop />
            <Scan />
          </ScanLayout>
        </Route>

        <Route path='/'>
          <AdminLayout>
            <ScrollToTop />
            <div className={subPageStyles.subPageShell}>
              <AdminHome />
            </div>
          </AdminLayout>
        </Route>

        <Route>
          <NotFound />
        </Route>
      </Switch>
    </Router>
  );
};

export default App;
