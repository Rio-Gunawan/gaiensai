import { Footer } from '../components/layout/footer';
import { Header } from '../components/layout/header';
import { Login } from "./login";
import '../assets/css/sub-pages.css';

export const Students = () => {

  return (
    <>
      <Header />
      <main className='app-main'>
        <h1>生徒用ページ</h1>
        <Login />
      </main>
      <Footer />
    </>
  );
};
