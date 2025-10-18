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

const fromColumnLabel = (label: string): number | null => {
  if (!label) {
    return null;
  }
  let result = 0;
  const normalized = label.toUpperCase();

  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i) - 65;
    if (code < 0 || code > 25) {
      return null;
    }
    result = result * 26 + (code + 1);
  }

  return result - 1;
};

type CellPosition = {
  rowKey: string;
  columnKey: string;
};

const SheetGrid: FC<SheetGridProps> = ({ sheet, onCommitCell, onCommitCells }) => {
  const columnLabels = useMemo(() => {
    if (!sheet) return [];
    const baseCount = Math.max(sheet.gridSize.cols, 0);

    let maxSparseIndex = -1;
    Object.values(sheet.rows).forEach((row) => {
      Object.keys(row).forEach((key) => {
        const index = fromColumnLabel(key);
        if (index !== null) {
          maxSparseIndex = Math.max(maxSparseIndex, index);
        }
      });
    });

    const effectiveCount = Math.max(baseCount, maxSparseIndex + 1);
    return Array.from({ length: effectiveCount }, (_, idx) => toColumnLabel(idx));
  }, [sheet]);

  const rowNumbers = useMemo(() => {
    if (!sheet) return [];
    const baseCount = Math.max(sheet.gridSize.rows, 0);
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

*** End Patch to src/components/SheetGrid.tsx...