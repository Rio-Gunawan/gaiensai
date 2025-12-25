import { useState } from 'preact/hooks';
import './assets/css/sub-pages.css';
import './assets/css/ticket.css';
import { Footer } from './components/layout/footer';
import { Header } from './components/layout/header';
import { Alert } from './components/ui/alert';
import { QRCode } from './components/ui/qrcode';

export const Ticket = () => {
  const [showCopySucceed, setShowCopySucceed] = useState(false);
  return (
    <>
      <Header />
      <main className='app-main'>
        <h1>チケットを表示</h1>
        <Alert>
          <p>必ずスクリーンショットで保存してください。</p>
        </Alert>
        <QRCode value='3pQe75Y' size={Math.min(window.innerWidth * 0.8, 350)} />
        <p id='qrcode-data'>3pQe75Y</p>
        <h2 id='about-performance'>1-1 第1公演</h2>
        <p id='for-whom'>2年7組14番 ご本人様</p>
        <p className='url-container'>
          <a id='url'>https://gaiensai.pages.dev/t/3pQe75Y</a>
        </p>
        <button
          id='copy-url'
          onClick={() => {
            setShowCopySucceed(true);
            setTimeout(() => {
              setShowCopySucceed(false);
            }, 2000);
          }}
        >
          URLをコピー
        </button>
        <p
          id='copy-succeed'
          style={showCopySucceed ? { display: 'block' } : { display: 'none' }}
        >
          URLをコピーしました
        </p>
        <h3>注意事項</h3>
        <p className='notes'>
          <ul>
            <li>このQRコードをスクリーンショットで保存し、当日読み取り端末にかざしてご入場ください。</li>
            <li>他の人に共有する場合は、QRコードのスクリーンショットまたはURLを送信してください。</li>
            <li>このQRコード1枚につき、一人まで入場可能です。ただし、他の座席を使用しない場合は乳児と同伴可能です。</li>
            <li>このページで発券されたチケットは、外苑祭当日、入場時に必要となります。忘れずに持参してください。</li>
          </ul>
        </p>
      </main>
      <Footer />
    </>
  );
};
