import { render } from 'preact';
import './assets/css/index.css';
import { App } from './app.tsx';
import { Ticket } from './ticket.tsx';
import { Performances } from './performances.tsx';
import { Route, Switch } from 'wouter-preact';

render(
  <Switch>
    <Route path='/' component={App} />
    <Route path='/t' component={Ticket} />
    <Route path='/performances' component={Performances} />
    <Route>404 Not Found</Route>
  </Switch>,
  document.getElementById('app')!
);
