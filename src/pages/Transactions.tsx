import {
  ChangeEvent,
  FormEvent,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import {
  TransactionSplitLineInput,
  TransactionUpdateOptions,
  useData
} from '../data/DataContext';
import {
  Account,
  Category,
  DataActionError,
  Payee,
  RuleActionField,
  RuleRunPreview,
  RuleFlowType,
  SubCategory,
  Tag,
  Transaction
} from '../data/models';
import { buildCategoryTree } from '../utils/categories';
import { formatCurrency, formatDate } from '../utils/format';
import '../styles/transactions.css';

const COLUMN_STORAGE_KEY = 'transactions.workspace.columns.v1';
const ROW_HEIGHT = 52;
const WORKSPACE_METADATA_KEY = '__transactionsWorkspace';

const FLOW_LABELS: Record<RuleFlowType, string> = {
  in: 'Inflow',
  out: 'Outflow',
  transfer: 'Transfer',
  interest: 'Interest',
  fees: 'Fees'
};

type ColumnId =
  | 'date'
  | 'description'
  | 'payee'
  | 'amount'
  | 'account'
  | 'provider'
  | 'flow'
  | 'category'
  | 'subCategory'
  | 'currency'
  | 'baseAmount'
  | 'tags'
  | 'notes';

type ColumnDefinition = {
  id: ColumnId;
  label: string;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
};

type ColumnState = {
  order: ColumnId[];
  hidden: ColumnId[];
};

type WorkspaceMetadata = {
  auditLog?: {
    id: string;
    field: string;
    previous: string | null;
    next: string | null;
    user: string;
    timestamp: string;
  }[];
  lastManualEdit?: { user: string; timestamp: string; fields: string[] };
  manuallyEdited?: boolean;
  splitParentId?: string | null;
  splitIndex?: number | null;
  splitTotal?: number | null;
  rawFields?: Record<string, unknown> | null;
};

type TransactionView = {
  transaction: Transaction;
  account: Account | undefined;
  payee: Payee | undefined;
  category: Category | undefined;
  subCategory: SubCategory | undefined;
  tags: Tag[];
  provider: string;
  flow: RuleFlowType;
  currency: string;
  displayAmount: number;
  baseAmount: number;
};

const parseWorkspaceMetadata = (transaction: Transaction): WorkspaceMetadata => {
  const metadata = transaction.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const raw = (metadata as Record<string, unknown>)[WORKSPACE_METADATA_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const workspace = raw as WorkspaceMetadata;
  const auditLog = Array.isArray(workspace.auditLog)
    ? (workspace.auditLog as WorkspaceMetadata['auditLog'])
    : undefined;
  const lastManualEdit =
    workspace.lastManualEdit && typeof workspace.lastManualEdit === 'object'
      ? (workspace.lastManualEdit as WorkspaceMetadata['lastManualEdit'])
      : undefined;
  const rawFields =
    workspace.rawFields && typeof workspace.rawFields === 'object' && !Array.isArray(workspace.rawFields)
      ? (workspace.rawFields as Record<string, unknown>)
      : undefined;
  return {
    auditLog,
    lastManualEdit,
    manuallyEdited: workspace.manuallyEdited ?? Boolean(lastManualEdit),
    splitParentId: workspace.splitParentId ?? undefined,
    splitIndex: workspace.splitIndex ?? undefined,
    splitTotal: workspace.splitTotal ?? undefined,
    rawFields: rawFields ?? undefined
  };
};

const resolveFlowType = (
  transaction: Transaction,
  account: Account | undefined,
  category: Category | undefined,
  masterLookup: Map<string, RuleFlowType>
): RuleFlowType => {
  if (transaction.flowOverride) {
    return transaction.flowOverride;
  }
  if (category) {
    const flow = masterLookup.get(category.masterCategoryId);
    if (flow) {
      return flow;
    }
  }
  if (!account) {
    return transaction.amount >= 0 ? 'in' : 'out';
  }
  return transaction.amount >= 0 ? 'in' : 'out';
};

const defaultColumnState: ColumnState = {
  order: [
    'date',
    'description',
    'payee',
    'amount',
    'account',
    'provider',
    'flow',
    'category',
    'subCategory',
    'currency',
    'baseAmount',
    'tags',
    'notes'
  ],
  hidden: ['baseAmount']
};

const columnDefinitions: ColumnDefinition[] = [
  { id: 'date', label: 'Date', minWidth: 140 },
  { id: 'description', label: 'Description', minWidth: 200 },
  { id: 'payee', label: 'Payee', minWidth: 180 },
  { id: 'amount', label: 'Amount', minWidth: 140, align: 'right' },
  { id: 'account', label: 'Account', minWidth: 160 },
  { id: 'provider', label: 'Provider', minWidth: 160 },
  { id: 'flow', label: 'Flow', minWidth: 120 },
  { id: 'category', label: 'Category', minWidth: 200 },
  { id: 'subCategory', label: 'Sub-category', minWidth: 200 },
  { id: 'currency', label: 'Currency', minWidth: 120 },
  { id: 'baseAmount', label: 'Base amount', minWidth: 160, align: 'right' },
  { id: 'tags', label: 'Tags', minWidth: 200 },
  { id: 'notes', label: 'Notes', minWidth: 220 }
];

const loadColumnState = (): ColumnState => {
  if (typeof window === 'undefined') {
    return defaultColumnState;
  }
  try {
    const stored = window.localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!stored) {
      return defaultColumnState;
    }
    const parsed = JSON.parse(stored) as ColumnState;
    if (!parsed || !Array.isArray(parsed.order) || !Array.isArray(parsed.hidden)) {
      return defaultColumnState;
    }
    const known = new Set(columnDefinitions.map((column) => column.id));
    const order = parsed.order.filter((column) => known.has(column as ColumnId)) as ColumnId[];
    const hidden = parsed.hidden.filter((column) => known.has(column as ColumnId)) as ColumnId[];
    return {
      order: order.length ? order : defaultColumnState.order,
      hidden
    };
  } catch (error) {
    console.warn('Unable to parse column layout', error);
    return defaultColumnState;
  }
};

const persistColumnState = (state: ColumnState) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Unable to persist column layout', error);
  }
};

const difference = (a: number, b: number) => Math.abs(a - b);

const useColumnState = () => {
  const [state, setState] = useState<ColumnState>(() => loadColumnState());

  const update = useCallback((updater: (prev: ColumnState) => ColumnState) => {
    setState((prev) => {
      const next = updater(prev);
      persistColumnState(next);
      return next;
    });
  }, []);

  return [state, update] as const;
};

const mapTags = (allTags: Tag[], ids: string[]) => {
  const lookup = new Map(allTags.map((tag) => [tag.id, tag]));
  return ids
    .map((id) => lookup.get(id))
    .filter((tag): tag is Tag => Boolean(tag));
};

const toAmountString = (value: number) => {
  if (!Number.isFinite(value)) {
    return '';
  }
  return value.toFixed(2);
};

const convertToCsvValue = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    const needsQuotes = value.includes(',') || value.includes('"') || value.includes('\n');
    const escaped = value.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  }
  return value.toString();
};

const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const content = rows.map((row) => row.map(convertToCsvValue).join(',')).join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const useResizeObserver = (callback: (entry: DOMRectReadOnly) => void) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        callback(entries[0].contentRect);
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [callback]);
  return ref;
};
const Modal = ({
  open,
  title,
  width = 520,
  onClose,
  children,
  actions
}: {
  open: boolean;
  title: string;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) => {
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel" style={{ width }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-footer">{actions}</div>}
      </div>
    </div>,
    document.body
  );
};

