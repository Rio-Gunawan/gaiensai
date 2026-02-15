import { useState } from 'preact/hooks';
import pageStyles from '../../styles/sub-pages.module.css';
import styles from './Ticket.module.css';
import Alert from '../../components/ui/Alert';
import QRCode from '../../components/ui/QRCode';

const Ticket = () => {
  const [showCopySucceed, setShowCopySucceed] = useState(false);
  return (
    <>
      <h1 className={pageStyles.pageTitle}>チケットを表示</h1>
      <Alert type='warning'>
        <p>必ずスクリーンショットで保存してください。</p>
      </Alert>
      <QRCode value='3pQe75Y' size={Math.min(window.innerWidth * 0.8, 350)} />
      <section>
        <p className={styles.qrcodeData}>3pQe75Y</p>
        <h2 className={styles.aboutPerformance}>1-1 第1公演</h2>
        <p className={styles.forWhom}>2年7組14番 ご本人様</p>
        <p className={styles.urlContainer}>
          <a>https://gaiensai.pages.dev/t/3pQe75Y</a>
        </p>
        <button
          className={styles.copyUrl}
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
          className={styles.copySucceed}
          style={showCopySucceed ? { display: 'block' } : { display: 'none' }}
        >
          URLをコピーしました
        </p>
      </section>
      <section>
        <h3>注意事項</h3>
        <ul className={styles.notes}>
          <li>
            このQRコードをスクリーンショットで保存し、当日読み取り端末にかざしてご入場ください。
          </li>
          <li>
            他の人に共有する場合は、QRコードのスクリーンショットまたはURLを送信してください。
          </li>
          <li>
            このQRコード1枚につき、一人まで入場可能です。ただし、他の座席を使用しない場合は乳児と同伴可能です。
          </li>
          <li>
            このページで発券されたチケットは、外苑祭当日、入場時に必要となります。忘れずに持参してください。
          </li>
        </ul>
      </section>
    </>
  );
};

export default Ticket;