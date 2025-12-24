import iconUrl from '../../assets/imgs/icon.webp';
import './header.css';
import { Drawer } from './drawer';
import { RxHamburgerMenu } from 'react-icons/rx';
import { useState } from 'preact/hooks';

export const Header = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header>
        <img alt='アイコン' src={iconUrl} width={64} />
        外苑祭2026
      </header>

      <button
        className='menu-button'
        onClick={() => setOpen(true)}
        aria-label='メニュー'
      >
        <RxHamburgerMenu />
      </button>
      <Drawer isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
};
