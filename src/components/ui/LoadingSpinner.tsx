import styles from './LoadingSpinner.module.css';

type LoadingSpinnerProps = {
  message?: string;
};

const LoadingSpinner = ({ message = '読み込み中...' }: LoadingSpinnerProps) => {
  return (
    <div className={styles.container}>
      <div className={styles.spinner} />
      <p className={styles.message}>{message}</p>
    </div>
  );
};

export default LoadingSpinner;
