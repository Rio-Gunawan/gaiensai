import AdminLayout from '../layout/AdminLayout';

import { ScrollToTop } from '../utils/ScrollToTop';

import '../styles/color-settings.css';
import '../styles/index.css';

import subPageStyles from '../styles/sub-pages.module.css';
import { Route, Switch } from 'wouter-preact';
import NotFound from '../shared/NotFound';
import AdminHome from './pages/AdminHome';

const App = () => {
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
