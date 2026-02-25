import NormalSection from '../../components/ui/NormalSection';
import PerformancesTable from '../../features/performances/PerformancesTable';
import type { SelectedPerformance } from '../../types/Issue.types';
import styles from '../../user/pages/students/Issue.module.css';

type IssueStepPerformanceProps = {
  selectedPerformance: SelectedPerformance;
  selectedCellKey?: string;
  onSelectPerformance: (selection: SelectedPerformance) => void;
};

const IssueStepPerformance = ({
  selectedPerformance,
  selectedCellKey,
  onSelectPerformance,
}: IssueStepPerformanceProps) => {
  return (
    <NormalSection>
      <h2 className={styles.sectionTitle}>2. 公演の選択</h2>
      <p>
        下の表から、発券したい公演を選択してください。
      </p>
      <PerformancesTable
        onAvailableCellClick={onSelectPerformance}
        selectedCellKey={selectedCellKey}
      />
      {selectedPerformance && (
        <p className={styles.selectedText}>
          選択中: {selectedPerformance.performanceName} /{' '}
          {selectedPerformance.scheduleName}（残り
          {selectedPerformance.remaining}
          席）
        </p>
      )}
    </NormalSection>
  );
};

export default IssueStepPerformance;
