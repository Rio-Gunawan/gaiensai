import iconUrl from '../assets/icon.webp';
import styles from './Header.module.css';
import Drawer from './Drawer';
import { RxHamburgerMenu } from 'react-icons/rx';
import { useState } from 'preact/hooks';
import { Link } from 'wouter-preact';

const Header = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Link href='/'>
        <header className={styles.header}>
          <img alt='アイコン' src={iconUrl} width={64} />
          外苑祭2025
        </header>
      </Link>

      <button
        className={styles.menuButton}
        onClick={() => setOpen(true)}
        aria-label='メニュー'
      >
        <RxHamburgerMenu />
      </button>
      <Drawer isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
};

export default Header;
