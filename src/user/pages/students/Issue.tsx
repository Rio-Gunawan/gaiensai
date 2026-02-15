import { useState } from 'preact/hooks';
import styles from './Issue.module.css';
import subPageStyles from '../../../styles/sub-pages.module.css';

type IssueFormState = {
  relation: string;
  performance: string;
  times: string;
};

const relationOptions = [
  { value: 'self', label: '本人' },
  { value: 'family', label: '家族' },
  { value: 'friend-student', label: '友人（青高生）' },
  { value: 'friend-outside', label: '友人（外部）' },
  { value: 'other', label: 'その他' },
];

const performanceOptions = Array.from({ length: 3 }, (_, gradeIndex) =>
  Array.from({ length: 7 }, (_, classIndex) => ({
    value: `${gradeIndex + 1}-${classIndex + 1}`,
    label: `${gradeIndex + 1}-${classIndex + 1}`,
  })),
).flat();

const timesOptions = Array.from({ length: 8 }, (_, i) => ({
  value: String(i + 1),
  label: `${Math.floor(i / 4) + 1}日目 第${i % 4 + 1}公演`,
}));

const Issue = () => {
  const [formState, setFormState] = useState<IssueFormState>({
    relation: '',
    performance: '',
    times: '',
  });

  const canSubmit = Boolean(
    formState.relation && formState.performance && formState.times,
  );

  const handleSelectChange =
    (key: keyof IssueFormState) =>
    (event: Event): void => {
      const target = event.currentTarget as HTMLSelectElement;
      setFormState((prev) => ({ ...prev, [key]: target.value }));
    };

  const handleSubmit = (event: Event): void => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
  };

  return (
    <section className={styles.issuePage}>
      <header>
        <h1 className={subPageStyles.pageTitle}>新規チケット発行</h1>
      </header>

      <form className={styles.issueForm} onSubmit={handleSubmit}>
        <label className={styles.formLabel} htmlFor='relation'>
          チケットを使う予定の人との関係
          <select
            id='relation'
            name='relation'
            className={styles.select}
            value={formState.relation}
            onChange={handleSelectChange('relation')}
            required={true}
          >
            <option value='' disabled={true}>
              選択してください
            </option>
            {relationOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.formLabel} htmlFor='performance'>
          発券する公演のクラス
          <select
            id='performance'
            name='performance'
            className={styles.select}
            value={formState.performance}
            onChange={handleSelectChange('performance')}
            required={true}
          >
            <option value='' disabled={true}>
              選択してください
            </option>
            {performanceOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.formLabel} htmlFor='times'>
          公演の回
          <select
            id='times'
            name='times'
            className={styles.select}
            value={formState.times}
            onChange={handleSelectChange('times')}
            required={true}
          >
            <option value='' disabled={true}>
              選択してください
            </option>
            {timesOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button className={styles.generateButton} id='generate' disabled={!canSubmit}>
          チケット発券
        </button>
      </form>
    </section>
  );
};

export default Issue;
