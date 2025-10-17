import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FC,
  type KeyboardEvent,
  type MouseEvent
} from 'react';
import type { SheetData } from '../types/schema';

interface SheetGridProps {
  sheet: SheetData | null;
  onCommitCell?: (rowKey: string, columnKey: string, value: string) => void;
  onCommitCells?: (updates: Array<{ rowKey: string; columnKey: string; value: string }>) => void;
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

type CellPosition = {
  rowKey: string;
  columnKey: string;
};

const SheetGrid: FC<SheetGridProps> = ({ sheet, onCommitCell, onCommitCells }) => {
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

  const [selectedCell, setSelectedCell] = useState<CellPosition | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: CellPosition; end: CellPosition } | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const gridRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sheet) {
      setSelectedCell(null);
      setSelectionRange(null);
      setEditingCell(null);
      setEditingValue('');
      return;
    }

    const ensureWithinBounds = (cell: CellPosition | null): CellPosition | null => {
      if (!cell) return null;
      const rowExists = rowNumbers.includes(Number(cell.rowKey));
      const columnExists = columnLabels.includes(cell.columnKey);
      if (rowExists && columnExists) {
        return cell;
      }
      return null;
    };

    const currentCell = ensureWithinBounds(selectedCell);
    if (currentCell) {
      setSelectedCell(currentCell);
      setSelectionRange((prev) => {
        if (!prev) {
          return { start: currentCell, end: currentCell };
        }
        const start = ensureWithinBounds(prev.start) ?? currentCell;
        const end = ensureWithinBounds(prev.end) ?? currentCell;
        return { start, end };
      });
      return;
    }

    const firstRow = rowNumbers[0];
    const firstColumn = columnLabels[0];
    if (firstRow !== undefined && firstColumn) {
      const cell = { rowKey: String(firstRow), columnKey: firstColumn };
      setSelectedCell(cell);
      setSelectionRange({ start: cell, end: cell });
    } else {
      setSelectedCell(null);
      setSelectionRange(null);
    }
    setEditingCell(null);
    setEditingValue('');
  }, [sheet, rowNumbers, columnLabels]);

  useEffect(() => {
    if (editingCell) {
      inputRef.current?.focus();
    }
  }, [editingCell]);

  useEffect(() => {
    if (!gridRef.current) return;
    gridRef.current.focus({ preventScroll: true });
  }, [selectedCell]);

  const startEditing = useCallback(
    (initialValue?: string) => {
      if (!sheet || !selectedCell) return;
      const rowData = sheet.rows[selectedCell.rowKey] ?? {};
      const cellValue = rowData[selectedCell.columnKey]?.value ?? '';
      setEditingCell(selectedCell);
      setEditingValue(
        initialValue !== undefined ? initialValue : cellValue === null ? '' : String(cellValue)
      );
    },
    [sheet, selectedCell]
  );

  const cancelEditing = useCallback(() => {
    setEditingCell(null);
    setEditingValue('');
  }, []);

  const commitEditing = useCallback(() => {
    if (!sheet || !editingCell || !onCommitCell) {
      setEditingCell(null);
      return;
    }
    onCommitCell(editingCell.rowKey, editingCell.columnKey, editingValue);
    setEditingCell(null);
  }, [sheet, editingCell, editingValue, onCommitCell]);

  const moveSelection = useCallback(
    (deltaRow: number, deltaCol: number, extend = false) => {
      if (!selectedCell || !sheet) return;
      const rowIndex = rowNumbers.findIndex((num) => String(num) === selectedCell.rowKey);
      const colIndex = columnLabels.findIndex((label) => label === selectedCell.columnKey);
      if (rowIndex === -1 || colIndex === -1) return;

      const nextRowIndex = Math.min(Math.max(rowIndex + deltaRow, 0), rowNumbers.length - 1);
      const nextColIndex = Math.min(Math.max(colIndex + deltaCol, 0), columnLabels.length - 1);

      const nextRow = rowNumbers[nextRowIndex];
      const nextCol = columnLabels[nextColIndex];
      if (nextRow !== undefined && nextCol) {
        const nextCell = { rowKey: String(nextRow), columnKey: nextCol };
        setSelectedCell(nextCell);
        setSelectionRange((prev) => {
          if (!extend) {
            return { start: nextCell, end: nextCell };
          }
          const anchor = prev?.start ?? selectedCell ?? nextCell;
          return { start: anchor, end: nextCell };
        });
        setEditingCell(null);
      }
    },
    [selectedCell, sheet, rowNumbers, columnLabels]
  );

  const isPrintableKey = (event: KeyboardEvent<HTMLElement>): boolean => {
    return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
  };

  const updateSelection = useCallback((cell: CellPosition) => {
    setSelectedCell(cell);
    setSelectionRange({ start: cell, end: cell });
  }, []);

  const handleCellMouseDown = useCallback(
    (event: MouseEvent<HTMLTableCellElement>, rowKey: string, columnKey: string) => {
      event.preventDefault();
      const cell = { rowKey, columnKey };
      setEditingCell(null);
      if (event.shiftKey && (selectionRange || selectedCell)) {
        const anchor = selectionRange?.start ?? selectedCell ?? cell;
        setSelectedCell(cell);
        setSelectionRange({ start: anchor, end: cell });
      } else {
        updateSelection(cell);
      }
    },
    [selectionRange, updateSelection, selectedCell]
  );

  const handleDoubleClick = useCallback(
    (rowKey: string, columnKey: string) => {
      const cell = { rowKey, columnKey };
      updateSelection(cell);
      startEditing();
    },
    [startEditing, updateSelection]
  );

  if (!sheet) {
    return <div className="sheet-grid__empty">シートを選択してください。</div>;
  }

  const getCellDisplayValue = (rowKey: string, columnKey: string): string => {
    const rowData = sheet.rows[rowKey] ?? {};
    const cell = rowData[columnKey];
    if (cell === undefined || cell.value === null) return '';
    return String(cell.value);
  };

  const getCellPosition = (rowKey: string, columnKey: string): { rowIndex: number; colIndex: number } | null => {
    const rowIndex = rowNumbers.findIndex((num) => String(num) === rowKey);
    const colIndex = columnLabels.findIndex((label) => label === columnKey);
    if (rowIndex === -1 || colIndex === -1) return null;
    return { rowIndex, colIndex };
  };

  const isSelected = (rowKey: string, columnKey: string): boolean =>
    selectedCell?.rowKey === rowKey && selectedCell?.columnKey === columnKey;

  const isInSelectionRange = (rowKey: string, columnKey: string): boolean => {
    if (!selectionRange) return false;
    const startPos = getCellPosition(selectionRange.start.rowKey, selectionRange.start.columnKey);
    const endPos = getCellPosition(selectionRange.end.rowKey, selectionRange.end.columnKey);
    const cellPos = getCellPosition(rowKey, columnKey);
    if (!startPos || !endPos || !cellPos) return false;
    const rowMin = Math.min(startPos.rowIndex, endPos.rowIndex);
    const rowMax = Math.max(startPos.rowIndex, endPos.rowIndex);
    const colMin = Math.min(startPos.colIndex, endPos.colIndex);
    const colMax = Math.max(startPos.colIndex, endPos.colIndex);
    return cellPos.rowIndex >= rowMin && cellPos.rowIndex <= rowMax && cellPos.colIndex >= colMin && cellPos.colIndex <= colMax;
  };

  const copySelection = useCallback(async () => {
    if (!sheet || !selectionRange) return;
    const startPos = getCellPosition(selectionRange.start.rowKey, selectionRange.start.columnKey);
    const endPos = getCellPosition(selectionRange.end.rowKey, selectionRange.end.columnKey);
    if (!startPos || !endPos) return;

    const rowMin = Math.min(startPos.rowIndex, endPos.rowIndex);
    const rowMax = Math.max(startPos.rowIndex, endPos.rowIndex);
    const colMin = Math.min(startPos.colIndex, endPos.colIndex);
    const colMax = Math.max(startPos.colIndex, endPos.colIndex);

    const lines: string[] = [];
    for (let r = rowMin; r <= rowMax; r += 1) {
      const rowKey = String(rowNumbers[r]);
      const rowValues: string[] = [];
      for (let c = colMin; c <= colMax; c += 1) {
        const columnKey = columnLabels[c];
        rowValues.push(getCellDisplayValue(rowKey, columnKey));
      }
      lines.push(rowValues.join('\t'));
    }
    const text = lines.join('\n');

    const fallbackCopy = (content: string) => {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    };

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
    } catch (error) {
      fallbackCopy(text);
    }
  }, [sheet, selectionRange, rowNumbers, columnLabels, getCellDisplayValue, getCellPosition]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!sheet) return;

      if (editingCell) {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitEditing();
          moveSelection(1, 0);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelEditing();
        }
        return;
      }

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          moveSelection(-1, 0, event.shiftKey);
          break;
        case 'ArrowDown':
          event.preventDefault();
          moveSelection(1, 0, event.shiftKey);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          moveSelection(0, -1, event.shiftKey);
          break;
        case 'ArrowRight':
          event.preventDefault();
          moveSelection(0, 1, event.shiftKey);
          break;
        case 'Enter':
          event.preventDefault();
          startEditing();
          break;
        case 'Tab':
          event.preventDefault();
          moveSelection(0, event.shiftKey ? -1 : 1, event.shiftKey);
          break;
        case 'Backspace':
        case 'Delete':
          if (selectedCell && onCommitCell) {
            event.preventDefault();
            void onCommitCell(selectedCell.rowKey, selectedCell.columnKey, '');
          }
          break;
        case 'c':
        case 'C':
          if ((event.metaKey || event.ctrlKey) && selectionRange) {
            event.preventDefault();
            void copySelection();
          }
          break;
        case 'v':
        case 'V':
          if ((event.metaKey || event.ctrlKey) && !editingCell) {
            // Allow onPaste handler to handle actual paste
          }
          break;
        default:
          if (isPrintableKey(event)) {
            event.preventDefault();
            startEditing(event.key);
          }
          break;
      }
    },
    [
      sheet,
      editingCell,
      commitEditing,
      cancelEditing,
      moveSelection,
      startEditing,
      selectedCell,
      onCommitCell,
      selectionRange,
      copySelection
    ]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (!sheet || editingCell || !selectedCell || !onCommitCells) return;
      const clipboardText = event.clipboardData.getData('text/plain');
      if (!clipboardText) return;

      event.preventDefault();

      const startPos = getCellPosition(selectedCell.rowKey, selectedCell.columnKey);
      if (!startPos) return;

      const rows = clipboardText
        .replace(/\r/g, '')
        .split('\n')
        .filter((line) => line.length > 0);

      if (rows.length === 0) return;

      const updates: Array<{ rowKey: string; columnKey: string; value: string }> = [];
      let lastCell: CellPosition = selectedCell;

      rows.forEach((line, rowOffset) => {
        const columns = line.split('\t');
        columns.forEach((value, colOffset) => {
          const targetRowIndex = startPos.rowIndex + rowOffset;
          const targetColIndex = startPos.colIndex + colOffset;
          if (targetRowIndex >= rowNumbers.length || targetColIndex >= columnLabels.length) {
            return;
          }
          const rowKey = String(rowNumbers[targetRowIndex]);
          const columnKey = columnLabels[targetColIndex];
          updates.push({ rowKey, columnKey, value });
          lastCell = { rowKey, columnKey };
        });
      });

      if (updates.length === 0) return;
      onCommitCells(updates);
      setSelectedCell(lastCell);
      setSelectionRange({ start: selectedCell, end: lastCell });
    },
    [sheet, editingCell, selectedCell, onCommitCells, rowNumbers, columnLabels, getCellPosition]
  );

  const isEditing = (rowKey: string, columnKey: string): boolean =>
    editingCell?.rowKey === rowKey && editingCell?.columnKey === columnKey;

  return (
    <div
      className="sheet-grid"
      tabIndex={0}
      role="grid"
      ref={gridRef}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    >
      <table className="sheet-grid__table">
        <thead>
          <tr>
            <th className="sheet-grid__corner" />
            {columnLabels.map((label) => (
              <th
                key={label}
                className={`sheet-grid__colHeader${
                  selectedCell?.columnKey === label ? ' sheet-grid__colHeader--active' : ''
                }`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowNumbers.map((rowNumber) => {
            const rowKey = String(rowNumber);
            const rowData = sheet.rows[rowKey] ?? {};
            const rowSelected = selectedCell?.rowKey === rowKey;

            return (
              <tr key={rowNumber}>
                <th className={`sheet-grid__rowHeader${rowSelected ? ' sheet-grid__rowHeader--active' : ''}`}>
                  {rowNumber}
                </th>
                {columnLabels.map((label) => {
                  const value = rowData[label]?.value ?? '';
                  const title = value === '' ? undefined : String(value);
                  const selected = isSelected(rowKey, label);
                  const editing = isEditing(rowKey, label);
                  return (
                    <td
                      key={label}
                      className={`sheet-grid__cell${
                        selected ? ' sheet-grid__cell--selected' : isInSelectionRange(rowKey, label) ? ' sheet-grid__cell--inRange' : ''
                      }${editing ? ' sheet-grid__cell--editing' : ''}`}
                      title={title}
                      onMouseDown={(event) => handleCellMouseDown(event, rowKey, label)}
                      onDoubleClick={() => handleDoubleClick(rowKey, label)}
                    >
                      {editing ? (
                        <input
                          ref={inputRef}
                          className="sheet-grid__cellInput"
                          value={editingValue}
                          onChange={(event) => setEditingValue(event.currentTarget.value)}
                          onBlur={commitEditing}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitEditing();
                              moveSelection(1, 0);
                            } else if (event.key === 'Escape') {
                              event.preventDefault();
                              cancelEditing();
                            }
                          }}
                        />
                      ) : (
                        getCellDisplayValue(rowKey, label)
                      )}
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
