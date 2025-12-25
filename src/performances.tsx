import './assets/css/sub-pages.css';
import { Footer } from './components/layout/footer';
import { Header } from './components/layout/header';

export const Performances = () => {
  return (
    <>
      <Header />
      <main className='app-main'>
        <h1>公演一覧</h1>
        <p>This is the performances page content.</p>
      </main>
      <Footer />
    </>
  );
};
