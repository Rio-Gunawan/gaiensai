import { Alert } from './alert';
import './assets/css/app.css';
import { Header } from './header';

export const App = () => {
  return (
    <>
      <Header />
      <section className='first-view'>
        <div className='first-view-content'>
          <h1>外苑祭 2026</h1>
          <p>2026/8/29~30 東京都立青山高校</p>
        </div>
        <div className='scroll'>
          <span>Scroll</span>
        </div>
      </section>
      <Alert>
        <p>
          外苑祭は青山高校生徒から招待された人、または抽選で当選した中学生のみ参加できます。
        </p>
      </Alert>
    </>
  );
};
