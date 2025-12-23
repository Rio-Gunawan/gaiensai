import iconUrl from './assets/imgs/icon.webp';
import './assets/css/header.css';

export const Header = () => {
  return (
    <header>
      <img alt='アイコン' src={iconUrl} width={64} />
      外苑祭2026
    </header>
  );
};
