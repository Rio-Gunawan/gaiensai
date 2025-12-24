import './alert.css';
import { IoWarning } from 'react-icons/io5';

export const Alert = ({ children }: { children: preact.ComponentChildren }) => {
  return (
    <div className='alert'>
      <h2>
        <IoWarning />
        注意
      </h2>
      {children}
    </div>
  );
};
