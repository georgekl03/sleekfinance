import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import {
  Account,
  Category,
  Rule,
  RuleAction,
  RuleActionField,
  RuleCondition,
  RuleFlowType,
  RuleRunLogEntry,
  SubCategory,
  Tag
} from '../data/models';
import { generateId } from '../utils/id';

const cloneRule = (rule: Rule): Rule => ({
  ...rule,
  conditions: rule.conditions.map((condition) => ({ ...condition })),
  actions: rule.actions.map((action) => ({ ...action }))
});

const createConditionForType = (type: RuleCondition['type']): RuleCondition => {
  switch (type) {
    case 'description':
      return { id: generateId('cond'), type, operator: 'contains', value: '' };
    case 'payee':
      return { id: generateId('cond'), type, operator: 'contains', value: '' };
    case 'amount':
      return { id: generateId('cond'), type, operator: 'equals', value: 0 };
    case 'dateRange':
      return { id: generateId('cond'), type, start: null, end: null };
    case 'account':
      return { id: generateId('cond'), type, accountIds: [] };
    case 'provider':
      return { id: generateId('cond'), type, providers: [] };
    case 'category-empty':
      return { id: generateId('cond'), type, level: 'category' };
    case 'category':
      return { id: generateId('cond'), type, categoryId: '', subCategoryId: null };
    case 'flow':
      return { id: generateId('cond'), type, flow: 'in' };
    case 'tag':
      return { id: generateId('cond'), type, tagId: '' };
    default:
      return { id: generateId('cond'), type: 'description', operator: 'contains', value: '' };
  }
};

const createActionForType = (type: RuleAction['type']): RuleAction => {
  switch (type) {
    case 'set-category':
      return { id: generateId('act'), type, categoryId: '', subCategoryId: null };
    case 'add-tags':
      return { id: generateId('act'), type, tagIds: [] };
    case 'set-payee':
      return { id: generateId('act'), type, payeeName: '' };
    case 'mark-transfer':
      return { id: generateId('act'), type };
    case 'prepend-memo':
      return { id: generateId('act'), type, prefix: '' };
    case 'clear-needs-fx':
      return { id: generateId('act'), type };
    default:
      return { id: generateId('act'), type: 'mark-transfer' };
  }
};

const actionFieldLabels: Record<RuleActionField, string> = {
  category: 'Set category',
  tags: 'Add tags',
  payee: 'Set payee',
  memo: 'Update notes',
  needsFx: 'Clear FX flag',
  flow: 'Mark transfer'
};

const flowOptions: { id: RuleFlowType; label: string }[] = [
  { id: 'in', label: 'In' },
  { id: 'out', label: 'Out' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'interest', label: 'Interest' },
  { id: 'fees', label: 'Fees' }
];

const describeCondition = (
  condition: RuleCondition,
  accounts: Map<string, Account>,
  categories: Map<string, Category>,
  subCategories: Map<string, SubCategory>,
  tags: Map<string, Tag>
) => {
  switch (condition.type) {
    case 'description':
      return `Description ${condition.operator.replace(/([A-Z])/g, ' $1').toLowerCase()} "${condition.value}"`;
    case 'payee':
      return `Payee ${condition.operator === 'equals' ? 'equals' : 'contains'} "${condition.value}"`;
    case 'amount':
      if (condition.operator === 'between' && condition.secondaryValue !== undefined) {
        return `Amount between ${condition.value} and ${condition.secondaryValue}`;
      }
      return `Amount ${condition.operator.replace('Than', ' than')} ${condition.value}`;
    case 'dateRange':
      if (condition.start && condition.end) {
        return `Date between ${condition.start} and ${condition.end}`;
      }
      if (condition.start) {
        return `Date on or after ${condition.start}`;
      }
      if (condition.end) {
        return `Date on or before ${condition.end}`;
      }
      return 'Any date';
    case 'account': {
      if (!condition.accountIds.length) return 'Account not set';
      const names = condition.accountIds
        .map((id) => accounts.get(id)?.name ?? 'Unknown account')
        .join(', ');
      return `Account is ${names}`;
    }
    case 'provider':
      if (!condition.providers.length) return 'Provider not set';
      return `Provider is ${condition.providers.join(', ')}`;
    case 'category-empty':
      return condition.level === 'category' ? 'Category is empty' : 'Sub-category is empty';
    case 'category': {
      const category = categories.get(condition.categoryId)?.name ?? 'Unknown category';
      const sub = condition.subCategoryId
        ? subCategories.get(condition.subCategoryId)?.name ?? 'Unknown sub-category'
        : null;
      return sub ? `Category is ${category} › ${sub}` : `Category is ${category}`;
    }
    case 'flow':
      return `Flow is ${condition.flow}`;
    case 'tag': {
      const tag = tags.get(condition.tagId)?.name ?? 'Unknown tag';
      return `Tagged with ${tag}`;
    }
    default:
      return 'Condition';
  }
};