const ColumnManager = ({
  open,
  onClose,
  state,
  onChange
}: {
  open: boolean;
  onClose: () => void;
  state: ColumnState;
  onChange: (state: ColumnState) => void;
}) => {
  const visible = state.order.filter((column) => !state.hidden.includes(column));
  const hidden = columnDefinitions
    .map((column) => column.id)
    .filter((column) => !visible.includes(column));

  const handleToggle = (column: ColumnId) => {
    const hiddenSet = new Set(state.hidden);
    if (hiddenSet.has(column)) {
      hiddenSet.delete(column);
    } else {
      hiddenSet.add(column);
    }
    onChange({
      ...state,
      hidden: Array.from(hiddenSet)
    });
  };

  const moveColumn = (column: ColumnId, direction: -1 | 1) => {
    const order = [...state.order];
    const index = order.indexOf(column);
    if (index === -1) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= order.length) return;
    const temp = order[index];
    order[index] = order[nextIndex];
    order[nextIndex] = temp;
    onChange({ ...state, order });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customise columns"
      actions={
        <button type="button" className="primary-button" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="column-manager">
        <div>
          <h4>Visible</h4>
          <p className="muted-text">Drag order with the controls and uncheck to hide a column.</p>
          <ul>
            {visible.map((column) => {
              const definition = columnDefinitions.find((item) => item.id === column);
              if (!definition) return null;
              return (
                <li key={column}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!state.hidden.includes(column)}
                      onChange={() => handleToggle(column)}
                    />
                    {definition.label}
                  </label>
                  <div className="column-manager-actions">
                    <button type="button" onClick={() => moveColumn(column, -1)} aria-label="Move up">
                      ↑
                    </button>
                    <button type="button" onClick={() => moveColumn(column, 1)} aria-label="Move down">
                      ↓
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h4>Hidden</h4>
          <p className="muted-text">Check to add a column back into the table.</p>
          <ul>
            {hidden.map((column) => {
              const definition = columnDefinitions.find((item) => item.id === column);
              if (!definition) return null;
              return (
                <li key={column}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!state.hidden.includes(column)}
                      onChange={() => handleToggle(column)}
                    />
                    {definition.label}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Modal>
  );
};
const VirtualTableBody = ({
  rows,
  rowHeight,
  renderRow
}: {
  rows: TransactionView[];
  rowHeight: number;
  renderRow: (row: TransactionView, index: number) => React.ReactNode;
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const containerRef = useResizeObserver((entry) => {
    setViewportHeight(entry.height);
  });

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  };

  const totalHeight = rows.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 4);
  const endIndex = Math.min(
    rows.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + 4
  );
  const visibleRows = rows.slice(startIndex, endIndex);
  const topSpacer = startIndex * rowHeight;
  const bottomSpacer = totalHeight - topSpacer - visibleRows.length * rowHeight;

  return (
    <div
      className="virtual-table"
      ref={containerRef}
      onScroll={handleScroll}
      style={{ maxHeight: '60vh' }}
    >
      <div style={{ height: topSpacer }} />
      {visibleRows.map((row, index) => (
        <div key={row.transaction.id} style={{ height: rowHeight }} className="virtual-table-row">
          {renderRow(row, startIndex + index)}
        </div>
      ))}
      <div style={{ height: Math.max(0, bottomSpacer) }} />
    </div>
  );
};
const buildCategoryOptionValue = (categoryId: string | null, subCategoryId: string | null) => {
  if (!categoryId) return '';
  return subCategoryId ? `${categoryId}|${subCategoryId}` : `${categoryId}|`;
};

const parseCategoryOptionValue = (
  value: string
): { categoryId: string | null; subCategoryId: string | null } => {
  if (!value) return { categoryId: null, subCategoryId: null };
  const [categoryId, subCategoryId] = value.split('|');
  return {
    categoryId: categoryId || null,
    subCategoryId: subCategoryId || null
  };
};

type CategoryOption = {
  value: string;
  label: string;
};

type SplitLineState = {
  id: string;
  mode: 'amount' | 'percent';
  value: string;
  memo: string;
  categoryValue: string;
  payeeId: string;
  tags: string[];
  notes: string;
};

const createSplitLine = (transaction: Transaction): SplitLineState => ({
  id: Math.random().toString(36).slice(2),
  mode: 'amount',
  value: toAmountString(transaction.amount / 2),
  memo: transaction.memo ?? '',
  categoryValue: buildCategoryOptionValue(transaction.categoryId, transaction.subCategoryId),
  payeeId: transaction.payeeId ?? '',
  tags: [...transaction.tags],
  notes: ''
});

type SplitTransactionDialogProps = {
  open: boolean;
  transaction: Transaction | null;
  categoryOptions: CategoryOption[];
  payees: Payee[];
  tags: Tag[];
  onClose: () => void;
  onConfirm: (lines: TransactionSplitLineInput[]) => DataActionError | null;
};

const SplitTransactionDialog = ({
  open,
  transaction,
  categoryOptions,
  payees,
  tags,
  onClose,
  onConfirm
}: SplitTransactionDialogProps) => {
  const [lines, setLines] = useState<SplitLineState[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transaction || !open) {
      setLines([]);
      setError(null);
      return;
    }
    setLines([createSplitLine(transaction), createSplitLine(transaction)]);
    setError(null);
  }, [transaction, open]);

  if (!transaction) {
    return null;
  }

  const totalAmount = transaction.amount;

  const resolveLineAmount = (line: SplitLineState) => {
    const numeric = Number.parseFloat(line.value);
    if (!Number.isFinite(numeric)) return 0;
    if (line.mode === 'percent') {
      return (totalAmount * numeric) / 100;
    }
    return numeric;
  };

  const amounts = lines.map(resolveLineAmount);
  const sumAmount = amounts.reduce((sum, value) => sum + value, 0);

  const updateLine = (id: string, updates: Partial<SplitLineState>) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...updates } : line)));
  };

  const addLine = () => {
    setLines((current) => [...current, createSplitLine(transaction)]);
  };

  const removeLine = (id: string) => {
    setLines((current) => (current.length <= 2 ? current : current.filter((line) => line.id !== id)));
  };

  const handleConfirm = () => {
    const parsedLines: TransactionSplitLineInput[] = lines.map((line, index) => {
      const { categoryId, subCategoryId } = parseCategoryOptionValue(line.categoryValue);
      const amount = resolveLineAmount(line);
      return {
        amount,
        memo: line.memo,
        categoryId,
        subCategoryId,
        payeeId: line.payeeId || null,
        tags: line.tags,
        metadata: {
          splitIndex: index,
          splitTotal: lines.length,
          notes: line.notes
        }
      };
    });

    const diff = difference(sumAmount, totalAmount);
    if (diff > Math.max(Math.abs(totalAmount) * 0.0001, 0.01)) {
      setError('Split totals must match the original amount. Adjust the allocation.');
      return;
    }

    const result = onConfirm(parsedLines);
    if (result) {
      setError(`${result.title}: ${result.description}`);
      return;
    }
    onClose();
  };

  const tagOptions = tags.map((tag) => ({ id: tag.id, name: tag.name }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={transaction ? `Split ${formatCurrency(transaction.amount, transaction.currency)}` : 'Split transaction'}
      width={640}
      actions={
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={addLine}>
            Add line
          </button>
          <button type="button" className="primary-button" onClick={handleConfirm}>
            Apply split
          </button>
        </div>
      }
    >
      <div className="split-dialog-summary">
        <div>
          <strong>Original:</strong> {formatCurrency(transaction.amount, transaction.currency)}
        </div>
        <div>
          <strong>Split total:</strong> {formatCurrency(sumAmount, transaction.currency)}
        </div>
      </div>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <div className="split-lines">
        {lines.map((line, index) => (
          <div key={line.id} className="split-line">
            <div className="split-line-header">
              <strong>Line {index + 1}</strong>
              <button
                type="button"
                className="icon-button"
                onClick={() => removeLine(line.id)}
                disabled={lines.length <= 2}
                aria-label="Remove line"
              >
                ×
              </button>
            </div>
            <div className="split-line-grid">
              <label>
                Allocation
                <div className="split-line-allocation">
                  <select
                    value={line.mode}
                    onChange={(event) =>
                      updateLine(line.id, { mode: event.target.value as 'amount' | 'percent' })
                    }
                  >
                    <option value="amount">Amount</option>
                    <option value="percent">Percent</option>
                  </select>
                  <input
                    type="number"
                    value={line.value}
                    onChange={(event) => updateLine(line.id, { value: event.target.value })}
                  />
                  <span>{line.mode === 'amount' ? transaction.currency : '%'}</span>
                </div>
              </label>
              <label>
                Memo
                <input
                  type="text"
                  value={line.memo}
                  onChange={(event) => updateLine(line.id, { memo: event.target.value })}
                  placeholder="Optional memo"
                />
              </label>
              <label>
                Category
                <select
                  value={line.categoryValue}
                  onChange={(event) => updateLine(line.id, { categoryValue: event.target.value })}
                >
                  <option value="">Uncategorised</option>
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Payee
                <select
                  value={line.payeeId}
                  onChange={(event) => updateLine(line.id, { payeeId: event.target.value })}
                >
                  <option value="">Unassigned</option>
                  {payees.map((payee) => (
                    <option key={payee.id} value={payee.id}>
                      {payee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tags
                <select
                  multiple
                  value={line.tags}
                  onChange={(event) =>
                    updateLine(line.id, {
                      tags: Array.from(event.target.selectedOptions, (option) => option.value)
                    })
                  }
                >
                  {tagOptions.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Notes
                <textarea
                  value={line.notes}
                  onChange={(event) => updateLine(line.id, { notes: event.target.value })}
                  placeholder="Optional notes for this line"
                />
              </label>
              <div className="split-line-preview">
                <span>Calculated amount</span>
                <strong>{formatCurrency(resolveLineAmount(line), transaction.currency)}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};
const InspectorPanel = ({
  open,
  view,
  categoryOptions,
  payees,
  tags,
  onClose,
  onUpdate
}: {
  open: boolean;
  view: TransactionView | null;
  categoryOptions: CategoryOption[];
  payees: Payee[];
  tags: Tag[];
  onClose: () => void;
  onUpdate: (
    updates: Partial<Transaction>,
    options: TransactionUpdateOptions
  ) => void;
}) => {
  if (!view || !open) return null;

  const { transaction } = view;
  const metadata = parseWorkspaceMetadata(transaction);
  const rawImport =
    transaction.metadata && typeof transaction.metadata === 'object'
      ? ((transaction.metadata as Record<string, unknown>).raw as Record<string, unknown> | undefined)
      : undefined;

  const handleCategoryChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { categoryId, subCategoryId } = parseCategoryOptionValue(event.target.value);
    onUpdate(
      {
        categoryId,
        subCategoryId
      },
      {
        manual: true,
        user: 'User',
        auditEntries: [
          {
            field: 'category',
            previous: transaction.categoryId ?? null,
            next: categoryId ?? null
          },
          {
            field: 'subCategory',
            previous: transaction.subCategoryId ?? null,
            next: subCategoryId ?? null
          }
        ]
      }
    );
  };

  const handlePayeeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onUpdate(
      {
        payeeId: event.target.value || null
      },
      {
        manual: true,
        user: 'User',
        auditEntries: [
          {
            field: 'payee',
            previous: transaction.payeeId ?? null,
            next: event.target.value || null
          }
        ]
      }
    );
  };

  const handleTagsChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextTags = Array.from(event.target.selectedOptions, (option) => option.value);
    onUpdate(
      { tags: nextTags },
      {
        manual: true,
        user: 'User',
        auditEntries: [
          {
            field: 'tags',
            previous: transaction.tags.join(',') || null,
            next: nextTags.join(',') || null
          }
        ]
      }
    );
  };

  const handleMemoChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate(
      { memo: event.target.value },
      {
        manual: true,
        user: 'User',
        auditEntries: [
          {
            field: 'memo',
            previous: transaction.memo ?? null,
            next: event.target.value || null
          }
        ]
      }
    );
  };

  return createPortal(
    <aside className="inspector" aria-label="Transaction inspector">
      <div className="inspector-header">
        <h3>Transaction details</h3>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close inspector">
          ×
        </button>
      </div>
      <div className="inspector-body">
        <section>
          <h4>Overview</h4>
          <div className="inspector-grid">
            <div>
              <span className="muted-text">Date</span>
              <strong>{formatDate(transaction.date)}</strong>
            </div>
            <div>
              <span className="muted-text">Account</span>
              <strong>{view.account ? view.account.name : 'Unknown account'}</strong>
            </div>
            <div>
              <span className="muted-text">Amount</span>
              <strong>{formatCurrency(transaction.amount, view.currency)}</strong>
            </div>
            {view.baseAmount !== view.displayAmount && (
              <div>
                <span className="muted-text">Base equivalent</span>
                <strong>{formatCurrency(view.baseAmount, view.currency)}</strong>
              </div>
            )}
            <div>
              <span className="muted-text">Provider</span>
              <strong>{view.provider}</strong>
            </div>
            <div>
              <span className="muted-text">Flow</span>
              <strong>{FLOW_LABELS[view.flow]}</strong>
            </div>
          </div>
        </section>
        <section>
          <h4>Classification</h4>
          <label>
            Category
            <select
              value={buildCategoryOptionValue(transaction.categoryId, transaction.subCategoryId)}
              onChange={handleCategoryChange}
            >
              <option value="">Uncategorised</option>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payee
            <select value={transaction.payeeId ?? ''} onChange={handlePayeeChange}>
              <option value="">Unassigned</option>
              {payees.map((payee) => (
                <option key={payee.id} value={payee.id}>
                  {payee.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tags
            <select multiple value={transaction.tags} onChange={handleTagsChange}>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <textarea value={transaction.memo ?? ''} onChange={handleMemoChange} />
          </label>
        </section>
        <section>
          <h4>History</h4>
          {metadata.lastManualEdit ? (
            <p className="muted-text">
              Last edited manually by {metadata.lastManualEdit.user} on{' '}
              {formatDate(metadata.lastManualEdit.timestamp)}.
            </p>
          ) : (
            <p className="muted-text">No manual edits recorded.</p>
          )}
          {metadata.auditLog && metadata.auditLog.length > 0 ? (
            <ul className="audit-log">
              {metadata.auditLog
                .slice()
                .reverse()
                .map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.field}</strong> changed to {entry.next ?? '—'} by {entry.user} on{' '}
                    {formatDate(entry.timestamp)}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="muted-text">No detailed edit history available.</p>
          )}
        </section>
        <section>
          <h4>Raw import data</h4>
          {rawImport ? (
            <dl className="inspector-raw">
              {Object.entries(rawImport).map(([key, value]) => (
                <Fragment key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value ?? '')}</dd>
                </Fragment>
              ))}
            </dl>
          ) : (
            <p className="muted-text">No raw import fields stored for this transaction.</p>
          )}
        </section>
      </div>
    </aside>,
    document.body
  );
};
const buildCategoryOptions = (
  categories: Category[],
  subCategories: SubCategory[],
  masterLookup: Map<string, string>,
  masterOrder: string[]
): CategoryOption[] => {
  const options: CategoryOption[] = [];
  const subsByCategory = new Map<string, SubCategory[]>(
    categories.map((category) => [
      category.id,
      subCategories
        .filter((sub) => sub.categoryId === category.id && !sub.archived)
        .sort((a, b) => a.name.localeCompare(b.name))
    ])
  );

  masterOrder.forEach((masterId) => {
    const categoryList = categories
      .filter((category) => category.masterCategoryId === masterId && !category.archived)
      .sort((a, b) => a.name.localeCompare(b.name));
    categoryList.forEach((category) => {
      const masterName = masterLookup.get(masterId) ?? 'Category';
      options.push({
        value: buildCategoryOptionValue(category.id, null),
        label: `${masterName} › ${category.name}`
      });
      const subs = subsByCategory.get(category.id) ?? [];
      subs.forEach((sub) => {
        options.push({
          value: buildCategoryOptionValue(category.id, sub.id),
          label: `${masterName} › ${category.name} › ${sub.name}`
        });
      });
    });
  });

  return options;
};

type FilterState = {
  dateFrom: string;
  dateTo: string;
  accountIds: string[];
  providerNames: string[];
  collectionIds: string[];
  flowTypes: RuleFlowType[];
  categoryId: string;
  subCategoryId: string;
  payeeQuery: string;
  tagIds: string[];
  minAmount: string;
  maxAmount: string;
  searchText: string;
  currency: string;
};

const defaultFilters: FilterState = {
  dateFrom: '',
  dateTo: '',
  accountIds: [],
  providerNames: [],
  collectionIds: [],
  flowTypes: [],
  categoryId: '',
  subCategoryId: '',
  payeeQuery: '',
  tagIds: [],
  minAmount: '',
  maxAmount: '',
  searchText: '',
  currency: 'all'
};

type BudgetDrilldownContext = {
  budgetId: string;
  budgetName: string;
  lineId: string;
  lineName: string;
  subLineId: string | null;
  subLineName: string | null;
  period: { start: string; end: string; label: string };
  flow: 'in' | 'out' | 'transfer';
  includeMode: 'all' | 'collections';
  accountIds: string[];
  collectionIds: string[];
  categoryId: string;
  subCategoryId: string | null;
};

type BulkActionState =
  | { type: 'category'; value: string }
  | { type: 'payee'; value: string }
  | { type: 'add-tags'; value: string[] }
  | { type: 'remove-tags'; value: string[] };
const Transactions = () => {
  const {
    state,
    addTransaction,
    updateTransaction,
    bulkUpdateTransactions,
    splitTransaction,
    archiveTransaction,
    previewRuleRun,
    runRules
  } = useData();

  const accounts = useMemo(
    () => state.accounts.filter((account) => !account.archived),
    [state.accounts]
  );
  const payees = useMemo(
    () => state.payees.filter((payee) => !payee.archived),
    [state.payees]
  );
  const tags = useMemo(() => state.tags.filter((tag) => !tag.archived), [state.tags]);
  const collections = useMemo(() => state.accountCollections, [state.accountCollections]);
  const accountNameLookup = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts]
  );
  const collectionNameLookup = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collection.name])),
    [collections]
  );
  const location = useLocation();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [budgetContext, setBudgetContext] = useState<BudgetDrilldownContext | null>(null);

  const summariseNames = (
    ids: string[],
    lookup: Map<string, string>,
    fallback: string
  ) => {
    if (ids.length === 0) {
      return fallback;
    }
    const names = ids
      .map((id) => lookup.get(id) ?? 'Unknown')
      .filter((name) => Boolean(name));
    if (names.length === 0) {
      return fallback;
    }
    if (names.length <= 3) {
      return names.join(', ');
    }
    return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
  };

  const handleClearBudgetContext = () => {
    setBudgetContext(null);
    setFilters(defaultFilters);
  };

  useEffect(() => {
    const payload = (location.state as { budgetDrilldown?: BudgetDrilldownContext } | null)?.budgetDrilldown;
    if (payload) {
      setBudgetContext(payload);
      setFilters({
        ...defaultFilters,
        dateFrom: payload.period.start,
        dateTo: payload.period.end,
        accountIds: payload.accountIds,
        providerNames: [],
        collectionIds: payload.includeMode === 'collections' ? payload.collectionIds : [],
        flowTypes: [payload.flow as RuleFlowType],
        categoryId: payload.categoryId,
        subCategoryId: payload.subCategoryId ?? '',
        payeeQuery: '',
        tagIds: [],
        minAmount: '',
        maxAmount: '',
        searchText: '',
        currency: 'all'
      });
      navigate('.', { replace: true, state: null });
    }
  }, [location.state, navigate]);

  const masterLookup = useMemo(() => {
    const map = new Map<string, string>();
    state.masterCategories.forEach((master) => {
      map.set(master.id, master.name);
    });
    return map;
  }, [state.masterCategories]);

  const masterFlowLookup = useMemo(() => {
    const lookup = new Map<string, RuleFlowType>();
    state.categories.forEach((category) => {
      if (category.archived) return;
      const master = state.masterCategories.find((item) => item.id === category.masterCategoryId);
      if (!master) return;
      const name = master.name.toLocaleLowerCase();
      if (name.includes('transfer')) {
        lookup.set(category.masterCategoryId, 'transfer');
      } else if (name.includes('interest')) {
        lookup.set(category.masterCategoryId, 'interest');
      } else if (name.includes('fee')) {
        lookup.set(category.masterCategoryId, 'fees');
      } else if (name.includes('income') || name.includes('inflow')) {
        lookup.set(category.masterCategoryId, 'in');
      } else {
        lookup.set(category.masterCategoryId, 'out');
      }
    });
    return lookup;
  }, [state.categories, state.masterCategories]);

  const [showBaseAmounts, setShowBaseAmounts] = useState(false);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [columnState, setColumnState] = useColumnState();
  const [columnManagerOpen, setColumnManagerOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<BulkActionState | null>(null);
  const [splitTargetId, setSplitTargetId] = useState<string | null>(null);
  const [inspectorId, setInspectorId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'native' | 'base'>('native');
  const [runPreviewState, setRunPreviewState] = useState<RuleRunPreview | null>(null);
  const [previewContext, setPreviewContext] = useState<
    { transactionIds: string[]; description: string } | null
  >(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    accountId: accounts[0]?.id ?? '',
    payeeId: '',
    amount: '',
    memo: '',
    tags: [] as string[]
  });
  const [addError, setAddError] = useState<DataActionError | null>(null);

  useEffect(() => {
    if (!accounts.find((account) => account.id === addForm.accountId) && accounts[0]) {
      setAddForm((current) => ({ ...current, accountId: accounts[0].id }));
    }
  }, [accounts, addForm.accountId]);

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const categoryById = useMemo(
    () => new Map(state.categories.map((category) => [category.id, category])),
    [state.categories]
  );
  const subCategoryById = useMemo(
    () => new Map(state.subCategories.map((sub) => [sub.id, sub])),
    [state.subCategories]
  );
  const payeeById = useMemo(() => new Map(payees.map((payee) => [payee.id, payee])), [payees]);
  const masterOrder = useMemo(() => state.masterCategories.map((master) => master.id), [state.masterCategories]);
  const categoryOptions = useMemo(
    () => buildCategoryOptions(state.categories, state.subCategories, masterLookup, masterOrder),
    [state.categories, state.subCategories, masterLookup, masterOrder]
  );
  const exchangeRateMeta = useMemo(() => {
    const map = new Map<string, number>();
    state.settings.exchangeRates.forEach((entry) => {
      map.set(entry.currency.toUpperCase(), entry.rateToBase);
    });
    const baseKey = state.settings.baseCurrency.toUpperCase();
    if (!map.has(baseKey)) {
      map.set(baseKey, 1);
    }
    return map;
  }, [state.settings.baseCurrency, state.settings.exchangeRates]);

  const convertToBase = useCallback(
    (amount: number, currency: string | undefined | null) => {
      if (!currency) return amount;
      const rate = exchangeRateMeta.get(currency.toUpperCase()) ?? 1;
      return amount * rate;
    },
    [exchangeRateMeta]
  );
  const transactions = useMemo(() => {
    const currencyFilter = filters.currency === 'all' ? null : filters.currency;
    const flowFilterSet = new Set(filters.flowTypes);
    const accountFilterSet = new Set(filters.accountIds);
    const providerFilterSet = new Set(filters.providerNames);
    const collectionFilterSet = new Set(filters.collectionIds);
    const tagFilterSet = new Set(filters.tagIds);
    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : null;
    if (dateTo) {
      dateTo.setHours(23, 59, 59, 999);
    }
    const minAmount = filters.minAmount ? Number.parseFloat(filters.minAmount) : null;
    const maxAmount = filters.maxAmount ? Number.parseFloat(filters.maxAmount) : null;
    const searchQuery = filters.searchText.trim().toLocaleLowerCase();
    const payeeQuery = filters.payeeQuery.trim().toLocaleLowerCase();

    return state.transactions
      .filter((transaction) => {
        const account = accountById.get(transaction.accountId);
        if (!account) return false;
        if (accountFilterSet.size > 0 && !accountFilterSet.has(account.id)) {
          return false;
        }
        if (providerFilterSet.size > 0 && !providerFilterSet.has(account.provider)) {
          return false;
        }
        if (collectionFilterSet.size > 0) {
          const matchesCollection = account.collectionIds.some((id) => collectionFilterSet.has(id));
          if (!matchesCollection) return false;
        }
        const date = new Date(transaction.date);
        if (Number.isNaN(date.getTime())) return false;
        if (dateFrom && date < dateFrom) return false;
        if (dateTo && date > dateTo) return false;

        const category = transaction.categoryId ? categoryById.get(transaction.categoryId) : undefined;
        const flow = resolveFlowType(transaction, account, category, masterFlowLookup);
        if (flowFilterSet.size > 0 && !flowFilterSet.has(flow)) {
          return false;
        }

        if (filters.categoryId) {
          if (!transaction.categoryId || transaction.categoryId !== filters.categoryId) {
            return false;
          }
          if (filters.subCategoryId) {
            if (!transaction.subCategoryId || transaction.subCategoryId !== filters.subCategoryId) {
              return false;
            }
          }
        }

        if (tagFilterSet.size > 0) {
          const hasAllTags = Array.from(tagFilterSet).every((tagId) => transaction.tags.includes(tagId));
          if (!hasAllTags) return false;
        }

        if (payeeQuery) {
          const payee = transaction.payeeId ? payeeById.get(transaction.payeeId) : undefined;
          const payeeName = payee?.name.toLocaleLowerCase() ?? '';
          if (!payeeName.includes(payeeQuery)) {
            return false;
          }
        }

        const currency = transaction.currency ?? account.currency ?? state.settings.baseCurrency;
        if (currencyFilter && currency.toUpperCase() !== currencyFilter.toUpperCase()) {
          return false;
        }

        const amountForFilter = showBaseAmounts
          ? convertToBase(transaction.nativeAmount ?? transaction.amount, transaction.nativeCurrency ?? currency)
          : transaction.amount;
        if (minAmount !== null && amountForFilter < minAmount) return false;
        if (maxAmount !== null && amountForFilter > maxAmount) return false;

        if (searchQuery) {
          const description = transaction.description?.toLocaleLowerCase() ?? '';
          const memo = transaction.memo?.toLocaleLowerCase() ?? '';
          const payeeName = transaction.payeeId
            ? payeeById.get(transaction.payeeId)?.name.toLocaleLowerCase() ?? ''
            : '';
          if (!description.includes(searchQuery) && !memo.includes(searchQuery) && !payeeName.includes(searchQuery)) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((transaction) => {
        const account = accountById.get(transaction.accountId);
        const category = transaction.categoryId ? categoryById.get(transaction.categoryId) : undefined;
        const subCategory = transaction.subCategoryId ? subCategoryById.get(transaction.subCategoryId) : undefined;
        const payee = transaction.payeeId ? payeeById.get(transaction.payeeId) : undefined;
        const currency = transaction.currency ?? account?.currency ?? state.settings.baseCurrency;
        const displayAmount = showBaseAmounts
          ? convertToBase(transaction.nativeAmount ?? transaction.amount, transaction.nativeCurrency ?? currency)
          : transaction.amount;
        const baseAmount = convertToBase(
          transaction.nativeAmount ?? transaction.amount,
          transaction.nativeCurrency ?? currency
        );
        const tagList = mapTags(tags, transaction.tags);
        const flow = resolveFlowType(transaction, account, category, masterFlowLookup);

        return {
          transaction,
          account,
          category,
          subCategory,
          payee,
          tags: tagList,
          provider: account?.provider ?? 'Unknown',
          flow,
          currency,
          displayAmount,
          baseAmount
        } as TransactionView;
      });
  }, [
    state.transactions,
    accountById,
    categoryById,
    subCategoryById,
    payeeById,
    masterFlowLookup,
    filters,
    showBaseAmounts,
    convertToBase,
    state.settings.baseCurrency,
    tags
  ]);
  useEffect(() => {
    setSelectedTransactionIds((current) =>
      current.filter((id) => transactions.some((view) => view.transaction.id === id))
    );
  }, [transactions]);

  const toggleTransactionSelection = (id: string) => {
    setSelectedTransactionIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const allVisibleSelected =
    transactions.length > 0 && transactions.every((view) => selectedTransactionIds.includes(view.transaction.id));

  const toggleSelectAll = () => {
    setSelectedTransactionIds((current) => {
      if (allVisibleSelected) {
        const visibleIds = new Set(transactions.map((view) => view.transaction.id));
        return current.filter((id) => !visibleIds.has(id));
      }
      const combined = new Set([...current, ...transactions.map((view) => view.transaction.id)]);
      return Array.from(combined);
    });
  };

  const clearFilters = () => setFilters(defaultFilters);

  const clearBudgetContext = () => {
    setBudgetContext(null);
    setFilters(defaultFilters);
  };

  const inspectorView = useMemo(
    () => transactions.find((view) => view.transaction.id === inspectorId) ?? null,
    [transactions, inspectorId]
  );

  const splitTarget = useMemo(
    () => state.transactions.find((txn) => txn.id === splitTargetId) ?? null,
    [state.transactions, splitTargetId]
  );

  const visibleColumns = columnState.order.filter((column) => !columnState.hidden.includes(column));

  const gridTemplateColumns = useMemo(() => {
    const columnWidths = visibleColumns
      .map((column) => {
        const definition = columnDefinitions.find((item) => item.id === column);
        const minWidth = definition?.minWidth ?? 140;
        return `minmax(${minWidth}px, 1fr)`;
      })
      .join(' ');
    return `48px 12px ${columnWidths} 120px`;
  }, [visibleColumns]);

  const handleUpdate = (
    transaction: Transaction,
    updates: Partial<Transaction>,
    entries: { field: string; previous: string | null; next: string | null }[]
  ) => {
    updateTransaction(transaction.id, updates, {
      manual: true,
      user: 'User',
      auditEntries: entries
    });
  };

  const [editingCell, setEditingCell] = useState<{ id: string; column: ColumnId } | null>(null);
  const renderCellContent = (
    column: ColumnId,
    view: TransactionView,
    editing: { id: string; column: ColumnId } | null
  ) => {
    const { transaction } = view;
    switch (column) {
      case 'date':
        return <span>{formatDate(transaction.date)}</span>;
      case 'description':
        return <span>{transaction.description ?? transaction.memo ?? '—'}</span>;
      case 'payee':
        if (editing && editing.id === transaction.id && editing.column === 'payee') {
          return (
            <select
              value={transaction.payeeId ?? ''}
              onChange={(event) => {
                handleUpdate(transaction, { payeeId: event.target.value || null }, [
                  {
                    field: 'payee',
                    previous: transaction.payeeId ?? null,
                    next: event.target.value || null
                  }
                ]);
                setEditingCell(null);
              }}
              onBlur={() => setEditingCell(null)}
            >
              <option value="">Unassigned</option>
              {payees.map((payee) => (
                <option key={payee.id} value={payee.id}>
                  {payee.name}
                </option>
              ))}
            </select>
          );
        }
        return (
          <button type="button" className="link-button" onClick={() => setEditingCell({ id: transaction.id, column: 'payee' })}>
            {view.payee ? view.payee.name : 'Unassigned'}
          </button>
        );
      case 'amount':
        return (
          <div className="amount-cell">
            <strong className={view.displayAmount < 0 ? 'text-negative' : 'text-positive'}>
              {formatCurrency(view.displayAmount, showBaseAmounts ? state.settings.baseCurrency : view.currency)}
            </strong>
            {!showBaseAmounts && transaction.nativeCurrency && transaction.nativeCurrency !== view.currency && (
              <span className="muted-text">
                {formatCurrency(transaction.nativeAmount ?? transaction.amount, transaction.nativeCurrency)}
              </span>
            )}
          </div>
        );
      case 'account':
        return <span>{view.account ? view.account.name : 'Unknown account'}</span>;
      case 'provider':
        return <span>{view.provider}</span>;
      case 'flow':
        return <span>{FLOW_LABELS[view.flow]}</span>;
      case 'category':
        if (editing && editing.id === transaction.id && editing.column === 'category') {
          return (
            <select
              value={buildCategoryOptionValue(transaction.categoryId, transaction.subCategoryId)}
              onChange={(event) => {
                const { categoryId, subCategoryId } = parseCategoryOptionValue(event.target.value);
                handleUpdate(
                  transaction,
                  { categoryId, subCategoryId },
                  [
                    { field: 'category', previous: transaction.categoryId ?? null, next: categoryId ?? null },
                    { field: 'subCategory', previous: transaction.subCategoryId ?? null, next: subCategoryId ?? null }
                  ]
                );
                setEditingCell(null);
              }}
              onBlur={() => setEditingCell(null)}
            >
              <option value="">Uncategorised</option>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          );
        }
        return (
          <button type="button" className="link-button" onClick={() => setEditingCell({ id: transaction.id, column: 'category' })}>
            {view.category ? view.category.name : 'Uncategorised'}
          </button>
        );
      case 'subCategory':
        return <span>{view.subCategory ? view.subCategory.name : '—'}</span>;
      case 'currency':
        return <span>{view.currency}</span>;
      case 'baseAmount':
        return <span>{formatCurrency(view.baseAmount, state.settings.baseCurrency)}</span>;
      case 'tags':
        if (editing && editing.id === transaction.id && editing.column === 'tags') {
          return (
            <select
              multiple
              value={transaction.tags}
              onChange={(event) => {
                const nextTags = Array.from(event.target.selectedOptions, (option) => option.value);
                handleUpdate(transaction, { tags: nextTags }, [
                  { field: 'tags', previous: transaction.tags.join(',') || null, next: nextTags.join(',') || null }
                ]);
              }}
              onBlur={() => setEditingCell(null)}
            >
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          );
        }
        if (view.tags.length === 0) {
          return (
            <button type="button" className="link-button" onClick={() => setEditingCell({ id: transaction.id, column: 'tags' })}>
              Add tags
            </button>
          );
        }
        return (
          <div className="tag-list" onClick={() => setEditingCell({ id: transaction.id, column: 'tags' })}>
            {view.tags.map((tag) => (
              <span key={tag.id} className="tag">
                {tag.name}
              </span>
            ))}
          </div>
        );
      case 'notes':
        if (editing && editing.id === transaction.id && editing.column === 'notes') {
          return (
            <textarea
              value={transaction.memo ?? ''}
              onChange={(event) =>
                handleUpdate(transaction, { memo: event.target.value }, [
                  { field: 'memo', previous: transaction.memo ?? null, next: event.target.value || null }
                ])
              }
              onBlur={() => setEditingCell(null)}
            />
          );
        }
        return (
          <button type="button" className="link-button" onClick={() => setEditingCell({ id: transaction.id, column: 'notes' })}>
            {transaction.memo ? transaction.memo : 'Add note'}
          </button>
        );
      default:
        return null;
    }
  };
  const handleBulkApply = () => {
    if (!bulkAction) return;
    const ids = selectedTransactionIds;
    if (ids.length === 0) return;

    if (bulkAction.type === 'category') {
      const { categoryId, subCategoryId } = parseCategoryOptionValue(bulkAction.value);
      bulkUpdateTransactions(ids, { categoryId, subCategoryId }, {
        manual: true,
        user: 'Bulk edit',
        auditEntries: (existing) => [
          { field: 'category', previous: existing.categoryId ?? null, next: categoryId ?? null },
          { field: 'subCategory', previous: existing.subCategoryId ?? null, next: subCategoryId ?? null }
        ]
      });
    } else if (bulkAction.type === 'payee') {
      bulkUpdateTransactions(ids, { payeeId: bulkAction.value || null }, {
        manual: true,
        user: 'Bulk edit',
        auditEntries: (existing) => [
          { field: 'payee', previous: existing.payeeId ?? null, next: bulkAction.value || null }
        ]
      });
    } else if (bulkAction.type === 'add-tags') {
      ids.forEach((id) => {
        const transaction = state.transactions.find((txn) => txn.id === id);
        if (!transaction) return;
        const nextTags = Array.from(new Set([...transaction.tags, ...bulkAction.value]));
        handleUpdate(transaction, { tags: nextTags }, [
          { field: 'tags', previous: transaction.tags.join(',') || null, next: nextTags.join(',') || null }
        ]);
      });
    } else if (bulkAction.type === 'remove-tags') {
      ids.forEach((id) => {
        const transaction = state.transactions.find((txn) => txn.id === id);
        if (!transaction) return;
        const removal = new Set(bulkAction.value);
        const nextTags = transaction.tags.filter((tagId) => !removal.has(tagId));
        handleUpdate(transaction, { tags: nextTags }, [
          { field: 'tags', previous: transaction.tags.join(',') || null, next: nextTags.join(',') || null }
        ]);
      });
    }

    setBulkAction(null);
    setSelectedTransactionIds([]);
  };

  const handleSplitConfirm = (lines: TransactionSplitLineInput[]): DataActionError | null => {
    if (!splitTarget) {
      return { title: 'Transaction missing', description: 'Unable to split the selected transaction.' };
    }
    const result = splitTransaction(splitTarget.id, lines, 'User');
    if (!result) {
      setSplitTargetId(null);
      setSelectedTransactionIds((current) => current.filter((id) => id !== splitTarget.id));
    }
    return result;
  };

  const handlePreviewSelected = () => {
    if (selectedTransactionIds.length === 0) return;
    const preview = previewRuleRun(selectedTransactionIds);
    setRunPreviewState(preview);
    setPreviewContext({
      transactionIds: selectedTransactionIds,
      description: `${selectedTransactionIds.length} selected transaction${selectedTransactionIds.length === 1 ? '' : 's'}`
    });
    setRunMessage(null);
  };

  const handlePreviewFiltered = () => {
    const filteredIds = transactions.map((view) => view.transaction.id);
    const preview = previewRuleRun(filteredIds);
    setRunPreviewState(preview);
    setPreviewContext({ transactionIds: filteredIds, description: 'Filtered transactions' });
    setRunMessage(null);
  };

  const handleConfirmRun = () => {
    if (!previewContext) return;
    const logEntry = runRules(previewContext.transactionIds, 'manual', previewContext.description);
    if (logEntry) {
      setRunMessage(
        `Rules ran on ${logEntry.transactionCount} transaction${logEntry.transactionCount === 1 ? '' : 's'}.`
      );
    }
    setRunPreviewState(null);
    setPreviewContext(null);
    setSelectedTransactionIds([]);
  };

  const handleCancelPreview = () => {
    setRunPreviewState(null);
    setPreviewContext(null);
  };

  const applyExport = () => {
    const rows: (string | number)[][] = [
      ['Date', 'Description', 'Payee', 'Amount', 'Account', 'Provider', 'Flow', 'Category', 'Sub-category', 'Currency', 'Base amount', 'Tags', 'Notes']
    ];
    transactions.forEach((view) => {
      const transaction = view.transaction;
      const amount = exportMode === 'base'
        ? convertToBase(transaction.nativeAmount ?? transaction.amount, transaction.nativeCurrency ?? view.currency)
        : transaction.amount;
      const currency = exportMode === 'base' ? state.settings.baseCurrency : view.currency;
      rows.push([
        formatDate(transaction.date),
        transaction.description ?? transaction.memo ?? '',
        view.payee ? view.payee.name : '',
        amount.toFixed(2),
        view.account ? view.account.name : '',
        view.provider,
        FLOW_LABELS[view.flow],
        view.category ? view.category.name : '',
        view.subCategory ? view.subCategory.name : '',
        currency,
        formatCurrency(view.baseAmount, state.settings.baseCurrency),
        view.tags.map((tag) => tag.name).join('; '),
        transaction.memo ?? ''
      ]);
    });
    downloadCsv(`transactions-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    setExportOpen(false);
  };
  const handleAddTransaction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const account = accounts.find((acct) => acct.id === addForm.accountId);
    const amount = Number.parseFloat(addForm.amount);
    if (!account || Number.isNaN(amount)) {
      setAddError({
        title: 'Missing details',
        description: 'Provide an account and numeric amount to add a transaction.'
      });
      return;
    }
    addTransaction({
      accountId: account.id,
      payeeId: addForm.payeeId || null,
      date: new Date(addForm.date).toISOString(),
      amount,
      currency: account.currency,
      nativeAmount: amount,
      nativeCurrency: account.currency,
      needsFx: false,
      memo: addForm.memo,
      categoryId: null,
      subCategoryId: null,
      tags: addForm.tags,
      importBatchId: null,
      metadata: undefined,
      isDemo: false
    });
    setAddError(null);
    setAddForm({
      date: new Date().toISOString().slice(0, 10),
      accountId: addForm.accountId,
      payeeId: '',
      amount: '',
      memo: '',
      tags: []
    });
  };

  const providers = useMemo(() => Array.from(new Set(accounts.map((account) => account.provider))).sort(), [accounts]);
  const currencies = useMemo(() => {
    const set = new Set<string>();
    state.transactions.forEach((txn) => {
      set.add((txn.currency ?? state.settings.baseCurrency).toUpperCase());
    });
    return Array.from(set).sort();
  }, [state.transactions, state.settings.baseCurrency]);

  const budgetFlowLabel = budgetContext
    ? FLOW_LABELS[budgetContext.flow as RuleFlowType]
    : '';
  const filterFlowLabel = filters.flowTypes.length
    ? filters.flowTypes.map((type) => FLOW_LABELS[type]).join(', ')
    : 'All flows';
  const categoryFilterName = filters.categoryId
    ? categoryById.get(filters.categoryId)?.name ?? 'Unknown category'
    : 'All categories';
  const subCategoryFilterName = filters.subCategoryId
    ? subCategoryById.get(filters.subCategoryId)?.name ?? 'Unknown sub-category'
    : 'All sub-categories';
  const categorySummary = filters.categoryId
    ? filters.subCategoryId
      ? `${categoryFilterName} → ${subCategoryFilterName}`
      : `${categoryFilterName} → All sub-categories`
    : 'All categories';
  const budgetLineSummary = budgetContext
    ? budgetContext.subLineName
      ? `${budgetContext.lineName} → ${budgetContext.subLineName}`
      : `${budgetContext.lineName} (all sub-categories)`
    : '';
  const budgetPeriodRange = budgetContext
    ? `${formatDate(budgetContext.period.start)} → ${formatDate(budgetContext.period.end)}`
    : '';
  const appliedDateRange = filters.dateFrom || filters.dateTo
    ? `${filters.dateFrom ? formatDate(filters.dateFrom) : 'Any'} → ${filters.dateTo ? formatDate(filters.dateTo) : 'Any'}`
    : 'All dates';
  const accountSummary = summariseNames(filters.accountIds, accountNameLookup, 'All eligible accounts');
  const collectionSummaryText = filters.collectionIds.length
    ? summariseNames(filters.collectionIds, collectionNameLookup, 'Selected collections')
    : '';

  return (
    <div className="content-stack">
      <PageHeader
        title="Transactions"
        description="Review, filter, and edit transactions with full context."
      />

      {budgetContext ? (
        <div className="budget-context-card">
          <div className="budget-context-card__header">
            <div>
              <h4>{budgetContext.budgetName}</h4>
              <p className="muted-text">
                {budgetContext.period.label} · {budgetPeriodRange}
              </p>
              <p className="muted-text">{budgetLineSummary}</p>
            </div>
            <button type="button" className="chip-button" onClick={handleClearBudgetContext}>
              Clear drill-down
            </button>
          </div>
          <div className="budget-context-card__details">
            <div>
              <span className="budget-context-card__label">Flow</span>
              <strong>{budgetFlowLabel}</strong>
              <p className="muted-text">Filter: {filterFlowLabel}</p>
            </div>
            <div>
              <span className="budget-context-card__label">Category</span>
              <strong>{categorySummary}</strong>
              <p className="muted-text">Line: {budgetLineSummary}</p>
            </div>
            <div>
              <span className="budget-context-card__label">Date range</span>
              <strong>{appliedDateRange}</strong>
              <p className="muted-text">Budget period: {budgetPeriodRange}</p>
            </div>
            <div>
              <span className="budget-context-card__label">Accounts</span>
              <strong>{accountSummary}</strong>
              {collectionSummaryText ? (
                <p className="muted-text">Collections: {collectionSummaryText}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="content-card">
        <div className="filter-bar">
          <div className="filter-group">
            <label>
              Date from
              <Tooltip label="Show transactions on or after this date." />
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
              />
            </label>
            <label>
              Date to
              <Tooltip label="Show transactions on or before this date." />
              <input
                type="date"
                value={filters.dateTo}
                onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
              />
            </label>
            <label>
              Accounts
              <Tooltip label="Filter to one or more accounts." />
              <select
                multiple
                value={filters.accountIds}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    accountIds: Array.from(event.target.selectedOptions, (option) => option.value)
                  }))
                }
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Providers
              <Tooltip label="Filter by financial institution or provider." />
              <select
                multiple
                value={filters.providerNames}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    providerNames: Array.from(event.target.selectedOptions, (option) => option.value)
                  }))
                }
              >
                {providers.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Collections
              <Tooltip label="Filter accounts by custom collections." />
              <select
                multiple
                value={filters.collectionIds}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    collectionIds: Array.from(event.target.selectedOptions, (option) => option.value)
                  }))
                }
              >
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="filter-group">
            <label>
              Flow type
              <Tooltip label="Filter by inferred cash flow type." />
              <select
                multiple
                value={filters.flowTypes}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    flowTypes: Array.from(event.target.selectedOptions, (option) => option.value as RuleFlowType)
                  }))
                }
              >
                {(['in', 'out', 'transfer', 'interest', 'fees'] as RuleFlowType[]).map((flow) => (
                  <option key={flow} value={flow}>
                    {FLOW_LABELS[flow]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <Tooltip label="Filter by category assignment." />
              <select
                value={filters.categoryId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    categoryId: event.target.value,
                    subCategoryId: ''
                  }))
                }
              >
                <option value="">All categories</option>
                {state.categories
                  .filter((category) => !category.archived)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Sub-category
              <Tooltip label="Filter by specific sub-category." />
              <select
                value={filters.subCategoryId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    subCategoryId: event.target.value
                  }))
                }
                disabled={!filters.categoryId}
              >
                <option value="">All sub-categories</option>
                {state.subCategories
                  .filter((sub) => !sub.archived && sub.categoryId === filters.categoryId)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Payee search
              <Tooltip label="Search for transactions by payee name." />
              <input
                type="search"
                value={filters.payeeQuery}
                onChange={(event) => setFilters((current) => ({ ...current, payeeQuery: event.target.value }))}
              />
            </label>
            <label>
              Tags
              <Tooltip label="Filter by one or more tags." />
              <select
                multiple
                value={filters.tagIds}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    tagIds: Array.from(event.target.selectedOptions, (option) => option.value)
                  }))
                }
              >
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="filter-group">
            <label>
              Amount min
              <Tooltip label="Minimum amount in the current display currency." />
              <input
                type="number"
                value={filters.minAmount}
                onChange={(event) => setFilters((current) => ({ ...current, minAmount: event.target.value }))}
              />
            </label>
            <label>
              Amount max
              <Tooltip label="Maximum amount in the current display currency." />
              <input
                type="number"
                value={filters.maxAmount}
                onChange={(event) => setFilters((current) => ({ ...current, maxAmount: event.target.value }))}
              />
            </label>
            <label>
              Text search
              <Tooltip label="Search descriptions, notes, and payees." />
              <input
                type="search"
                value={filters.searchText}
                onChange={(event) => setFilters((current) => ({ ...current, searchText: event.target.value }))}
              />
            </label>
            <label>
              Currency
              <Tooltip label="Filter by transaction currency." />
              <select
                value={filters.currency}
                onChange={(event) => setFilters((current) => ({ ...current, currency: event.target.value }))}
              >
                <option value="all">All currencies</option>
                {currencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showBaseAmounts}
                onChange={(event) => setShowBaseAmounts(event.target.checked)}
              />
              <span>
                Show base currency
                <Tooltip label="Convert all amounts using manual exchange rates." />
              </span>
            </label>
            <button type="button" className="secondary-button" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        </div>
        <div className="filter-summary">
          Showing {transactions.length} transaction{transactions.length === 1 ? '' : 's'} in {accounts.length} account
          {accounts.length === 1 ? '' : 's'}.
          <button type="button" className="secondary-button" onClick={() => setColumnManagerOpen(true)}>
            Customise columns
          </button>
          <button type="button" className="secondary-button" onClick={() => setExportOpen(true)}>
            Export CSV
          </button>
        </div>
      </div>
      {selectedTransactionIds.length > 0 && (
        <div className="content-card bulk-toolbar">
          <div>
            <strong>{selectedTransactionIds.length}</strong> selected
          </div>
          <div className="bulk-actions">
            <button type="button" className="secondary-button" onClick={() => setBulkAction({ type: 'category', value: '' })}>
              Set category
            </button>
            <button type="button" className="secondary-button" onClick={() => setBulkAction({ type: 'payee', value: '' })}>
              Set payee
            </button>
            <button type="button" className="secondary-button" onClick={() => setBulkAction({ type: 'add-tags', value: [] })}>
              Add tags
            </button>
            <button type="button" className="secondary-button" onClick={() => setBulkAction({ type: 'remove-tags', value: [] })}>
              Remove tags
            </button>
            <button type="button" className="secondary-button" onClick={handlePreviewSelected}>
              Preview rules
            </button>
          </div>
        </div>
      )}

      <div className="content-card">
        <div className="table-header">
          <div>
            <h3>Transactions</h3>
            <p className="muted-text">{transactions.length} matching the current filters.</p>
          </div>
          <div>
            <button type="button" className="secondary-button" onClick={handlePreviewFiltered}>
              Preview rules for filtered
            </button>
          </div>
        </div>
        <div className="workspace-table">
          <div className="workspace-table-header" style={{ gridTemplateColumns }}>
            <div>
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="Select all" />
            </div>
            <div />
            {visibleColumns.map((column) => {
              const definition = columnDefinitions.find((item) => item.id === column);
              return (
                <div key={column} className={definition?.align === 'right' ? 'align-right' : undefined}>
                  {definition?.label ?? column}
                </div>
              );
            })}
            <div>Actions</div>
          </div>
          <VirtualTableBody
            rows={transactions}
            rowHeight={ROW_HEIGHT}
            renderRow={(view) => {
              const { transaction } = view;
              const metadata = parseWorkspaceMetadata(transaction);
              return (
                <div className="workspace-table-row" style={{ gridTemplateColumns }}>
                  <div>
                    <input
                      type="checkbox"
                      checked={selectedTransactionIds.includes(transaction.id)}
                      onChange={() => toggleTransactionSelection(transaction.id)}
                      aria-label="Select transaction"
                    />
                  </div>
                  <div>{metadata.manuallyEdited && <span className="manual-indicator" title="Manually edited" />}</div>
                  {visibleColumns.map((column) => (
                    <div key={column} className="workspace-cell">
                      {renderCellContent(column, view, editingCell)}
                    </div>
                  ))}
                  <div className="workspace-actions">
                    <button type="button" className="link-button" onClick={() => setInspectorId(transaction.id)}>
                      Inspect
                    </button>
                    <button type="button" className="link-button" onClick={() => setSplitTargetId(transaction.id)}>
                      Split
                    </button>
                    <button type="button" className="link-button" onClick={() => archiveTransaction(transaction.id)}>
                      Archive
                    </button>
                  </div>
                </div>
              );
            }}
          />
        </div>
        {transactions.length === 0 && <p className="muted-text">No transactions for this filter.</p>}
      </div>
      <div className="content-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3>Run rules manually</h3>
        <p className="muted-text">
          Preview before applying. Rules never change amounts, currencies, accounts, or dates.
        </p>
        <div className="rule-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={handlePreviewSelected}
            disabled={selectedTransactionIds.length === 0}
          >
            Preview on selected ({selectedTransactionIds.length})
          </button>
          <button type="button" className="secondary-button" onClick={handlePreviewFiltered}>
            Preview filtered
          </button>
        </div>
        {runPreviewState && previewContext && (
          <div className="rule-preview">
            <h4>Preview summary</h4>
            <p className="muted-text">
              {previewContext.description} — {runPreviewState.transactionCount} transaction
              {runPreviewState.transactionCount === 1 ? '' : 's'}.
            </p>
            {runPreviewState.summaries.length === 0 ? (
              <p>No enabled rules will run for this selection.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Matches</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runPreviewState.summaries.map((summary) => (
                    <tr key={summary.ruleId}>
                      <td>{summary.ruleName}</td>
                      <td>{summary.matched}</td>
                      <td>
                        {summary.actionFields.length === 0
                          ? 'No actions'
                          : summary.actionFields
                              .map((field) => ({
                                category: 'Set category',
                                tags: 'Add tags',
                                payee: 'Set payee',
                                memo: 'Update notes',
                                needsFx: 'Clear FX flag',
                                flow: 'Mark transfer'
                              }[field as RuleActionField]))
                              .join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="rule-actions">
              <button type="button" className="primary-button" onClick={handleConfirmRun}>
                Apply rules
              </button>
              <button type="button" className="secondary-button" onClick={handleCancelPreview}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {runMessage && <p className="muted-text">{runMessage}</p>}
      </div>

      <div className="content-card">
        <h3>Add transaction</h3>
        <form onSubmit={handleAddTransaction} className="form-grid two-column">
          <div className="field">
            <label htmlFor="transaction-date">
              Date
              <Tooltip label="Transaction posting date." />
            </label>
            <input
              id="transaction-date"
              type="date"
              value={addForm.date}
              onChange={(event) => setAddForm((current) => ({ ...current, date: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="transaction-account">
              Account
              <Tooltip label="The account where the transaction belongs." />
            </label>
            <select
              id="transaction-account"
              value={addForm.accountId}
              onChange={(event) => setAddForm((current) => ({ ...current, accountId: event.target.value }))}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="transaction-payee">
              Payee
              <Tooltip label="Pick a payee to apply default categories and notes." />
            </label>
            <select
              id="transaction-payee"
              value={addForm.payeeId}
              onChange={(event) => setAddForm((current) => ({ ...current, payeeId: event.target.value }))}
            >
              <option value="">Unassigned</option>
              {payees.map((payee) => (
                <option key={payee.id} value={payee.id}>
                  {payee.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="transaction-amount">
              Amount
              <Tooltip label="Negative for spending, positive for inflows." />
            </label>
            <input
              id="transaction-amount"
              type="number"
              value={addForm.amount}
              onChange={(event) => setAddForm((current) => ({ ...current, amount: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="transaction-tags">
              Tags
              <Tooltip label="Attach tags for reporting." />
            </label>
            <select
              id="transaction-tags"
              multiple
              value={addForm.tags}
              onChange={(event) =>
                setAddForm((current) => ({
                  ...current,
                  tags: Array.from(event.target.selectedOptions, (option) => option.value)
                }))
              }
            >
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="transaction-memo">
              Memo
              <Tooltip label="Optional note describing the transaction." />
            </label>
            <textarea
              id="transaction-memo"
              value={addForm.memo}
              onChange={(event) => setAddForm((current) => ({ ...current, memo: event.target.value }))}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-button">
              Add transaction
            </button>
          </div>
          {addError && (
            <p role="alert" className="muted-text">
              <strong>{addError.title}:</strong> {addError.description}
            </p>
          )}
        </form>
      </div>
      <ColumnManager
        open={columnManagerOpen}
        onClose={() => setColumnManagerOpen(false)}
        state={columnState}
        onChange={(state) => setColumnState(() => state)}
      />

      {bulkAction && (
        <Modal
          open
          onClose={() => setBulkAction(null)}
          title="Confirm bulk edit"
          actions={
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setBulkAction(null)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={handleBulkApply}>
                Apply changes
              </button>
            </div>
          }
        >
          <p className="muted-text">
            Editing {selectedTransactionIds.length} transaction
            {selectedTransactionIds.length === 1 ? '' : 's'}.
          </p>
          {bulkAction.type === 'category' && (
            <label>
              New category
              <select
                value={bulkAction.value}
                onChange={(event) => setBulkAction({ type: 'category', value: event.target.value })}
              >
                <option value="">Uncategorised</option>
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {bulkAction.type === 'payee' && (
            <label>
              New payee
              <select
                value={bulkAction.value}
                onChange={(event) => setBulkAction({ type: 'payee', value: event.target.value })}
              >
                <option value="">Unassigned</option>
                {payees.map((payee) => (
                  <option key={payee.id} value={payee.id}>
                    {payee.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {bulkAction.type === 'add-tags' && (
            <label>
              Tags to add
              <select
                multiple
                value={bulkAction.value}
                onChange={(event) =>
                  setBulkAction({
                    type: 'add-tags',
                    value: Array.from(event.target.selectedOptions, (option) => option.value)
                  })
                }
              >
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {bulkAction.type === 'remove-tags' && (
            <label>
              Tags to remove
              <select
                multiple
                value={bulkAction.value}
                onChange={(event) =>
                  setBulkAction({
                    type: 'remove-tags',
                    value: Array.from(event.target.selectedOptions, (option) => option.value)
                  })
                }
              >
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </Modal>
      )}

      <SplitTransactionDialog
        open={Boolean(splitTarget)}
        transaction={splitTarget}
        categoryOptions={categoryOptions}
        payees={payees}
        tags={tags}
        onClose={() => setSplitTargetId(null)}
        onConfirm={handleSplitConfirm}
      />

      <InspectorPanel
        open={Boolean(inspectorView)}
        view={inspectorView}
        categoryOptions={categoryOptions}
        payees={payees}
        tags={tags}
        onClose={() => setInspectorId(null)}
        onUpdate={(updates, options) => {
          if (!inspectorView) return;
          const entries = Array.isArray(options.auditEntries)
            ? options.auditEntries
            : typeof options.auditEntries === 'function'
              ? options.auditEntries(inspectorView.transaction)
              : [];
          const normalized = entries.map((entry) => ({
            field: entry.field,
            previous: entry.previous ?? null,
            next: entry.next ?? null
          }));
          handleUpdate(inspectorView.transaction, updates, normalized);
        }}
      />

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export transactions"
        actions={
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setExportOpen(false)}>
              Cancel
            </button>
            <button type="button" className="primary-button" onClick={applyExport}>
              Download CSV
            </button>
          </div>
        }
      >
        <p className="muted-text">Export all currently visible rows with the chosen currency option.</p>
        <label className="toggle">
          <input
            type="radio"
            name="export-mode"
            value="native"
            checked={exportMode === 'native'}
            onChange={() => setExportMode('native')}
          />
          <span>Use native transaction currency</span>
        </label>
        <label className="toggle">
          <input
            type="radio"
            name="export-mode"
            value="base"
            checked={exportMode === 'base'}
            onChange={() => setExportMode('base')}
          />
          <span>Convert to base currency ({state.settings.baseCurrency})</span>
        </label>
      </Modal>
    </div>
  );
};

export default Transactions;
