import { useEffect } from 'preact/hooks';
import { Route, Switch, useLocation } from 'wouter-preact';

import LineCallback from '../features/auth/Line';
import MainLayout from '../layout/MainLayout';
import StudentLayout from '../layout/StudentLayout';
import NotFound from '../shared/NotFound';
import Home from './pages/Home';
import Performances from './pages/Performances';
import Ticket from './pages/Ticket';
import TicketHistory from './pages/TicketHistory';

import '../styles/color-settings.css';
import '../styles/index.css';
import subPageStyles from '../styles/sub-pages.module.css';
import Login from './pages/students/Login';
import Students from './pages/students/Students';

const ScrollToTop = () => {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location]);

  return null;
};

const App = () => {
  const [location] = useLocation();
  const isHome = location === '/';
  const isStudentPage = location.startsWith('/students');

  if (isStudentPage) {
    return (
      <StudentLayout>
        <ScrollToTop />
        <Switch>
          <Route path='/students/login' component={Login} />
          <Route path='/students/:rest*' component={Students} />
          <Route path='/students/issue/:rest*' component={Students} />
          <Route path='/students' component={Students} />
          <Route component={NotFound} />
        </Switch>
      </StudentLayout>
    );
  }

  return (
    <MainLayout>
      <ScrollToTop />
      <div className={isHome ? '' : subPageStyles.subPageShell}>
        <Switch>
          <Route path='/' component={Home} />
          <Route path='/t' component={TicketHistory} />
          <Route path='/t/:id' component={Ticket} />
          <Route path='/performances' component={Performances} />
          <Route path='/auth/line/callback' component={LineCallback} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </MainLayout>
  );
};

export default App;