const describeAction = (
  action: RuleAction,
  categories: Map<string, Category>,
  subCategories: Map<string, SubCategory>,
  tags: Map<string, Tag>
) => {
  switch (action.type) {
    case 'set-category': {
      const category = categories.get(action.categoryId)?.name ?? 'Unknown category';
      const sub = action.subCategoryId
        ? subCategories.get(action.subCategoryId)?.name ?? 'Unknown sub-category'
        : null;
      return sub ? `Set category to ${category} › ${sub}` : `Set category to ${category}`;
    }
    case 'add-tags': {
      if (!action.tagIds.length) return 'Add tags';
      const names = action.tagIds.map((id) => tags.get(id)?.name ?? 'Unknown tag').join(', ');
      return `Add tags ${names}`;
    }
    case 'set-payee':
      return action.payeeName ? `Set payee to "${action.payeeName}"` : 'Set payee';
    case 'mark-transfer':
      return 'Mark as transfer';
    case 'prepend-memo':
      return action.prefix ? `Prefix notes with "${action.prefix}"` : 'Prefix notes';
    case 'clear-needs-fx':
      return 'Clear FX flag';
    default:
      return 'Action';
  }
};

const renderSummary = (
  rule: Rule,
  accounts: Map<string, Account>,
  categories: Map<string, Category>,
  subCategories: Map<string, SubCategory>,
  tags: Map<string, Tag>
) => {
  if (!rule.conditions.length && !rule.actions.length) {
    return 'No conditions or actions configured yet.';
  }
  const conditionText = rule.conditions.length
    ? `${rule.matchType === 'all' ? 'Match all' : 'Match any'}: ${describeCondition(
        rule.conditions[0],
        accounts,
        categories,
        subCategories,
        tags
      )}${rule.conditions.length > 1 ? ` (+${rule.conditions.length - 1} more)` : ''}`
    : 'Applies to all transactions';
  const actionText = rule.actions.length
    ? `${describeAction(rule.actions[0], categories, subCategories, tags)}${
        rule.actions.length > 1 ? ` (+${rule.actions.length - 1} more)` : ''
      }`
    : 'No actions yet';
  return `${conditionText} → ${actionText}`;
};

const renderLogSummary = (entry: RuleRunLogEntry) => {
  if (!entry.summaries.length) {
    return 'No enabled rules were run.';
  }
  return entry.summaries
    .map((summary) => {
      if (!summary.actionFields.length) {
        return `${summary.ruleName} matched ${summary.matched} transaction(s) with no actions.`;
      }
      const actions = summary.actionFields.map((field) => actionFieldLabels[field]).join(', ');
      return `${summary.ruleName}: ${summary.matched} matched, actions: ${actions}`;
    })
    .join(' ');
};

