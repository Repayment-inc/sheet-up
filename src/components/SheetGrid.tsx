import { useMemo, type FC } from 'react';
import type { SheetData } from '../types/schema';

interface SheetGridProps {
  sheet: SheetData | null;
}

const toColumnLabel = (index: number): string => {
  let idx = index;
  let label = '';

  while (idx >= 0) {
    label = String.fromCharCode((idx % 26) + 65) + label;
    idx = Math.floor(idx / 26) - 1;
  }

  return label;
};

const SheetGrid: FC<SheetGridProps> = ({ sheet }) => {
  const columnLabels = useMemo(() => {
    if (!sheet) return [];
    const count = Math.min(sheet.gridSize.cols, 26);
    return Array.from({ length: count }, (_, idx) => toColumnLabel(idx));
  }, [sheet]);

  const rowNumbers = useMemo(() => {
    if (!sheet) return [];
    const baseCount = Math.min(sheet.gridSize.rows, 30);
    const baseRows = Array.from({ length: baseCount }, (_, idx) => idx + 1);
    const sparseRows = Object.keys(sheet.rows)
      .map((key) => Number.parseInt(key, 10))
      .filter((value) => Number.isFinite(value));
    const merged = new Set<number>([...baseRows, ...sparseRows]);
    return Array.from(merged).sort((a, b) => a - b);
  }, [sheet]);

  if (!sheet) {
    return <div className="sheet-grid__empty">シートを選択してください。</div>;
  }

  return (
    <div className="sheet-grid">
      <table className="sheet-grid__table">
        <thead>
          <tr>
            <th className="sheet-grid__corner" />
            {columnLabels.map((label) => (
              <th key={label} className="sheet-grid__colHeader">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowNumbers.map((rowNumber) => {
            const rowKey = String(rowNumber);
            const rowData = sheet.rows[rowKey] ?? {};
            return (
              <tr key={rowNumber}>
                <th className="sheet-grid__rowHeader">{rowNumber}</th>
                {columnLabels.map((label) => {
                  const cell = rowData[label];
                  const value = cell?.value ?? '';
                  const title = value === '' ? undefined : String(value);
                  return (
                    <td key={label} className="sheet-grid__cell" title={title}>
                      {value}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {rowNumbers.length === 0 && (
            <tr>
              <td className="sheet-grid__emptyRow" colSpan={columnLabels.length + 1}>
                セルがまだありません。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default SheetGrid;
