import './assets/css/drawer.css';
import { MdClose } from 'react-icons/md';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export const Drawer = ({ isOpen, onClose }: Props) => {
  return (
    <>
      <div
        className={`drawer-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />
      <aside
        className={`drawer-panel ${isOpen ? 'open' : ''}`}
        aria-hidden={!isOpen}
      >
        <button className='drawer-close' onClick={onClose} aria-label='閉じる'>
          <MdClose />
        </button>
        <div className='drawer-content'>
          <nav>
            <ul>
              <li>ホーム</li>
              <li>スケジュール</li>
              <li>アクセス</li>
              <li>お問い合わせ</li>
            </ul>
          </nav>
        </div>
      </aside>
    </>
  );
};
