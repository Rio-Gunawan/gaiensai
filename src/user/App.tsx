import { Route, Switch } from 'wouter-preact';

import MainLayout from '../layout/MainLayout';
import { Home } from './pages/Home';
import { LineCallback } from '../features/auth/Line';
import { Performances } from './pages/Performances';
import { Student } from './pages/students/Student';
import { Ticket } from './pages/Ticket';

import '../styles/index.css';
import '../styles/color-settings.css';

const App = () => {
  return (
    <MainLayout>
      <Switch>
        <Route path='/' component={Home} />
        <Route path='/t' component={Ticket} />
        <Route path='/performances' component={Performances} />
        <Route path='/students' component={Student} />
        <Route path='/auth/line/callback' component={LineCallback} />
        <Route>404 Not Found</Route>
      </Switch>
    </MainLayout>
  );
};

export default App;
