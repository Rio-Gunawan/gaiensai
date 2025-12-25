import './assets/css/sub-pages.css';
import { Footer } from './components/layout/footer';
import { Header } from './components/layout/header';

export const Ticket = () => {
  return (
    <>
      <Header />
      <main className='app-main'>
        <h1>チケットを表示</h1>
      </main>
      <Footer />
    </>
  );
};
