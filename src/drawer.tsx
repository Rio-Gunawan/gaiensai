import './assets/css/drawer.css';
import { MdClose } from 'react-icons/md';
import { UrlsNav } from './urls-nav';

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
          <UrlsNav />
        </div>
      </aside>
    </>
  );
};