const Rules = () => {
  const {
    state,
    createRule,
    saveRule,
    duplicateRule,
    setRuleEnabled,
    archiveRule,
    restoreRule
  } = useData();

  const accountsById = useMemo(
    () => new Map<string, Account>(state.accounts.map((account) => [account.id, account])),
    [state.accounts]
  );
  const categoriesById = useMemo(
    () => new Map<string, Category>(state.categories.map((category) => [category.id, category])),
    [state.categories]
  );
  const subCategoriesById = useMemo(
    () => new Map<string, SubCategory>(state.subCategories.map((sub) => [sub.id, sub])),
    [state.subCategories]
  );
  const tagsById = useMemo(
    () => new Map<string, Tag>(state.tags.map((tag) => [tag.id, tag])),
    [state.tags]
  );

  const activeRules = useMemo(
    () =>
      [...state.rules]
        .filter((rule) => !rule.archived)
        .sort((a, b) => (a.priority === b.priority ? a.name.localeCompare(b.name) : a.priority - b.priority)),
    [state.rules]
  );

  const archivedRules = useMemo(
    () => [...state.rules].filter((rule) => rule.archived),
    [state.rules]
  );

  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(activeRules[0]?.id ?? null);
  const selectedRule = useMemo(
    () => state.rules.find((rule) => rule.id === selectedRuleId) ?? null,
    [selectedRuleId, state.rules]
  );
  const [draft, setDraft] = useState<Rule | null>(selectedRule ? cloneRule(selectedRule) : null);

  useEffect(() => {
    if (selectedRule) {
      setDraft(cloneRule(selectedRule));
    } else {
      setDraft(null);
    }
  }, [selectedRuleId, selectedRule]);

  const handleSelectRule = (rule: Rule) => {
    setSelectedRuleId(rule.id);
  };

  const handleCreateRule = () => {
    const rule = createRule();
    setSelectedRuleId(rule.id);
    setDraft(cloneRule(rule));
  };

  const handleDuplicateRule = (rule: Rule) => {
    const clone = duplicateRule(rule.id);
    if (clone) {
      setSelectedRuleId(clone.id);
      setDraft(cloneRule(clone));
    }
  };

  const handleToggleEnabled = (rule: Rule, enabled: boolean) => {
    setRuleEnabled(rule.id, enabled);
  };

  const handleFieldChange = (updater: (current: Rule) => Rule) => {
    setDraft((current) => (current ? updater(current) : current));
  };

  const handleSave = () => {
    if (!draft) return;
    saveRule(draft);
  };

  const handleReset = () => {
    if (selectedRule) {
      setDraft(cloneRule(selectedRule));
    }
  };

  const handleArchive = () => {
    if (selectedRule) {
      archiveRule(selectedRule.id);
      setSelectedRuleId(null);
    }
  };

  const availableAccounts = useMemo(
    () => state.accounts.filter((account) => !account.archived),
    [state.accounts]
  );
  const availableProviders = useMemo(
    () => Array.from(new Set(state.accounts.map((account) => account.provider))).sort(),
    [state.accounts]
  );
  const availableCategories = useMemo(
    () => state.categories.filter((category) => !category.archived && !category.mergedIntoId),
    [state.categories]
  );
  const availableSubCategories = useMemo(
    () => state.subCategories.filter((sub) => !sub.archived && !sub.mergedIntoId),
    [state.subCategories]
  );
  const availableTags = useMemo(
    () => state.tags.filter((tag) => !tag.archived),
    [state.tags]
  );

  const handleConditionTypeChange = (index: number, type: RuleCondition['type']) => {
    handleFieldChange((current) => {
      const nextConditions = current.conditions.slice();
      nextConditions[index] = createConditionForType(type);
      return { ...current, conditions: nextConditions };
    });
  };

  const handleConditionUpdate = (index: number, condition: RuleCondition) => {
    handleFieldChange((current) => {
      const nextConditions = current.conditions.slice();
      nextConditions[index] = condition;
      return { ...current, conditions: nextConditions };
    });
  };

  const handleRemoveCondition = (index: number) => {
    handleFieldChange((current) => {
      const nextConditions = current.conditions.slice();
      nextConditions.splice(index, 1);
      return { ...current, conditions: nextConditions };
    });
  };

  const handleActionTypeChange = (index: number, type: RuleAction['type']) => {
    handleFieldChange((current) => {
      const nextActions = current.actions.slice();
      nextActions[index] = createActionForType(type);
      return { ...current, actions: nextActions };
    });
  };

  const handleActionUpdate = (index: number, action: RuleAction) => {
    handleFieldChange((current) => {
      const nextActions = current.actions.slice();
      nextActions[index] = action;
      return { ...current, actions: nextActions };
    });
  };

  const handleRemoveAction = (index: number) => {
    handleFieldChange((current) => {
      const nextActions = current.actions.slice();
      nextActions.splice(index, 1);
      return { ...current, actions: nextActions };
    });
  };

  const renderConditionInputs = (condition: RuleCondition, index: number) => {
    switch (condition.type) {
      case 'description':
        return (
          <div className="field-row">
            <label>
              Mode
              <select
                value={condition.operator}
                onChange={(event) =>
                  handleConditionUpdate(index, { ...condition, operator: event.target.value as typeof condition.operator })
                }
              >
                <option value="contains">Contains</option>
                <option value="startsWith">Starts with</option>
                <option value="equals">Equals</option>
              </select>
            </label>
            <label>
              Text
              <input
                type="text"
                value={condition.value}
                onChange={(event) => handleConditionUpdate(index, { ...condition, value: event.target.value })}
              />
            </label>
          </div>
        );
      case 'payee':
        return (
          <div className="field-row">
            <label>
              Mode
              <select
                value={condition.operator}
                onChange={(event) =>
                  handleConditionUpdate(index, { ...condition, operator: event.target.value as typeof condition.operator })
                }
              >
                <option value="contains">Contains</option>
                <option value="equals">Equals</option>
              </select>
            </label>
            <label>
              Name
              <input
                type="text"
                value={condition.value}
                onChange={(event) => handleConditionUpdate(index, { ...condition, value: event.target.value })}
              />
            </label>
          </div>
        );
      case 'amount':
        return (
          <div className="field-row">
            <label>
              Compare
              <select
                value={condition.operator}
                onChange={(event) =>
                  handleConditionUpdate(index, { ...condition, operator: event.target.value as typeof condition.operator })
                }
              >
                <option value="equals">Equals</option>
                <option value="greaterThan">Greater than</option>
                <option value="lessThan">Less than</option>
                <option value="between">Between</option>
              </select>
            </label>
            <label>
              Value
              <input
                type="number"
                value={condition.value}
                onChange={(event) =>
                  handleConditionUpdate(index, { ...condition, value: Number(event.target.value) })
                }
              />
            </label>
            {condition.operator === 'between' && (
              <label>
                And
                <input
                  type="number"
                  value={condition.secondaryValue ?? condition.value}
                  onChange={(event) =>
                    handleConditionUpdate(index, {
                      ...condition,
                      secondaryValue: Number(event.target.value)
                    })
                  }
                />
              </label>
            )}
          </div>
        );
      case 'dateRange':
        return (
          <div className="field-row">
            <label>
              Start
              <input
                type="date"
                value={condition.start ?? ''}
                onChange={(event) => handleConditionUpdate(index, { ...condition, start: event.target.value || null })}
              />
            </label>
            <label>
              End
              <input
                type="date"
                value={condition.end ?? ''}
                onChange={(event) => handleConditionUpdate(index, { ...condition, end: event.target.value || null })}
              />
            </label>
          </div>
        );
      case 'account':
        return (
          <label>
            Accounts
            <select
              multiple
              value={condition.accountIds}
              onChange={(event) =>
                handleConditionUpdate(index, {
                  ...condition,
                  accountIds: Array.from(event.target.selectedOptions, (option) => option.value)
                })
              }
            >
              {availableAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        );
      case 'provider':
        return (
          <label>
            Providers
            <select
              multiple
              value={condition.providers}
              onChange={(event) =>
                handleConditionUpdate(index, {
                  ...condition,
                  providers: Array.from(event.target.selectedOptions, (option) => option.value)
                })
              }
            >
              {availableProviders.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </label>
        );
      case 'category-empty':
        return (
          <label>
            Level
            <select
              value={condition.level}
              onChange={(event) =>
                handleConditionUpdate(index, { ...condition, level: event.target.value as typeof condition.level })
              }
            >
              <option value="category">Category</option>
              <option value="sub-category">Sub-category</option>
            </select>
          </label>
        );
      case 'category':
        return (
          <div className="field-row">
            <label>
              Category
              <select
                value={condition.categoryId}
                onChange={(event) =>
                  handleConditionUpdate(index, {
                    ...condition,
                    categoryId: event.target.value,
                    subCategoryId: null
                  })
                }
              >
                <option value="">Select category</option>
                {availableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sub-category
              <select
                value={condition.subCategoryId ?? ''}
                onChange={(event) =>
                  handleConditionUpdate(index, {
                    ...condition,
                    subCategoryId: event.target.value || null
                  })
                }
              >
                <option value="">Any sub-category</option>
                {availableSubCategories
                  .filter((sub) => sub.categoryId === condition.categoryId)
                  .map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        );
      case 'flow':
        return (
          <label>
            Flow
            <select
              value={condition.flow}
              onChange={(event) =>
                handleConditionUpdate(index, { ...condition, flow: event.target.value as RuleFlowType })
              }
            >
              {flowOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        );
      case 'tag':
        return (
          <label>
            Tag
            <select
              value={condition.tagId}
              onChange={(event) => handleConditionUpdate(index, { ...condition, tagId: event.target.value })}
            >
              <option value="">Select tag</option>
              {availableTags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
        );
      default:
        return null;
    }
  };

  const renderActionInputs = (action: RuleAction, index: number) => {
    switch (action.type) {
      case 'set-category':
        return (
          <div className="field-row">
            <label>
              Category
              <select
                value={action.categoryId}
                onChange={(event) =>
                  handleActionUpdate(index, {
                    ...action,
                    categoryId: event.target.value,
                    subCategoryId: null
                  })
                }
              >
                <option value="">Select category</option>
                {availableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sub-category
              <select
                value={action.subCategoryId ?? ''}
                onChange={(event) =>
                  handleActionUpdate(index, {
                    ...action,
                    subCategoryId: event.target.value || null
                  })
                }
              >
                <option value="">Leave unset</option>
                {availableSubCategories
                  .filter((sub) => sub.categoryId === action.categoryId)
                  .map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        );
      case 'add-tags':
        return (
          <label>
            Tags
            <select
              multiple
              value={action.tagIds}
              onChange={(event) =>
                handleActionUpdate(index, {
                  ...action,
                  tagIds: Array.from(event.target.selectedOptions, (option) => option.value)
                })
              }
            >
              {availableTags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
        );
      case 'set-payee':
        return (
          <label>
            Payee name
            <input
              type="text"
              value={action.payeeName}
              onChange={(event) => handleActionUpdate(index, { ...action, payeeName: event.target.value })}
            />
          </label>
        );
      case 'prepend-memo':
        return (
          <label>
            Note prefix
            <input
              type="text"
              value={action.prefix}
              onChange={(event) => handleActionUpdate(index, { ...action, prefix: event.target.value })}
            />
          </label>
        );
      default:
        return <p className="muted-text">No additional settings.</p>;
    }
  };

  const ruleLogs = useMemo(() => state.ruleLogs.slice(0, 20), [state.ruleLogs]);

  return (
    <div className="content-stack">
      <PageHeader
        title="Rules"
        description="Create sequential rules to auto-categorise and tag transactions across accounts and providers."
      />
      <div className="content-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'row', gap: '1.5rem', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 40%', maxWidth: '32rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Rule library</h3>
              <button type="button" className="primary-button" onClick={handleCreateRule}>
                New rule
              </button>
            </div>
            <p className="muted-text">
              Lower priority numbers run first. Disable a rule to keep its configuration without applying it.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {activeRules.map((rule) => (
                <li
                  key={rule.id}
                  style={{
                    border: '1px solid var(--border-muted)',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    backgroundColor: rule.id === selectedRuleId ? 'var(--surface-raised)' : 'var(--surface)' ,
                    cursor: 'pointer'
                  }}
                  onClick={() => handleSelectRule(rule)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <div>
                      <strong>{rule.name}</strong>
                      <p className="muted-text" style={{ marginTop: '0.25rem' }}>
                        {renderSummary(rule, accountsById, categoriesById, subCategoriesById, tagsById)}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '8rem' }}>
                      <label style={{ display: 'block', fontSize: '0.875rem' }}>
                        Priority {rule.priority}
                        <Tooltip label="Lower priority numbers run earlier during a rule pass." />
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}>
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(event) => {
                            event.stopPropagation();
                            handleToggleEnabled(rule, event.target.checked);
                          }}
                        />
                        Enabled
                        <Tooltip label="Disable to skip this rule during automatic and manual runs." />
                      </label>
                    </div>
                  </div>
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDuplicateRule(rule);
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        archiveRule(rule.id);
                      }}
                    >
                      Archive
                    </button>
                  </div>
                </li>
              ))}
              {activeRules.length === 0 && (
                <li className="muted-text">No active rules yet. Create one to get started.</li>
              )}
            </ul>
            {archivedRules.length > 0 && (
              <details style={{ marginTop: '1rem' }}>
                <summary>Archived rules</summary>
                <ul style={{ listStyle: 'none', paddingLeft: 0, marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {archivedRules.map((rule) => (
                    <li
                      key={rule.id}
                      style={{
                        border: '1px dashed var(--border-muted)',
                        borderRadius: '0.5rem',
                        padding: '0.5rem 0.75rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span>{rule.name}</span>
                      <button type="button" className="link-button" onClick={() => restoreRule(rule.id)}>
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <div style={{ flex: '1 1 60%' }}>
            <h3>Rule editor</h3>
            {draft ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label>
                  Name
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(event) => handleFieldChange((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <div className="field-row">
                  <label>
                    Priority
                    <Tooltip label="Rules execute in ascending order. Use smaller numbers to run earlier." />
                    <input
                      type="number"
                      value={draft.priority}
                      onChange={(event) =>
                        handleFieldChange((current) => ({
                          ...current,
                          priority: Number.parseInt(event.target.value, 10) || 0
                        }))
                      }
                    />
                  </label>
                  <label style={{ alignSelf: 'flex-end' }}>
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(event) =>
                        handleFieldChange((current) => ({ ...current, enabled: event.target.checked }))
                      }
                    />
                    Enabled for future runs
                    <Tooltip label="Turn off to pause this rule without deleting it." />
                  </label>
                </div>
                <label>
                  Matching mode
                  <select
                    value={draft.matchType}
                    onChange={(event) =>
                      handleFieldChange((current) => ({
                        ...current,
                        matchType: event.target.value as Rule['matchType']
                      }))
                    }
                  >
                    <option value="all">Match all conditions</option>
                    <option value="any">Match any condition</option>
                  </select>
                </label>
                <section>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <h4 style={{ margin: 0 }}>Conditions</h4>
                    <Tooltip label="Conditions determine which transactions the rule applies to." />
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        handleFieldChange((current) => ({
                          ...current,
                          conditions: [...current.conditions, createConditionForType('description')]
                        }))
                      }
                    >
                      Add condition
                    </button>
                  </div>
                  {draft.conditions.length === 0 && (
                    <p className="muted-text">No conditions. The rule will apply to every transaction.</p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {draft.conditions.map((condition, index) => (
                      <div key={condition.id} style={{ border: '1px solid var(--border-muted)', borderRadius: '0.5rem', padding: '0.75rem' }}>
                        <div className="field-row" style={{ alignItems: 'center' }}>
                          <label>
                            Type
                            <select
                              value={condition.type}
                              onChange={(event) => handleConditionTypeChange(index, event.target.value as RuleCondition['type'])}
                            >
                              <option value="description">Description</option>
                              <option value="payee">Payee name</option>
                              <option value="amount">Amount</option>
                              <option value="dateRange">Date range</option>
                              <option value="account">Account</option>
                              <option value="provider">Provider</option>
                              <option value="category-empty">Category empty</option>
                              <option value="category">Category equals</option>
                              <option value="flow">Flow type</option>
                              <option value="tag">Has tag</option>
                            </select>
                          </label>
                          <button type="button" className="link-button" onClick={() => handleRemoveCondition(index)}>
                            Remove
                          </button>
                        </div>
                        {renderConditionInputs(condition, index)}
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <h4 style={{ margin: 0 }}>Actions</h4>
                    <Tooltip label="Actions run when the rule matches. The first action affecting a field wins." />
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        handleFieldChange((current) => ({
                          ...current,
                          actions: [...current.actions, createActionForType('set-category')]
                        }))
                      }
                    >
                      Add action
                    </button>
                  </div>
                  {draft.actions.length === 0 && (
                    <p className="muted-text">No actions defined. Matching transactions will not be changed.</p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {draft.actions.map((action, index) => (
                      <div key={action.id} style={{ border: '1px solid var(--border-muted)', borderRadius: '0.5rem', padding: '0.75rem' }}>
                        <div className="field-row" style={{ alignItems: 'center' }}>
                          <label>
                            Type
                            <select
                              value={action.type}
                              onChange={(event) => handleActionTypeChange(index, event.target.value as RuleAction['type'])}
                            >
                              <option value="set-category">Set category</option>
                              <option value="add-tags">Add tags</option>
                              <option value="set-payee">Set payee</option>
                              <option value="mark-transfer">Mark transfer</option>
                              <option value="prepend-memo">Prefix notes</option>
                              <option value="clear-needs-fx">Clear FX flag</option>
                            </select>
                          </label>
                          <button type="button" className="link-button" onClick={() => handleRemoveAction(index)}>
                            Remove
                          </button>
                        </div>
                        {renderActionInputs(action, index)}
                      </div>
                    ))}
                  </div>
                  <p className="muted-text" style={{ marginTop: '0.5rem' }}>
                    Fields edited by earlier actions or rules will not be overwritten later in the same run.
                    <Tooltip label="Only the first action touching a field applies. Later rules respect the previous change." />
                  </p>
                </section>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button type="button" className="primary-button" onClick={handleSave}>
                    Save changes
                  </button>
                  <button type="button" className="secondary-button" onClick={handleReset}>
                    Reset
                  </button>
                  <button type="button" className="link-button" onClick={handleArchive}>
                    Archive rule
                  </button>
                </div>
              </div>
            ) : (
              <p className="muted-text">Select a rule to edit or create a new one.</p>
            )}
          </div>
        </div>
        <section>
          <h3>Recent rule runs</h3>
          {ruleLogs.length === 0 ? (
            <p className="muted-text">Runs will appear here after automatic imports or manual rule runs.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {ruleLogs.map((log) => (
                <li key={log.id} style={{ border: '1px solid var(--border-muted)', borderRadius: '0.5rem', padding: '0.75rem' }}>
                  <strong>
                    {new Date(log.runAt).toLocaleString()} — {log.mode === 'auto' ? 'Automatic' : 'Manual'} run
                    {log.source ? ` (${log.source})` : ''}
                  </strong>
                  <p className="muted-text" style={{ margin: '0.25rem 0' }}>
                    Scanned {log.transactionCount} transaction(s).
                  </p>
                  <p style={{ margin: 0 }}>{renderLogSummary(log)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default Rules;
