import iconUrl from '../../assets/imgs/icon.webp';
import './header.css';
import { Drawer } from './drawer';
import { RxHamburgerMenu } from 'react-icons/rx';
import { useState } from 'preact/hooks';
import { Link } from 'wouter-preact';

export const Header = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Link href='/'>
        <header>
          <img alt='アイコン' src={iconUrl} width={64} />
          外苑祭2026
        </header>
      </Link>

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
