import NormalSection from '../../components/ui/NormalSection';
import PerformancesTable from '../../features/performances/PerformancesTable';
import GymPerformancesTable from '../../features/performances/GymPerformancesTable';
import type { SelectedPerformance } from '../../types/Issue.types';
import styles from '../../pages/user/students/Issue.module.css';

type IssueStepPerformanceProps = {
  isGymPerformanceTicket: boolean;
  selectedPerformance: SelectedPerformance;
  selectedCellKey?: string;
  classRemainingMode?: 'general' | 'total';
  restrictedClassName?: string | null;
  onSelectPerformance: (selection: SelectedPerformance) => void;
};

const IssueStepPerformance = ({
  isGymPerformanceTicket,
  selectedPerformance,
  selectedCellKey,
  classRemainingMode = 'general',
  restrictedClassName = null,
  onSelectPerformance,
}: IssueStepPerformanceProps) => {
  return (
    <NormalSection>
      <h2 className={styles.sectionTitle}>2. 公演の選択</h2>
      <p>
        下の表から、発券したい公演を選択してください。
      </p>
      {isGymPerformanceTicket ? (
        <GymPerformancesTable
          onAvailableCellClick={onSelectPerformance}
          selectedCellKey={selectedCellKey}
        />
      ) : (
        <PerformancesTable
          remainingMode={classRemainingMode}
          restrictedClassName={restrictedClassName}
          onAvailableCellClick={onSelectPerformance}
          selectedCellKey={selectedCellKey}
        />
      )}
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
